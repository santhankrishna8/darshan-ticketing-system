import { gunzipSync, inflateSync, unzlibSync } from 'fflate';
import { AadhaarDetails, Gender, QrKind } from './aadhaar.types';
import { isValidAadhaar } from './verhoeff';

/**
 * Parse the text of an Aadhaar QR code.
 *
 * Two formats are in circulation:
 *  - Secure QR (cards and e-Aadhaar from 2019 on): a long decimal number that is a
 *    big-endian integer of gzip-compressed, 0xFF-delimited fields. It carries only the
 *    last four digits of the Aadhaar number.
 *  - Old QR (older letters): an XML <PrintLetterBarcodeData .../> element with the full number.
 */
export function parseAadhaarQr(text: string): { kind: QrKind; details: AadhaarDetails } | null {
  const trimmed = text.trim();
  if (/^\d{100,}$/.test(trimmed)) {
    const details = parseSecureQr(trimmed);
    return details ? { kind: 'secure', details } : null;
  }
  if (trimmed.startsWith('<') || /PrintLetterBarcodeData|QPDB/i.test(trimmed)) {
    const details = parseXmlQr(trimmed);
    return details ? { kind: 'xml', details } : null;
  }
  return null;
}

function bigIntToBytes(numeric: string): Uint8Array {
  let hex = BigInt(numeric).toString(16);
  if (hex.length % 2) hex = '0' + hex;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function decompress(bytes: Uint8Array): Uint8Array | null {
  for (const fn of [gunzipSync, unzlibSync, inflateSync]) {
    try {
      return fn(bytes);
    } catch {
      /* try the next container format */
    }
  }
  return null;
}

export function parseSecureQr(numeric: string): AadhaarDetails | null {
  let raw: Uint8Array | null;
  try {
    raw = decompress(bigIntToBytes(numeric));
  } catch {
    return null;
  }
  if (!raw) return null;

  // Text fields come first; the photo and signature follow. 18 delimiters cover every text field.
  const fields: string[] = [];
  const decoder = new TextDecoder('utf-8');
  let start = 0;
  for (let i = 0; i < raw.length && fields.length < 18; i++) {
    if (raw[i] === 255) {
      fields.push(decoder.decode(raw.subarray(start, i)).trim());
      start = i + 1;
    }
  }
  if (fields.length < 16) return null;

  const o = /^V\d+$/.test(fields[0]) ? 1 : 0;
  const f = (k: number) => fields[o + k] ?? '';
  const referenceId = f(1);
  const details: AadhaarDetails = {
    name: cleanName(f(2)),
    dob: normalizeDate(f(3)),
    gender: normalizeGender(f(4)),
    careOf: f(5) || undefined,
    pincode: /^\d{6}$/.test(f(10)) ? f(10) : undefined,
    address: joinAddress([f(8), f(13), f(7), f(9), f(15), f(11), f(14), f(6), f(12)], f(10)),
  };
  if (/^\d{4}/.test(referenceId)) details.aadhaarLast4 = referenceId.slice(0, 4);
  if (!details.name) return null;
  return prune(details);
}

export function parseXmlQr(xml: string): AadhaarDetails | null {
  const attrs: Record<string, string> = {};
  for (const m of xml.matchAll(/([A-Za-z_]+)\s*=\s*"([^"]*)"/g)) attrs[m[1].toLowerCase()] = decodeEntities(m[2]).trim();
  const get = (...keys: string[]) => keys.map(k => attrs[k]).find(v => v) ?? '';

  const uid = get('uid', 'u').replace(/\s/g, '');
  const yob = get('yob', 'y');
  const pc = get('pc', 'pincode');
  const details: AadhaarDetails = {
    name: cleanName(get('name', 'n')),
    gender: normalizeGender(get('gender', 'g')),
    dob: normalizeDate(get('dob', 'd')),
    yearOfBirth: /^\d{4}$/.test(yob) ? +yob : undefined,
    careOf: get('co') || undefined,
    pincode: /^\d{6}$/.test(pc) ? pc : undefined,
    address:
      get('a', 'address') ||
      joinAddress([get('house'), get('street'), get('lm'), get('loc'), get('vtc'), get('po'), get('subdist'), get('dist'), get('state')], pc),
  };
  if (isValidAadhaar(uid)) details.aadhaar = uid;
  else if (/\d{4}$/.test(uid)) details.aadhaarLast4 = uid.slice(-4);
  if (!details.yearOfBirth && details.dob) details.yearOfBirth = +details.dob.slice(-4);
  if (!details.name) return null;
  return prune(details);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** Accepts DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY or YYYY-MM-DD; returns DD/MM/YYYY. */
export function normalizeDate(value: string): string | undefined {
  const v = value.trim();
  let d: number, m: number, y: number;
  let match = v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (match) [d, m, y] = [+match[1], +match[2], +match[3]];
  else if ((match = v.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/))) [y, m, d] = [+match[1], +match[2], +match[3]];
  else return undefined;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > new Date().getFullYear()) return undefined;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

export function normalizeGender(value: string): Gender | undefined {
  const v = value.trim().toUpperCase();
  if (v === 'F' || v === 'FEMALE') return 'Female';
  if (v === 'M' || v === 'MALE') return 'Male';
  if (v === 'T' || v === 'TRANSGENDER') return 'Transgender';
  return undefined;
}

/** Title-case a name and drop anything that is not a letter, space or dot. */
export function cleanName(value: string): string | undefined {
  const words = value
    .replace(/[^A-Za-z. ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(w => (w === w.toUpperCase() || w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w));
  const name = words.join(' ').trim();
  return name.length >= 2 ? name : undefined;
}

function joinAddress(parts: string[], pincode: string): string | undefined {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const raw of parts) {
    const p = raw.trim().replace(/,+$/, '');
    const key = p.toLowerCase();
    if (!p || seen.has(key)) continue;
    seen.add(key);
    kept.push(p);
  }
  let address = kept.join(', ');
  if (/^\d{6}$/.test(pincode)) address = address ? `${address} - ${pincode}` : pincode;
  return address || undefined;
}

function prune<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined || o[k] === '') delete o[k];
  return o;
}

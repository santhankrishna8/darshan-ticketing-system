import { AadhaarDetails, Gender } from './aadhaar.types';
import { cleanName, normalizeDate } from './aadhaar-qr';
import { isValidAadhaar } from './verhoeff';

/**
 * Pull Aadhaar fields out of OCR text.
 *
 * OCR on a phone photo is noisy: Telugu lines come out as garbage, columns get merged,
 * and digits are occasionally misread. So every field is found by pattern, the Aadhaar
 * number must pass its Verhoeff checksum, and the name is chosen by scoring candidates
 * against where names sit on the card (above the DOB line, or below "To" on a letter).
 * The text may hold several OCR passes concatenated; repeated readings count as votes.
 */
export interface TextParse {
  details: AadhaarDetails;
  aadhaarVerified: boolean;
}

const NOT_NAME_WORDS = new Set(
  (
    'government of india unique identification authority aadhaar aadhar adhaar enrolment enrollment no number your ' +
    'address male female transgender dob birth year date father husband mother information signature valid digitally signed ' +
    'download generation issued issue vid help proof identity citizenship verification online offline scanning code qr xml ' +
    'authenticate establish note children attaining years age update biometric throughout country helpful availing services ' +
    'future non and the is to for with it should be used or not my identity print letter card mera meri pehchaan ' +
    'andhra pradesh telangana tamil nadu karnataka kerala maharashtra odisha district mandal rural urban village post office ' +
    'road street nagar colony tirupati chittoor state pin pincode mobile phone email www gov in'
  ).split(' '),
);

const RELATION = /\b(?:[SDWC]\s?[\/|1Il]\s?[O0o]|Father|Husband|Mother|Guardian)\b\s*[:\-.]?\s*/i;

export function parseAadhaarText(text: string): TextParse {
  const lines = splitLines(text);
  const details: AadhaarDetails = {};

  const { aadhaar, verified } = findAadhaar(lines);
  if (aadhaar) details.aadhaar = aadhaar;

  const dobInfo = findDob(lines);
  if (dobInfo.dob) details.dob = dobInfo.dob;
  if (dobInfo.yearOfBirth) details.yearOfBirth = dobInfo.yearOfBirth;

  const gender = findGender(lines);
  if (gender) details.gender = gender.value;

  const careOf = findCareOf(lines);
  if (careOf) details.careOf = careOf;

  const name = findName(lines, [...dobInfo.lineIdx, ...(gender ? [gender.lineIdx] : [])], careOf);
  if (name) details.name = name;

  const phone = findPhone(lines, aadhaar);
  if (phone) details.phone = phone;

  const addr = findAddress(lines, name);
  if (addr.address) details.address = addr.address;
  if (addr.pincode) details.pincode = addr.pincode;

  return { details, aadhaarVerified: verified };
}

/** Split into lines, and split wide gaps (merged columns) into separate segments. */
function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .flatMap(l => l.split(/ {3,}|\t+/))
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(l => l.length > 0);
}

// Common OCR confusions inside digit groups.
const DIGIT_FIX: Record<string, string> = { O: '0', o: '0', D: '0', Q: '0', I: '1', l: '1', '|': '1', i: '1', Z: '2', z: '2', S: '5', s: '5', B: '8', b: '6', G: '6', g: '9', q: '9' };

function fixDigits(line: string): string {
  // Only touch short tokens that are mostly digits already, e.g. "68Z1" or "5O58".
  return line.replace(/(?<![A-Za-z])[0-9OoDQIl|iZzSsBbGgq]{3,5}(?![A-Za-z])/g, tok =>
    (tok.match(/\d/g)?.length ?? 0) >= Math.ceil(tok.length / 2) ? tok.replace(/[^0-9]/g, c => DIGIT_FIX[c] ?? c) : tok,
  );
}

/** Runs of digits separated by at most two spaces, e.g. "6821 5058 5136" or "68215058 5136". */
function digitRuns(line: string): string[] {
  return (fixDigits(line).match(/\d+(?: {1,2}\d+)*/g) ?? []).map(r => r.replace(/ /g, ''));
}

function findAadhaar(lines: string[]): { aadhaar?: string; verified: boolean } {
  const valid = new Map<string, number>();
  const invalid = new Map<string, number>();
  for (const line of lines) {
    if (/\bVID\b/i.test(line) || /enrol/i.test(line)) continue;
    for (const run of digitRuns(line)) {
      if (run.length !== 12) continue;
      const bucket = isValidAadhaar(run) ? valid : /^[2-9]/.test(run) ? invalid : null;
      bucket?.set(run, (bucket.get(run) ?? 0) + 1);
    }
  }
  const best = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const v = best(valid);
  if (v) return { aadhaar: v, verified: true };
  const i = best(invalid);
  return i ? { aadhaar: i, verified: false } : { verified: false };
}

function findPhone(lines: string[], aadhaar?: string): string | undefined {
  for (const line of lines) {
    if (/\bVID\b|enrol|1947|help/i.test(line)) continue;
    for (const run of digitRuns(line)) {
      const r = run.length === 12 && run.startsWith('91') ? run.slice(2) : run;
      if (r.length === 10 && /^[6-9]/.test(r) && !aadhaar?.includes(r)) return r;
    }
  }
  return undefined;
}

const DATE = /(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4})/;

function findDob(lines: string[]): { dob?: string; yearOfBirth?: number; lineIdx: number[] } {
  const lineIdx: number[] = [];
  let dob: string | undefined;
  let yearOfBirth: number | undefined;
  const thisYear = new Date().getFullYear();

  lines.forEach((line, i) => {
    const m = line.match(new RegExp(String.raw`(?:D[O0]B|D\.O\.B|Date\s*of\s*Birth|Birth)\s*[:\-]?\s*` + DATE.source, 'i'));
    if (m) {
      dob ??= normalizeDate(`${m[1]}/${m[2]}/${m[3]}`);
      lineIdx.push(i);
      return;
    }
    const y = line.match(/(?:Year\s*of\s*Birth|YOB|Birth\s*Year)\s*[:\-]?\s*(\d{4})/i);
    if (y && +y[1] > 1900 && +y[1] <= thisYear) {
      yearOfBirth ??= +y[1];
      lineIdx.push(i);
    }
  });

  if (!dob) {
    // A bare date on a line with no other date label is very likely the DOB.
    lines.forEach((line, i) => {
      if (dob || /download|generat|issue|print|signed|date/i.test(line)) return;
      const m = fixDigits(line).match(DATE);
      const d = m && normalizeDate(`${m[1]}/${m[2]}/${m[3]}`);
      if (d && +d.slice(-4) > thisYear - 110) {
        dob = d;
        lineIdx.push(i);
      }
    });
  }
  if (dob) yearOfBirth = +dob.slice(-4);
  return { dob, yearOfBirth, lineIdx };
}

function findGender(lines: string[]): { value: Gender; lineIdx: number } | undefined {
  const patterns: [RegExp, Gender][] = [
    [/\bF\s?E\s?M\s?A\s?L\s?E\b/i, 'Female'],
    [/\bTRANSGENDER\b/i, 'Transgender'],
    [/(?:^|[\s\/:])M\s?A\s?L\s?E\b/i, 'Male'],
  ];
  for (const [re, value] of patterns) {
    const idx = lines.findIndex(l => re.test(l) && !/proof|children|information/i.test(l));
    if (idx >= 0) return { value, lineIdx: idx };
  }
  return undefined;
}

function findCareOf(lines: string[]): string | undefined {
  for (const line of lines) {
    const m = line.match(new RegExp(RELATION.source + String.raw`([A-Z][A-Za-z.]*(?:\s+[A-Z][A-Za-z.]*){0,4})`));
    if (m) return cleanName(m[1]);
  }
  return undefined;
}

/** Trim junk tokens (OCR noise, Telugu read as Latin) from both ends of a line. */
function trimToName(line: string): string {
  const tokens = line.replace(/[,:;]+/g, ' ').split(/\s+/).filter(Boolean);
  const nameLike = (t: string) => /^[A-Z][a-z]+\.?$/.test(t) || /^[A-Z]{1,}\.?$/.test(t);
  while (tokens.length && !nameLike(tokens[0])) tokens.shift();
  while (tokens.length && !nameLike(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(' ');
}

const NAME_WORD = /^[A-Z][a-z]+\.?$|^[A-Z]+\.?$/;

/** Base score for a cleaned candidate, or -1 when it cannot be a person's name. */
function nameScore(raw: string, candidate: string): number {
  const rawWords = raw.split(' ');
  // Every word must look like a name word; a stray lowercase token means misread Telugu.
  if (!rawWords.every(w => NAME_WORD.test(w))) return -1;
  const words = candidate.split(' ');
  if (words.length < 2 || words.length > 6) return -1;
  if (words.some(w => NOT_NAME_WORDS.has(w.toLowerCase().replace(/\.$/, '')))) return -1;
  if (words.filter(w => w.replace('.', '').length >= 3).length < 2) return -1;
  // UPPER-case words of 2-3 letters in a row are usually noise ("HB", "EPR").
  if (rawWords.filter(w => /^[A-Z]{2,3}$/.test(w)).length > 1) return -1;
  return 1 + (words.length >= 3 ? 0.3 : 0);
}

function nameCandidate(line: string, careOf?: string): string | undefined {
  if (RELATION.test(line)) return undefined;
  const raw = trimToName(line);
  if (!raw || /\d/.test(raw)) return undefined;
  const candidate = cleanName(raw);
  if (!candidate || nameScore(raw, candidate) < 0) return undefined;
  if (careOf && candidate.toLowerCase() === careOf.toLowerCase()) return undefined;
  return candidate;
}

function findName(lines: string[], anchorIdx: number[], careOf?: string): string | undefined {
  const scores = new Map<string, number>();
  const add = (c: string, n: number) => scores.set(c, (scores.get(c) ?? 0) + n);

  lines.forEach(line => {
    const c = nameCandidate(line, careOf);
    if (c) add(c, 1 + (c.split(' ').length >= 3 ? 0.3 : 0));
  });
  // On the card front the name is the first name-like line above DOB / gender.
  for (const a of anchorIdx) {
    for (let i = a - 1; i >= Math.max(0, a - 12); i--) {
      const c = nameCandidate(lines[i], careOf);
      if (c) {
        add(c, 3);
        break;
      }
    }
  }
  // On the letter the name is the first name-like line below "To".
  lines.forEach((l, t) => {
    if (!/^(To|T0)\b[,:]?$/i.test(l)) return;
    for (let i = t + 1; i <= Math.min(lines.length - 1, t + 3); i++) {
      const c = nameCandidate(lines[i], careOf);
      if (c) {
        add(c, 2.5);
        break;
      }
    }
  });

  return [...scores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

const ADDRESS_STOP = /father|husband|birth|dob|male|female|aadhaar|aadhar|\bvid\b|enrol|government|authority|information|proof|signature|download/i;

function looksLikeAddressPart(line: string): boolean {
  if (ADDRESS_STOP.test(line)) return false;
  const clean = line.replace(/[A-Za-z0-9 ,.()\/\-:#]/g, '');
  if (clean.length > line.length * 0.1) return false;
  const words = line.match(/[A-Za-z]{3,}/g) ?? [];
  // Place names are capitalised; lowercase-only fragments are almost always OCR noise.
  return /\d/.test(line) || words.some(w => /^[A-Z]/.test(w));
}

function findAddress(lines: string[], name?: string): { address?: string; pincode?: string } {
  const pinIdx = lines.findIndex(l => /(?<!\d)[1-9]\d{5}(?!\d)/.test(l) && !/\/\d{5}/.test(l) && !/1947|enrol|help/i.test(l));
  if (pinIdx < 0) return {};
  const pincode = lines[pinIdx].match(/(?<!\d)([1-9]\d{5})(?!\d)/)![1];

  // An "Address:" label wins; otherwise walk up from the PIN line to the relation / name line.
  let start = lines.findIndex((l, i) => /address\s*[:\-]/i.test(l) && i <= pinIdx && pinIdx - i <= 10);
  if (start < 0) {
    start = pinIdx;
    let junk = 0; // merged columns can put a stray line or two inside the address block
    for (let i = pinIdx - 1; i >= Math.max(0, pinIdx - 8); i--) {
      const l = lines[i];
      if (RELATION.test(l)) {
        start = i;
        break;
      }
      if ((name && cleanName(trimToName(l)) === name) || /^To$/i.test(l)) break;
      if (!looksLikeAddressPart(l)) {
        if (++junk > 2) break;
        continue;
      }
      start = i;
    }
  }

  // Words of every relation name (S/O, Father: ...) so a wrapped father's name is not taken as a place.
  const relationWords = new Set(
    lines.flatMap(l => (RELATION.test(l) ? l.replace(new RegExp('^.*?' + RELATION.source, 'i'), '').toLowerCase().split(/[\s,]+/) : [])),
  );

  const parts: string[] = [];
  for (let i = start; i <= pinIdx; i++) {
    let l = lines[i].replace(/^.*?address\s*[:\-]\s*/i, '');
    if (RELATION.test(l)) l = l.replace(new RegExp('^.*?' + RELATION.source, 'i'), '').replace(/^(?:[A-Z][a-z.]+\s*)+,?\s*/, '');
    else if (i > start && i !== pinIdx && !looksLikeAddressPart(l)) continue;
    l = l.replace(/(?<![\d])[6-9]\d{9}(?!\d)/g, '');
    parts.push(l);
  }

  const seen = new Set<string>();
  const pieces = parts
    .flatMap(p => p.split(/\s*,\s*|\s+-\s+/))
    .map(p => p.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9)]+$/g, ''))
    .filter(p => p && !/^[A-Z ]{2,}$/.test(p)); // all-caps fragments are OCR noise on English address lines
  while (pieces.length && pieces[0].split(/\s+/).every(w => relationWords.has(w.toLowerCase()))) pieces.shift();
  const address = pieces
    .filter(p => {
      const key = p.toLowerCase();
      return !seen.has(key) && (seen.add(key), true);
    })
    .join(', ')
    .replace(/,\s*(\d{6})$/, ' - $1')
    .slice(0, 160);
  return { address: address || undefined, pincode };
}

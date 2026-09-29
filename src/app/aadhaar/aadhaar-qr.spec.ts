import { gzipSync } from 'fflate';
import { normalizeDate, parseAadhaarQr } from './aadhaar-qr';

/** Builds a Secure QR payload the way UIDAI does: 0xFF-separated fields, gzip, big-endian integer. */
function secureQr(fields: string[]): string {
  const enc = new TextEncoder();
  const parts: number[] = [];
  for (const f of fields) parts.push(...enc.encode(f), 255);
  parts.push(...[1, 2, 3, 255, 9, 9]); // stand-ins for photo and signature bytes
  const gz = gzipSync(new Uint8Array(parts));
  let hex = '';
  gz.forEach(b => (hex += b.toString(16).padStart(2, '0')));
  return BigInt('0x' + hex).toString(10);
}

describe('parseAadhaarQr', () => {
  it('reads an old XML QR, including the full number', () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n<PrintLetterBarcodeData uid="234567890124" name="Kavya Sri Nallamothu" gender="F" yob="2004" ' +
      'gname="Nallamothu Ramesh" co="D/O Nallamothu Ramesh" house="2-17/B" street="Temple Street" loc="Peruru" vtc="Tirupati (Rural)" ' +
      'dist="Chittoor" state="Andhra Pradesh" pc="517505"/>';
    const r = parseAadhaarQr(xml)!;
    expect(r.kind).toBe('xml');
    expect(r.details).toEqual(
      jasmine.objectContaining({
        aadhaar: '234567890124',
        name: 'Kavya Sri Nallamothu',
        gender: 'Female',
        yearOfBirth: 2004,
        pincode: '517505',
        address: '2-17/B, Temple Street, Peruru, Tirupati (Rural), Chittoor, Andhra Pradesh - 517505',
      }),
    );
  });

  it('keeps only the last four digits of a masked XML number', () => {
    const r = parseAadhaarQr('<PrintLetterBarcodeData uid="xxxxxxxx0124" name="Ravi Teja" gender="M" dob="05/01/1990"/>')!;
    expect(r.details.aadhaar).toBeUndefined();
    expect(r.details.aadhaarLast4).toBe('0124');
    expect(r.details.dob).toBe('05/01/1990');
  });

  it('decodes a Secure QR (V2)', () => {
    const payload = secureQr([
      'V2', '3', '012420190805123456789', 'Lakshmi Prasanna Gowda', '14-02-1986', 'F', 'W/O Gowda Srinivas', 'Chittoor', 'Near Bhajana Mandiram',
      '3-45', 'Peruru', '517505', 'Peruru', 'Andhra Pradesh', 'Main Road', 'Tirupati Rural', 'Peruru', '4321',
    ]);
    const r = parseAadhaarQr(payload)!;
    expect(r.kind).toBe('secure');
    expect(r.details).toEqual(
      jasmine.objectContaining({
        name: 'Lakshmi Prasanna Gowda',
        dob: '14/02/1986',
        gender: 'Female',
        aadhaarLast4: '0124',
        pincode: '517505',
      }),
    );
    expect(r.details.address).toContain('3-45, Main Road, Near Bhajana Mandiram, Peruru');
    expect(r.details.address).toMatch(/Andhra Pradesh - 517505$/);
  });

  it('decodes an unversioned Secure QR', () => {
    const payload = secureQr(['2', '987620190805000000001', 'Venkata Ramana', '01-07-1972', 'M', '', 'Chittoor', '', '', '', '517505', '', 'Andhra Pradesh', '', '', 'Peruru']);
    const r = parseAadhaarQr(payload)!;
    expect(r.details.name).toBe('Venkata Ramana');
    expect(r.details.gender).toBe('Male');
    expect(r.details.aadhaarLast4).toBe('9876');
  });

  it('ignores QR codes that are not Aadhaar', () => {
    expect(parseAadhaarQr('https://example.com')).toBeNull();
    expect(parseAadhaarQr('1234567890')).toBeNull();
  });

  it('normalises dates', () => {
    expect(normalizeDate('3/8/2007')).toBe('03/08/2007');
    expect(normalizeDate('2007-08-03')).toBe('03/08/2007');
    expect(normalizeDate('31-13-2007')).toBeUndefined();
  });
});

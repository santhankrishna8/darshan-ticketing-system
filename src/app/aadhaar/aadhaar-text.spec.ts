import { ageFrom } from './aadhaar.types';
import { parseAadhaarText } from './aadhaar-text';

// OCR output shaped like real phone photos: Telugu lines read as Latin garbage,
// merged columns, stray symbols. Names and numbers here are made up.

const LETTER = `
BERS! Enrolment No.: 0640/34866/11596
Jol) dard
To
Nallamothu Kavya Sri
D/O Nallamothu Ramesh
2-17/B
Peruru
Tirupati (Rural)
Chittoor Andhra Pradesh - 517505
9848012345
6102/60/61 #wQ peojumoq
2 ess ®oadg / Your Aadhaar No. :
2345 6789 0124
VID : 9135 0704 7253 1966
60 peveco
Gavernment of India
Nallamothu Kavya Sri
34/DOB: 14/02/2004
FEMALE
2345 6789 0124
`;

const PVC_FRONT = `
J NEES
2D 30 dbo 8
= 79 V Ravi Teja Kumar :
pes 88/DOB: 12/09/1995
EIDE MALE
| Jor QR FE / BOTS XML clus), 7,308).
 Aadhaar is proof of identity, not of citizenship
or date of birth. it should be used with verification |
5123 4567 8903
`;

const OLD_CARD_MERGED_COLUMNS = `
Bode 50 (bo $38      2) '* UNIGUEIDENTIFICATION AUTHORITY -OF-INDIA
Venkata Ramana Reddy
Sod : Jo Sb ¥y8                     Address: S/O Reddy Subbaiah
Father: Reddy Subbaiah              Subbaiah, 4-48/A, Perur, Perur,
HL           bn                      Tirupati (Rural), Chittoor, Andhra
Co: iS sos ysalYear of Birth: 1972   DESO,
+ pistes / Male                      Pradesh, 517505
8765 4321 O988
`;

describe('parseAadhaarText', () => {
  it('reads an e-Aadhaar letter', () => {
    const { details, aadhaarVerified } = parseAadhaarText(LETTER);
    expect(aadhaarVerified).toBeTrue();
    expect(details.aadhaar).toBe('234567890124');
    expect(details.name).toBe('Nallamothu Kavya Sri');
    expect(details.dob).toBe('14/02/2004');
    expect(details.gender).toBe('Female');
    expect(details.phone).toBe('9848012345');
    expect(details.address).toBe('2-17/B, Peruru, Tirupati (Rural), Chittoor Andhra Pradesh - 517505');
  });

  it('never mistakes the 16-digit VID or the enrolment number for the Aadhaar number', () => {
    const { details } = parseAadhaarText('Enrolment No.: 2345/67890/12412\nVID : 2345 6789 0124 1966\n');
    expect(details.aadhaar).toBeUndefined();
  });

  it('reads the front of a PVC card with noise around the name', () => {
    const { details, aadhaarVerified } = parseAadhaarText(PVC_FRONT);
    expect(aadhaarVerified).toBeTrue();
    expect(details.aadhaar).toBe('512345678903');
    expect(details.name).toBe('V Ravi Teja Kumar');
    expect(details.dob).toBe('12/09/1995');
    expect(details.gender).toBe('Male');
  });

  it('reads an old card with merged columns, year of birth and OCR digit mistakes', () => {
    const { details, aadhaarVerified } = parseAadhaarText(OLD_CARD_MERGED_COLUMNS);
    expect(aadhaarVerified).toBeTrue();
    expect(details.aadhaar).toBe('876543210988'); // "O988" read as "0988"
    expect(details.name).toBe('Venkata Ramana Reddy');
    expect(details.yearOfBirth).toBe(1972);
    expect(details.gender).toBe('Male');
    expect(details.pincode).toBe('517505');
    expect(details.address).toContain('4-48/A');
    expect(details.address).not.toContain('Subbaiah');
  });

  it('prefers a checksum-valid number over a misread one', () => {
    const { details, aadhaarVerified } = parseAadhaarText('2345 6789 0125\n2345 6789 0124\n');
    expect(aadhaarVerified).toBeTrue();
    expect(details.aadhaar).toBe('234567890124');
  });

  it('reports an unverified number when OCR got a digit wrong', () => {
    const { details, aadhaarVerified } = parseAadhaarText('Your Aadhaar No.\n2345 6789 0125\n');
    expect(details.aadhaar).toBe('234567890125');
    expect(aadhaarVerified).toBeFalse();
  });

  it('returns nothing for text that is not an Aadhaar card', () => {
    const { details } = parseAadhaarText('Hello world\nThis is a shopping list\nMilk 2 packets\n');
    expect(details.aadhaar).toBeUndefined();
    expect(details.name).toBeUndefined();
  });
});

describe('ageFrom', () => {
  it('counts completed years from a full date', () => {
    const on = new Date(2026, 11, 18);
    expect(ageFrom({ dob: '19/12/2007' }, on)).toBe(18);
    expect(ageFrom({ dob: '18/12/2007' }, on)).toBe(19);
    expect(ageFrom({ yearOfBirth: 1972 }, on)).toBe(54);
    expect(ageFrom({}, on)).toBeUndefined();
  });
});

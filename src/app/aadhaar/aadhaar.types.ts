export type Gender = 'Male' | 'Female' | 'Transgender';

/** Fields we can read from an Aadhaar card. Everything is optional: a photo may show only part of the card. */
export interface AadhaarDetails {
  name?: string;
  /** 12 digits, no spaces. */
  aadhaar?: string;
  /** Last 4 digits, when only the masked number is available (Secure QR). */
  aadhaarLast4?: string;
  /** DD/MM/YYYY */
  dob?: string;
  yearOfBirth?: number;
  gender?: Gender;
  phone?: string;
  careOf?: string;
  address?: string;
  pincode?: string;
}

export type QrKind = 'secure' | 'xml';

export interface ScanResult {
  details: AadhaarDetails;
  qr: QrKind | null;
  ocr: boolean;
  /** True when the Aadhaar number passed the Verhoeff checksum. */
  aadhaarVerified: boolean;
  /** Field names that were filled from the card, for highlighting in the form. */
  filled: (keyof AadhaarDetails)[];
}

/** Age in completed years on `on`, from DD/MM/YYYY or a bare year of birth. */
export function ageFrom(details: Pick<AadhaarDetails, 'dob' | 'yearOfBirth'>, on = new Date()): number | undefined {
  const m = details.dob?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    const [d, mo, y] = [+m[1], +m[2], +m[3]];
    let age = on.getFullYear() - y;
    if (on.getMonth() + 1 < mo || (on.getMonth() + 1 === mo && on.getDate() < d)) age--;
    return age >= 0 && age < 130 ? age : undefined;
  }
  if (details.yearOfBirth) {
    const age = on.getFullYear() - details.yearOfBirth;
    return age >= 0 && age < 130 ? age : undefined;
  }
  return undefined;
}

export function formatAadhaar(digits: string): string {
  return digits.replace(/\D/g, '').slice(0, 12).replace(/(\d{4})(?=\d)/g, '$1 ');
}

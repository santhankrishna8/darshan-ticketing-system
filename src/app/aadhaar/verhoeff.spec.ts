import { D, P, isValidAadhaar, verhoeffCheckDigit, verhoeffValid } from './verhoeff';

describe('verhoeff', () => {
  it('matches published reference values', () => {
    expect(verhoeffCheckDigit('236')).toBe(3);
    expect(verhoeffValid('2363')).toBeTrue();
    expect(verhoeffCheckDigit('75872')).toBe(2);
    expect(verhoeffValid('758722')).toBeTrue();
    expect(verhoeffCheckDigit('12345')).toBe(1);
  });

  it('has permutation rows generated from the first one', () => {
    for (let i = 2; i < 8; i++) expect(P[i]).toEqual(P[i - 1].map(x => P[1][x]));
  });

  it('has a dihedral multiplication table (every row is a permutation, 0 is identity)', () => {
    for (let a = 0; a < 10; a++) {
      expect([...D[a]].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(D[a][0]).toBe(a);
    }
  });

  it('accepts valid Aadhaar numbers and catches single-digit and swap errors', () => {
    for (const n of ['234567890124', '512345678903', '876543210988', '395124863073']) {
      expect(isValidAadhaar(n)).withContext(n).toBeTrue();
      expect(isValidAadhaar(n.slice(0, 4) + ' ' + n.slice(4, 8) + ' ' + n.slice(8))).toBeTrue();
      for (let i = 0; i < 12; i++) {
        const wrong = n.slice(0, i) + ((+n[i] + 3) % 10) + n.slice(i + 1);
        expect(isValidAadhaar(wrong)).withContext(wrong).toBeFalse();
      }
      const swapped = n[1] + n[0] + n.slice(2);
      if (swapped !== n) expect(isValidAadhaar(swapped)).toBeFalse();
    }
  });

  it('rejects wrong lengths and numbers starting with 0 or 1', () => {
    expect(isValidAadhaar('23456789012')).toBeFalse();
    expect(isValidAadhaar('')).toBeFalse();
    expect(isValidAadhaar(null)).toBeFalse();
    expect(isValidAadhaar('1' + '23456789012')).toBeFalse();
  });
});

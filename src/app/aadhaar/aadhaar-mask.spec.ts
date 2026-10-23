import { maskAadhaar } from './aadhaar.types';

describe('maskAadhaar', () => {
  it('hides the first 8 digits of a complete number, however it is spaced', () => {
    expect(maskAadhaar('2363 1234 5678')).toBe('XXXX XXXX 5678');
    expect(maskAadhaar('236312345678')).toBe('XXXX XXXX 5678');
  });

  it('leaves partial input alone so typing is not disturbed', () => {
    expect(maskAadhaar('')).toBeNull();
    expect(maskAadhaar('2363 1234')).toBeNull();
    expect(maskAadhaar('9876543210')).toBeNull();
  });
});

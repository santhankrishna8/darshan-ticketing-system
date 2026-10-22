import { safeName } from './excel';

describe('safeName', () => {
  it('keeps ordinary names as they are', () => {
    expect(safeName('Darshan 2026 Ravi Kumar 2026-12-18 1030', 120)).toBe('Darshan 2026 Ravi Kumar 2026-12-18 1030');
    expect(safeName('రవి కుమార్', 31)).toBe('రవి కుమార్');
  });

  it('removes characters Excel and Windows refuse in sheet and file names', () => {
    expect(safeName('Ravi / Kumar: "Block" ?*', 31)).toBe('Ravi Kumar Block');
    expect(safeName('a\\b[c]d|e<f>g', 31)).toBe('a b c d e f g');
    expect(safeName('line\nbreak\ttab', 31)).toBe('line break tab');
  });

  it('never returns an empty or edge-quoted name, and respects the length limit', () => {
    expect(safeName('///', 31)).toBe('Export');
    expect(safeName("'quoted'", 31)).toBe('quoted');
    expect(safeName('x'.repeat(100), 31).length).toBe(31);
  });
});

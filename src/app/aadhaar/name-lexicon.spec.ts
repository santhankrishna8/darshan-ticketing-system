import { correctNameWord, knownWords } from './name-lexicon';

describe('correctNameWord', () => {
  it('undoes letters merged by OCR when the reading is not certain', () => {
    expect(correctNameWord('Knshna', 86)).toBe('Krishna');
    expect(correctNameWord('Lakshrni', 85)).toBe('Lakshmi');
    expect(correctNameWord('KNSHNA', 70)).toBe('KRISHNA');
  });

  it('makes other one-letter fixes only for low-confidence words', () => {
    expect(correctNameWord('Knshng', 60)).toBe('Krishna');
    expect(correctNameWord('Sunita', 85)).toBe('Sunita');
  });

  it('never changes confident readings, known words, short words or unrelated names', () => {
    expect(correctNameWord('Knshna', 95)).toBe('Knshna');
    expect(correctNameWord('Krishna', 10)).toBe('Krishna');
    expect(correctNameWord('Teja', 10)).toBe('Teja');
    expect(correctNameWord('Nallamothu', 10)).toBe('Nallamothu');
    expect(correctNameWord('Zubair', 10)).toBe('Zubair');
  });

  it('counts known name words', () => {
    expect(knownWords('V Muni Preetham Krishna')).toBe(3);
    expect(knownWords('Hb Ob Bods')).toBe(0);
  });
});

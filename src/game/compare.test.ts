import { compareTries, type TrySummary } from './compare';

const base: TrySummary = { stars: 2, fell: 'none', driftCm: 14, broken: 0, cost: 200, height: 18 };

describe('前回の試験とくらべる', () => {
  test('はじめての試験では何も出さない', () => {
    expect(compareTries(null, base)).toEqual([]);
  });

  test('揺れ幅・費用・星の変化を出す', () => {
    expect(compareTries(base, { ...base, stars: 3, driftCm: 9, cost: 190 })).toEqual([
      { text: '星 2 → 3', better: true },
      { text: '揺れ幅 14 → 9 cm（−5）', better: true },
      { text: '費用 −10 万円', better: true },
    ]);
  });

  test('倒れたときは揺れ幅を比べない', () => {
    const r = compareTries(base, { ...base, stars: 0, fell: 'collapsed', driftCm: 300, cost: 210 });
    expect(r.map((x) => x.text)).toEqual(['前回は耐えたのに、今回は倒れた', '星 2 → 0', '費用 ＋10 万円']);
    expect(compareTries({ ...base, fell: 'collapsed', stars: 0 }, base)[0]).toEqual({ text: '前回は倒れたけれど、今回は耐えた！', better: true });
  });

  test('同じなら何も出さない', () => {
    expect(compareTries(base, base)).toEqual([]);
  });
});

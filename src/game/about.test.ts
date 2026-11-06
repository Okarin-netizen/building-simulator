import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';
import { AUTHOR, CHANGELOG, THIRD_PARTY } from './about';

describe('このアプリについて', () => {
  it('作者は「技術科　岡田」', () => {
    expect(AUTHOR).toBe('技術科　岡田');
  });

  it('更新履歴は新しい順で、最新の版が package.json と同じ', () => {
    // 0.10 は 0.9 より新しいので、数字として比べずに「.」で区切った番号ごとに比べる
    const cmp = (a: string, b: string) => {
      const x = a.split('.').map(Number);
      const y = b.split('.').map(Number);
      for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
      return 0;
    };
    const versions = CHANGELOG.map((c) => c.version);
    expect([...versions].sort((a, b) => cmp(b, a))).toEqual(versions);
    expect(cmp('0.10', '0.9')).toBeGreaterThan(0);
    expect(pkg.version.startsWith(`${CHANGELOG[0].version}.`)).toBe(true);
    for (const c of CHANGELOG) expect(c.items.length).toBeGreaterThan(0);
  });

  it('使っているフォントはすべてライセンスが書いてある', () => {
    for (const t of THIRD_PARTY) expect(t.license).not.toBe('');
    expect(THIRD_PARTY.map((t) => t.name)).toEqual(expect.arrayContaining(['Dela Gothic One', 'Zen Kaku Gothic New']));
  });
});

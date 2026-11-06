import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';
import { AUTHOR, CHANGELOG, THIRD_PARTY } from './about';

describe('このアプリについて', () => {
  it('作者は「技術科　岡田」', () => {
    expect(AUTHOR).toBe('技術科　岡田');
  });

  it('更新履歴は新しい順で、最新の版が package.json と同じ', () => {
    const nums = CHANGELOG.map((c) => Number(c.version));
    expect([...nums].sort((a, b) => b - a)).toEqual(nums);
    expect(pkg.version.startsWith(`${CHANGELOG[0].version}.`)).toBe(true);
    for (const c of CHANGELOG) expect(c.items.length).toBeGreaterThan(0);
  });

  it('使っているフォントはすべてライセンスが書いてある', () => {
    for (const t of THIRD_PARTY) expect(t.license).not.toBe('');
    expect(THIRD_PARTY.map((t) => t.name)).toEqual(expect.arrayContaining(['Dela Gothic One', 'Zen Kaku Gothic New']));
  });
});

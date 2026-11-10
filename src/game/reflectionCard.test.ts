import { describe, expect, it } from 'vitest';
import { cardFileName, wrapText } from './reflectionCard';

// 1文字＝幅10として測る
const measure = (s: string) => Array.from(s).length * 10;

describe('ふりかえりの画像', () => {
  it('幅に収まるように折り返し、改行はそのまま残す', () => {
    expect(wrapText('あいうえおかきくけこ', 40, measure)).toEqual(['あいうえ', 'おかきく', 'けこ']);
    expect(wrapText('あい\nう', 40, measure)).toEqual(['あい', 'う']);
    expect(wrapText('', 40, measure)).toEqual(['']);
  });

  it('句読点は行の頭に来ない', () => {
    const lines = wrapText('あいうえ。かき', 40, measure);
    expect(lines[0]).toBe('あいうえ。');
    expect(lines.every((l) => !l.startsWith('。'))).toBe(true);
  });

  it('ファイル名は英数字だけで、日時が入る', () => {
    expect(cardFileName(new Date(2026, 10, 10, 9, 5))).toBe('furikaeri_20261110_0905.png');
  });
});

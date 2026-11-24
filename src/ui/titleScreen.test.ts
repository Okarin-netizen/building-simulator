import { describe, expect, it } from 'vitest';
import { titleSummary } from './titleScreen';
import { stageById, STAGES } from '../game/stages';

describe('タイトル画面', () => {
  it('はじめての人は「はじめる」で 1-1 から', () => {
    const s = titleSummary({}, true, STAGES[0]);
    expect(s.primary).toBe('はじめる');
    expect(s.restart).toBe(false);
    expect(s.where.startsWith('1-1')).toBe(true);
    expect(s.stars).toBe(0);
    expect(s.maxStars).toBe(STAGES.filter((x) => x.chapter !== 'challenge').length * 3);
  });

  it('2回目からは「つづきから」と、前のステージと星の合計を出す', () => {
    const s = titleSummary({ '1-1': { stars: 3 }, '1-2': { stars: 2 }, challenge: { stars: 3, bestHeight: 20 } }, false, stageById('1-2') ?? null);
    expect(s.primary).toBe('つづきから');
    expect(s.restart).toBe(true);
    expect(s.where.startsWith('1-2')).toBe(true);
    expect(s.stars).toBe(5);
  });

  it('自由に作るモードなら、そう書く', () => {
    expect(titleSummary({}, false, null).where).toContain('自由に作る');
  });
});

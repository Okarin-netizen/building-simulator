import { describe, expect, it } from 'vitest';
import type { Evaluation } from '../game/evaluate';
import { resultTitle, resultWord } from './resultCard';

const ev = (over: Partial<Evaluation>): Evaluation => ({ cleared: false, stars: 0, height: 12, checks: [], fell: 'none', ...over });

describe('結果カードの見出し', () => {
  it('クリアしたときは、場面ごとの見出し', () => {
    expect(resultTitle(ev({ cleared: true }), 'challenge', 0)).toBe('記録 12 m！');
    expect(resultTitle(ev({ cleared: true }), 'stage', 9)).toBe('クリア！');
    expect(resultTitle(ev({ cleared: true }), 'free', 0)).toBe('耐えた！');
  });

  it('クリアできなかったときは、倒れ方か高さ不足を言う', () => {
    expect(resultTitle(ev({ fell: 'collapsed' }), 'stage', 9)).toBe('倒れてしまった…');
    expect(resultTitle(ev({ fell: 'partly' }), 'stage', 9)).toBe('一部がくずれた…');
    expect(resultTitle(ev({}), 'stage', 9)).toBe('高さが足りません（目標 9 m）');
  });

  it('クラスに送るひとことの結果', () => {
    expect(resultWord(ev({ cleared: true }))).toBe('クリア');
    expect(resultWord(ev({ fell: 'collapsed' }))).toBe('倒れた');
    expect(resultWord(ev({ fell: 'partly' }))).toBe('一部がくずれた');
    expect(resultWord(ev({}))).toBe('高さが足りない');
  });
});

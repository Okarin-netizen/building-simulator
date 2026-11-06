// 教材としての正しさを守るテスト。
// 物理の数値を調整したときに「四角は倒れ、三角は耐える」などの学びが崩れていないかを確かめる。

import { frameDesign, type Design } from './design';
import { createWorld, step, type World } from './world';
import { makeQuake, type QuakeLevel } from './quake';

function simulate(design: Design, level: QuakeLevel | null, seconds = 18): World {
  const world = createWorld(design, level ? makeQuake(level) : null);
  for (let i = 0; i < seconds * 60; i++) step(world, 1 / 60);
  return world;
}

describe('地震がなければ', () => {
  test('四角い枠も筋交い入りの枠も、自分の重さで倒れない', () => {
    for (const braced of [false, true]) {
      const w = simulate(frameDesign({ floors: 3, braced }), null, 5);
      expect(w.collapsed).toBe(false);
      expect(w.members.every((m) => !m.broken)).toBe(true);
    }
  });
});

describe('四角と三角（木材・3階建て）', () => {
  test('中くらいの地震で、四角い枠は倒れる', () => {
    expect(simulate(frameDesign({ floors: 3 }), 'medium').collapsed).toBe(true);
  });

  test('中くらいの地震で、筋交いを入れた枠は倒れない', () => {
    expect(simulate(frameDesign({ floors: 3, braced: true }), 'medium').collapsed).toBe(false);
  });

  test('強い地震でも、筋交いを入れた枠は倒れない', () => {
    expect(simulate(frameDesign({ floors: 3, braced: true }), 'strong').collapsed).toBe(false);
  });

  test('弱い地震なら、四角い枠も揺れるだけで倒れない', () => {
    const w = simulate(frameDesign({ floors: 3 }), 'weak');
    expect(w.collapsed).toBe(false);
    expect(w.maxDrift).toBeGreaterThan(0.1); // ただし大きく揺れる
  });

  test('筋交いを入れると、揺れ幅がずっと小さくなる', () => {
    const square = simulate(frameDesign({ floors: 3 }), 'weak');
    const braced = simulate(frameDesign({ floors: 3, braced: true }), 'weak');
    expect(braced.maxDrift).toBeLessThan(square.maxDrift / 5);
  });
});

describe('材料を選ぶ（筋交い入り・6階建て・強い地震）', () => {
  test('木材では倒れるが、鉄骨なら耐える', () => {
    expect(simulate(frameDesign({ floors: 6, braced: true, material: 'wood' }), 'strong').collapsed).toBe(true);
    expect(simulate(frameDesign({ floors: 6, braced: true, material: 'steel' }), 'strong').collapsed).toBe(false);
  });
});

// デバッガー視点で見つけた不具合が、もう一度起きないことを確かめる。

import { addMember, frameDesign } from '../physics/design';
import { makeQuake } from '../physics/quake';
import { createWorld, step } from '../physics/world';
import { canStartTest, evaluate, hasFloatingMember } from './evaluate';
import { isValidDesign } from './progress';
import { bracedTower, stageById } from './stages';

describe('保存した設計図の読みこみ', () => {
  test('正しい設計図は受けつける', () => {
    expect(isValidDesign(frameDesign({ floors: 2, braced: true }))).toBe(true);
    expect(isValidDesign({ ...bracedTower(['wood']), loads: [{ y: 3, mass: 50, name: '機械' }], isolated: true })).toBe(true);
  });

  test('壊れた設計図は受けつけない（画面が開かなくなるのを防ぐ）', () => {
    const nodes = [
      { x: 0, y: 0 },
      { x: 0, y: 3 },
    ];
    expect(isValidDesign(null)).toBe(false);
    expect(isValidDesign({ nodes, members: [{ a: 0, b: 1, material: 'gold' }] })).toBe(false); // ない材料
    expect(isValidDesign({ nodes, members: [{ a: 0, b: 5, material: 'wood' }] })).toBe(false); // ない節点
    expect(isValidDesign({ nodes: [{ x: 'a', y: 0 }], members: [] })).toBe(false);
    expect(isValidDesign({ nodes, members: [{ a: 0, b: 1, material: 'toString' }] })).toBe(false);
    expect(isValidDesign({ nodes, members: [], loads: [null] })).toBe(false);
  });
});

describe('地面につながっていない部材', () => {
  test('宙に浮いた部材があると試験を始められない', () => {
    const d = frameDesign({ floors: 1 });
    expect(hasFloatingMember(d)).toBe(false);
    addMember(d, 8, 3, 11, 3, 'wood');
    expect(hasFloatingMember(d)).toBe(true);
    expect(canStartTest(null, d).ok).toBe(false);
  });

  test('地面の上に寝かせた部材や、柱の先に出した部材は浮いていない', () => {
    const d = frameDesign({ floors: 1 });
    addMember(d, 6, 0, 9, 0, 'wood');
    addMember(d, 4, 3, 7, 3, 'wood');
    expect(hasFloatingMember(d)).toBe(false);
  });
});

test('6-2：免震ゴムの台ごとゆっくり動く分は、揺れ幅に数えない（免震で星3つが取れる）', () => {
  const s = stageById('6-2')!;
  const iso = { ...s.initial(), isolated: true };
  const world = createWorld(iso, makeQuake(s.quake.level, s.quake.type));
  for (let i = 0; i < 18 * 60; i++) step(world, 1 / 60);
  expect(Math.abs(world.isolation!.u)).toBeGreaterThan(0); // 台は動いている
  const ev = evaluate(s, iso, world);
  expect(ev.stars).toBe(3);
});

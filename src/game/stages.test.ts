// 各ステージが「工夫すれば解ける」「工夫しないと解けない」ことを確かめる。

import { designCost, frameDesign, type Design } from '../physics/design';
import { makeQuake } from '../physics/quake';
import { createWorld, step } from '../physics/world';
import { canStartTest, evaluate } from './evaluate';
import { bracedTower, stageById, type Stage } from './stages';

function play(stage: Stage, design: Design) {
  expect(canStartTest(stage, design).ok).toBe(true);
  const world = createWorld(design, makeQuake(stage.quake.level, stage.quake.type));
  for (let i = 0; i < 18 * 60; i++) step(world, 1 / 60);
  return evaluate(stage, design, world);
}

const stage = (id: string) => stageById(id)!;
const W = 'wood' as const;
const S = 'steel' as const;

test('1-1：最初の四角い枠は倒れ、筋交いを足せば予算内でクリアできる', () => {
  const s = stage('1-1');
  expect(play(s, s.initial()).cleared).toBe(false);
  const solved = frameDesign({ floors: 2, braced: true });
  expect(designCost(solved)).toBeLessThanOrEqual(s.budget);
  expect(play(s, solved).stars).toBe(3);
});

test('1-2：四角だけの3階建ては倒れ、筋交い入りはクリアできる', () => {
  const s = stage('1-2');
  expect(play(s, frameDesign({ floors: 3 })).cleared).toBe(false);
  expect(play(s, bracedTower([W, W, W])).cleared).toBe(true);
});

test('1-3：四角だけの4階建ては倒れ、筋交い入りなら予算内でクリアできる', () => {
  const s = stage('1-3');
  expect(play(s, frameDesign({ floors: 4 })).cleared).toBe(false);
  const solved = bracedTower([W, W, W, W]);
  expect(designCost(solved)).toBeLessThanOrEqual(s.budget);
  expect(play(s, solved).cleared).toBe(true);
});

test('2-1：木材だけでは倒れ、全部鉄骨は予算オーバー、下の階だけ鉄骨ならクリアできる', () => {
  const s = stage('2-1');
  expect(play(s, bracedTower([W, W, W, W, W, W])).cleared).toBe(false);
  expect(canStartTest(s, bracedTower([S, S, S, S, S, S])).ok).toBe(false);
  expect(play(s, bracedTower([S, S, W, W, W, W])).cleared).toBe(true);
});

test('2-2：最初のコンクリートの建物は倒れ、材料を変えればクリアできる', () => {
  const s = stage('2-2');
  expect(play(s, s.initial()).cleared).toBe(false);
  expect(play(s, bracedTower([S, W, W, W])).cleared).toBe(true);
});

test('2-3：8階建ては材料の使い分けでクリアできる', () => {
  const s = stage('2-3');
  expect(canStartTest(s, bracedTower(Array(8).fill(S))).ok).toBe(false);
  expect(play(s, bracedTower([S, S, S, S, W, W, W, W])).cleared).toBe(true);
});

test('高さが目標に届かなければクリアにならない', () => {
  const s = stage('1-2');
  expect(play(s, bracedTower([W, W])).cleared).toBe(false);
});

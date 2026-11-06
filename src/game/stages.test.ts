// 各ステージが「工夫すれば解ける」「工夫しないと解けない」ことを確かめる。

import { designCost, frameDesign, type Design } from '../physics/design';
import { makeQuake } from '../physics/quake';
import { createWorld, step } from '../physics/world';
import { canStartTest, evaluate } from './evaluate';
import { bracedTower, stageById, STAGES, wideTower, type Stage } from './stages';
import { VIEW } from '../render';

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
  // 軽い木材に置きかえるだけでも耐える（重さを減らす工夫）
  expect(play(s, bracedTower([W, W, W, W])).cleared).toBe(true);
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

test('高さが上がるほど不利になる：木材だけの筋交い入りタワーは5階までなら耐え、6階から上はどの高さでも倒れる', () => {
  const s = stage('challenge');
  for (let floors = 3; floors <= 10; floors++) {
    const ev = play(s, bracedTower(Array(floors).fill(W)));
    expect({ floors, stood: ev.cleared }).toEqual({ floors, stood: floors <= 5 });
  }
});

test('最高タワーチャレンジ：材料を使い分ければ8階建てまで建つが、同じ作り方で9階建ては倒れる', () => {
  const s = stage('challenge');
  expect(play(s, bracedTower([S, S, W, W, W, W, W, W])).cleared).toBe(true);
  expect(play(s, bracedTower([S, S, S, W, W, W, W, W, W])).cleared).toBe(false);
});

test('どのステージの目標の高さも、画面の中で建てられる', () => {
  for (const s of STAGES) expect(s.goalHeight).toBeLessThan(VIEW.maxY);
});

const withLoad = (d: Design, y: number, mass = 50): Design => ({ ...d, loads: [{ y, mass }] });

test('3-1：重い機械を高い階に置くと倒れ、いちばん下の階なら耐える', () => {
  const s = stage('3-1');
  const mass = s.load!.mass;
  expect(canStartTest(s, s.initial()).ok).toBe(false); // 機械を置かないと試験できない
  expect(play(s, withLoad(s.initial(), 3, mass)).cleared).toBe(true);
  for (const y of [6, 9, 12]) expect({ y, cleared: play(s, withLoad(s.initial(), y, mass)).cleared }).toEqual({ y, cleared: false });
});

test('3-2：幅4mの7階建ては倒れ、幅8mに広げれば予算内で耐える', () => {
  const s = stage('3-2');
  expect(play(s, bracedTower(Array(7).fill(W))).cleared).toBe(false);
  const wide = wideTower(7, 2);
  expect(designCost(wide)).toBeLessThanOrEqual(s.budget);
  expect(play(s, wide).cleared).toBe(true);
});

test('4-1：小刻みな揺れでは3階建てが共振して倒れ、1階を鉄骨にすると耐える。ふつうの揺れなら元のままでも耐える', () => {
  const s = stage('4-1');
  expect(play(s, s.initial()).cleared).toBe(false);
  expect(play(s, bracedTower([S, W, W])).cleared).toBe(true);
  const mixed = { ...s, quake: { level: 'strong' as const, type: 'mixed' as const } };
  expect(play(mixed, s.initial()).cleared).toBe(true);
});

test('4-2：ゆったりした揺れでは、下2階だけ鉄骨の7階建ては倒れ、下3階を鉄骨にすると予算内で耐える', () => {
  const s = stage('4-2');
  expect(play(s, bracedTower([S, S, W, W, W, W, W])).cleared).toBe(false);
  const solved = bracedTower([S, S, S, W, W, W, W]);
  expect(designCost(solved)).toBeLessThanOrEqual(s.budget);
  expect(play(s, solved).cleared).toBe(true);
  // ふつうの揺れなら、下2階だけ鉄骨でも耐える（揺れ方で結果が変わる）
  expect(play(stage('challenge'), bracedTower([S, S, W, W, W, W, W])).cleared).toBe(true);
});

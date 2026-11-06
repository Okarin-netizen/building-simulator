// 各ステージが「工夫すれば解ける」「工夫しないと解けない」ことを確かめる。

import { addMember, designCost, frameDesign, type Design } from '../physics/design';
import { makeQuake, TEST_DURATION } from '../physics/quake';
import { createWorld, step } from '../physics/world';
import { canStartTest, evaluate } from './evaluate';
import { breakAdvice } from './predict';
import { bracedTower, stageById, STAGES, wideTower, type Stage } from './stages';
import { VIEW } from '../render';

function play(stage: Stage, design: Design) {
  expect(canStartTest(stage, design).ok).toBe(true);
  const world = stage.wind
    ? createWorld(design, null, { speed: stage.wind, duration: TEST_DURATION })
    : createWorld(design, makeQuake(stage.quake.level, stage.quake.type));
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

test('5-1：強い風で木造5階建ては倒れ、1階を鉄骨にするか、幅を8mに広げれば耐える', () => {
  const s = stage('5-1');
  expect(play(s, s.initial()).cleared).toBe(false);
  expect(play(s, bracedTower([S, W, W, W, W])).cleared).toBe(true);
  const wide = wideTower(5, 2);
  expect(designCost(wide)).toBeLessThanOrEqual(s.budget);
  expect(play(s, wide).cleared).toBe(true);
});

/** 筋交いと反対向きに、制震ダンパーを下から floors 階分入れる */
function withDampers(d: Design, floors: number): Design {
  const c: Design = JSON.parse(JSON.stringify(d));
  for (let f = 0; f < floors; f++) {
    const y0 = f * 3;
    if (f % 2 === 0) addMember(c, 4, y0, 0, y0 + 3, 'damper');
    else addMember(c, 0, y0, 4, y0 + 3, 'damper');
  }
  return c;
}

test('6-1：木造6階建ては倒れ、1階に制震ダンパーを1本入れると予算内で耐える', () => {
  const s = stage('6-1');
  expect(play(s, s.initial()).cleared).toBe(false);
  const solved = withDampers(s.initial(), 1);
  expect(designCost(solved)).toBeLessThanOrEqual(s.budget);
  expect(play(s, solved).cleared).toBe(true);
});

test('6-2：コンクリートの5階建ては倒れ、免震ゴムを入れると予算内でこわれずに耐える', () => {
  const s = stage('6-2');
  expect(play(s, s.initial()).cleared).toBe(false);
  const iso = { ...s.initial(), isolated: true };
  expect(designCost(iso)).toBeLessThanOrEqual(s.budget);
  const ev = play(s, iso);
  expect(ev.cleared).toBe(true);
  expect(ev.checks[1].ok).toBe(true); // こわれた所が0
});

test('最高タワー：てっぺんに棒を立てて折れても記録にならない（一部がくずれた扱い）', () => {
  const s = stage('challenge');
  const d = bracedTower([S, S, W, W, W, W, W, W]);
  addMember(d, 0, 24, 0, 29, W);
  const ev = play(s, d);
  expect(ev.cleared).toBe(false);
  expect(ev.fell).not.toBe('none');
});

test('2-3：鉄骨を多めにして×の筋交いも入れると、星3つが取れる', () => {
  const s = stage('2-3');
  const d = bracedTower([S, S, S, S, W, W, W, W]);
  addMember(d, 0, 12, 4, 15, W); // 5階に反対向きの筋交いを足して×にする
  addMember(d, 4, 12, 0, 15, W);
  expect(designCost(d)).toBeLessThanOrEqual(s.budget);
  expect(play(s, d).stars).toBe(3);
});

test('材料が切りかわったすぐ上の階がこわれたら、その説明が出る', () => {
  const s = stage('2-3');
  const d = bracedTower([S, S, S, W, W, W, W, W]);
  const world = createWorld(d, makeQuake(s.quake.level, s.quake.type));
  for (let i = 0; i < 18 * 60; i++) step(world, 1 / 60);
  expect(world.collapsed).toBe(true);
  expect(breakAdvice(d, world.firstBreak)).toContain('材料が切りかわった');
});

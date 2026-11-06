import { frameDesign } from '../physics/design';
import { makeQuake } from '../physics/quake';
import { createWorld, SETTLE_TIME, step } from '../physics/world';
import { describeMember, judgePrediction } from './predict';
import { applyFrame, captureFrame, frameIndexAt } from './replay';

function run(design: ReturnType<typeof frameDesign>, level: 'weak' | 'medium' | 'strong') {
  const world = createWorld(design, makeQuake(level));
  const frames = [captureFrame(world, 0)];
  while (world.time < SETTLE_TIME + 17 && !(world.collapsed && world.time > (world.collapseTime ?? 0) + 2.5)) {
    step(world, 1 / 60);
    frames.push(captureFrame(world, 0));
  }
  return { world, frames };
}

describe('最初にこわれた所と予想の答え合わせ', () => {
  const square = frameDesign({ floors: 3 });
  const braced = frameDesign({ floors: 3, braced: true });

  test('四角い枠は中くらいの地震でどこかが最初にこわれ、時刻が記録される', () => {
    const { world } = run(square, 'medium');
    expect(world.firstBreak).not.toBeNull();
    expect(world.firstBreak!.time).toBeGreaterThan(SETTLE_TIME);
  });

  test('筋交い入りは弱い地震でこわれず、「こわれない」予想が当たる', () => {
    const { world } = run(braced, 'weak');
    expect(world.firstBreak).toBeNull();
    expect(judgePrediction(braced, { kind: 'none' }, null).verdict).toBe('hit');
    expect(judgePrediction(braced, { kind: 'member', index: 0 }, null).verdict).toBe('miss');
  });

  test('同じ部材なら大当たり、近くならおしい、遠ければはずれ', () => {
    // 部材0 は1階の左の柱（0,0)-(0,3)
    const t = 2;
    expect(judgePrediction(square, { kind: 'member', index: 0 }, { kind: 'member', index: 0, time: t }).verdict).toBe('hit');
    const node = square.nodes.findIndex((n) => n.x === 0 && n.y === 3);
    expect(judgePrediction(square, { kind: 'member', index: 0 }, { kind: 'joint', node, time: t }).verdict).toBe('hit');
    const top = square.nodes.findIndex((n) => n.x === 4 && n.y === 9);
    expect(judgePrediction(square, { kind: 'member', index: 0 }, { kind: 'joint', node: top, time: t }).verdict).toBe('miss');
    const rightBase = square.members.findIndex((m) => {
      const a = square.nodes[m.a];
      const b = square.nodes[m.b];
      return a.x === 4 && b.x === 4 && Math.min(a.y, b.y) === 0;
    });
    // 左右対称なので、反対側の同じ階の柱でも大当たり。反対側の基礎はおしい
    expect(judgePrediction(square, { kind: 'member', index: 0 }, { kind: 'member', index: rightBase, time: t }).verdict).toBe('hit');
    const rightFoot = square.nodes.findIndex((n) => n.x === 4 && n.y === 0);
    expect(judgePrediction(square, { kind: 'member', index: 0 }, { kind: 'joint', node: rightFoot, time: t }).verdict).toBe('near');
    const beam = square.members.findIndex((m) => square.nodes[m.a].y === 3 && square.nodes[m.b].y === 3);
    expect(judgePrediction(square, { kind: 'member', index: rightBase }, { kind: 'member', index: beam, time: t }).verdict).toBe('near');
  });

  test('部材を言葉にする', () => {
    expect(describeMember(square, 0)).toBe('1階の柱（木材）');
    const beam = square.members.findIndex((m) => square.nodes[m.a].y === 3 && square.nodes[m.b].y === 3);
    expect(describeMember(square, beam)).toBe('1階の梁（木材）');
    const brace = braced.members.findIndex((m) => {
      const a = braced.nodes[m.a];
      const b = braced.nodes[m.b];
      return a.x !== b.x && a.y !== b.y && Math.min(a.y, b.y) === 3;
    });
    expect(describeMember(braced, brace)).toBe('2階の筋交い（木材）');
  });

  test('記録したコマを書き戻すと、その時刻の形にもどる', () => {
    const { world, frames } = run(square, 'medium');
    const i = frameIndexAt(frames, SETTLE_TIME + 3);
    expect(frames[i].time).toBeLessThanOrEqual(SETTLE_TIME + 3);
    expect(frames[i + 1].time).toBeGreaterThan(SETTLE_TIME + 3);
    applyFrame(world, frames[i]);
    expect(world.nodes[0].x).toBeCloseTo(frames[i].x[0], 5);
    expect(world.members.filter((m) => m.broken).length).toBe([...frames[i].memberBroken].filter((b) => b).length);
  });
});

// 試験のようすを1コマずつ記録して、あとからスロー再生・巻き戻しできるようにする。

import type { World } from '../physics/world';

export interface Frame {
  time: number;
  groundShift: number;
  x: Float32Array;
  y: Float32Array;
  strain: Float32Array;
  memberBroken: Uint8Array;
  jointRatio: Float32Array;
  jointBroken: Uint8Array;
}

export function captureFrame(world: World, groundShift: number): Frame {
  return {
    time: world.time,
    groundShift,
    x: Float32Array.from(world.nodes, (n) => n.x),
    y: Float32Array.from(world.nodes, (n) => n.y),
    strain: Float32Array.from(world.members, (m) => m.strain),
    memberBroken: Uint8Array.from(world.members, (m) => (m.broken ? 1 : 0)),
    jointRatio: Float32Array.from(world.joints, (j) => j.ratio),
    jointBroken: Uint8Array.from(world.joints, (j) => (j.broken ? 1 : 0)),
  };
}

/** 記録した1コマの状態を world に書き戻す（描画用。計算はもう進めない） */
export function applyFrame(world: World, f: Frame): void {
  world.time = f.time;
  world.nodes.forEach((n, i) => {
    n.x = f.x[i];
    n.y = f.y[i];
  });
  world.members.forEach((m, i) => {
    m.strain = f.strain[i];
    m.broken = f.memberBroken[i] === 1;
  });
  world.joints.forEach((j, i) => {
    j.ratio = f.jointRatio[i];
    j.broken = f.jointBroken[i] === 1;
  });
}

/** 時刻 t にいちばん近い（t 以前の）コマの番号 */
export function frameIndexAt(frames: Frame[], t: number): number {
  let lo = 0;
  let hi = frames.length - 1;
  if (hi < 0) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].time <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

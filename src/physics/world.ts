// 質点とばねによる建物の揺れの計算。
// - 節点（つなぎ目）＝ 重さを持つ点
// - 部材 ＝ 伸び縮みに逆らう「ばね」。伸び縮みが限界を超えると折れる
// - 接合部 ＝ 部材どうしの角度が変わるのに逆らう「回転ばね」。曲がりすぎると壊れて、ただのピンになる
// 四角い枠は接合部の曲げだけで横の力に耐えるので揺れに弱く、
// 三角形（筋交い）があると部材の伸び縮みで耐えるので揺れに強くなる。

import { MATERIALS, type Material } from './materials';
import type { Design } from './design';
import { groundOffset, type Quake } from './quake';

export const GRAVITY = 9.8;
/** 床や人の重さとして、地面以外の節点に加える重さ */
export const FLOOR_MASS = 3;
const SUBSTEPS = 24;
const AXIAL_DAMPING_RATIO = 0.2;
/** 重力を少しずつかけて、置いた瞬間に建物がはねないようにする時間（秒） */
export const SETTLE_TIME = 1;
/** 接合部の揺れを抑える強さ（回転ばねの強さに対する割合） */
const JOINT_DAMPING = 0.01;
const AIR_DAMPING = 0.05;
/** 計算が暴れたときの安全装置（m/s） */
const MAX_SPEED = 25;

export interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number;
  fy: number;
  mass: number;
  /** 地面に固定された節点（基礎） */
  support: boolean;
  baseX: number;
  baseY: number;
}

export interface Member {
  a: number;
  b: number;
  rest: number;
  stiffness: number;
  damping: number;
  material: Material;
  broken: boolean;
  /** 伸び縮みの割合（＋で引っ張り、−で押しつぶし） */
  strain: number;
}

export interface Joint {
  node: number;
  m1: number; // 部材の番号
  /** 部材の番号。-1 のときは地面（基礎の固定） */
  m2: number;
  restAngle: number;
  stiffness: number;
  breakAngle: number;
  broken: boolean;
  /** 曲がった角度 ÷ 壊れる角度 */
  ratio: number;
  lastAngle: number;
}

export interface World {
  nodes: Node[];
  members: Member[];
  joints: Joint[];
  time: number;
  quake: Quake | null;
  initialHeight: number;
  /** 最上部の横揺れの最大値（m） */
  maxDrift: number;
  collapsed: boolean;
  /** 倒れた時刻（秒） */
  collapseTime: number | null;
}

function otherEnd(m: Member, node: number): number {
  return m.a === node ? m.b : m.a;
}

function angleOf(world: World, from: number, to: number): number {
  const p = world.nodes[from];
  const q = world.nodes[to];
  return Math.atan2(q.y - p.y, q.x - p.x);
}

function wrap(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export function createWorld(design: Design, quake: Quake | null = null): World {
  const nodes: Node[] = design.nodes.map((n) => ({
    x: n.x,
    y: n.y,
    vx: 0,
    vy: 0,
    fx: 0,
    fy: 0,
    mass: n.y <= 0 ? 0 : FLOOR_MASS,
    support: n.y <= 0,
    baseX: n.x,
    baseY: n.y,
  }));

  const members: Member[] = design.members.map((dm) => {
    const a = nodes[dm.a];
    const b = nodes[dm.b];
    const rest = Math.hypot(b.x - a.x, b.y - a.y);
    const material = MATERIALS[dm.material];
    const half = (rest * material.massPerMeter) / 2;
    a.mass += half;
    b.mass += half;
    return { a: dm.a, b: dm.b, rest, stiffness: material.axialStiffness / rest, damping: 0, material, broken: false, strain: 0 };
  });

  for (const m of members) {
    const ma = nodes[m.a].support ? nodes[m.b].mass : nodes[m.a].mass;
    const mb = nodes[m.b].support ? nodes[m.a].mass : nodes[m.b].mass;
    const mEff = (ma * mb) / (ma + mb);
    m.damping = 2 * AXIAL_DAMPING_RATIO * Math.sqrt(m.stiffness * mEff);
  }

  const world: World = {
    nodes,
    members,
    joints: [],
    time: 0,
    quake,
    initialHeight: nodes.reduce((h, n) => Math.max(h, n.y), 0),
    maxDrift: 0,
    collapsed: false,
    collapseTime: null,
  };

  // 接合部：各節点で、となり合う部材どうしを回転ばねでつなぐ
  nodes.forEach((_, ni) => {
    const attached = members
      .map((m, mi) => ({ m, mi }))
      .filter(({ m }) => m.a === ni || m.b === ni)
      .map(({ m, mi }) => ({ mi, angle: angleOf(world, ni, otherEnd(m, ni)) }))
      .sort((p, q) => p.angle - q.angle);
    for (let k = 0; k + 1 < attached.length; k++) {
      const m1 = members[attached[k].mi];
      const m2 = members[attached[k + 1].mi];
      const rest = wrap(attached[k + 1].angle - attached[k].angle);
      world.joints.push({
        node: ni,
        m1: attached[k].mi,
        m2: attached[k + 1].mi,
        restAngle: rest,
        stiffness: Math.min(m1.material.jointStiffness, m2.material.jointStiffness),
        breakAngle: Math.min(m1.material.jointBreakAngle, m2.material.jointBreakAngle),
        broken: false,
        ratio: 0,
        lastAngle: rest,
      });
    }
    // 基礎：地面に固定された節点では、部材と地面の角度も保つ
    if (nodes[ni].support) {
      for (const { mi, angle } of attached) {
        const m = members[mi];
        const rest = wrap(0 - angle);
        world.joints.push({
          node: ni,
          m1: mi,
          m2: -1,
          restAngle: rest,
          stiffness: m.material.jointStiffness,
          breakAngle: m.material.jointBreakAngle,
          broken: false,
          ratio: 0,
          lastAngle: rest,
        });
      }
    }
  });

  return world;
}

function applyMemberForces(world: World): void {
  const { nodes } = world;
  for (const m of world.members) {
    if (m.broken) continue;
    const a = nodes[m.a];
    const b = nodes[m.b];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1e-9;
    const ux = dx / len;
    const uy = dy / len;
    m.strain = (len - m.rest) / m.rest;
    if (Math.abs(m.strain) > m.material.breakStrain) {
      m.broken = true;
      continue;
    }
    const relV = (b.vx - a.vx) * ux + (b.vy - a.vy) * uy;
    const f = m.stiffness * (len - m.rest) + m.damping * relV;
    a.fx += f * ux;
    a.fy += f * uy;
    b.fx -= f * ux;
    b.fy -= f * uy;
  }
}

function applyJointForces(world: World, dt: number): void {
  const { nodes, members } = world;
  for (const j of world.joints) {
    if (j.broken) continue;
    const m1 = members[j.m1];
    const toGround = j.m2 === -1;
    const m2 = toGround ? null : members[j.m2];
    if (m1.broken || (m2 && m2.broken)) {
      j.broken = true;
      continue;
    }
    const B = nodes[j.node];
    const A = nodes[otherEnd(m1, j.node)];
    const C = m2 ? nodes[otherEnd(m2, j.node)] : null;
    const ux = A.x - B.x;
    const uy = A.y - B.y;
    const vx = C ? C.x - B.x : 1;
    const vy = C ? C.y - B.y : 0;
    const angle = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const bend = wrap(angle - j.restAngle);
    j.ratio = Math.abs(bend) / j.breakAngle;
    if (j.ratio > 1) {
      j.broken = true;
      continue;
    }
    const angVel = wrap(angle - j.lastAngle) / dt;
    j.lastAngle = angle;
    const torque = j.stiffness * (bend + JOINT_DAMPING * angVel);
    const u2 = ux * ux + uy * uy;
    const v2 = vx * vx + vy * vy;
    if (u2 < 0.04 || v2 < 0.04) {
      // つぶれて部材の端どうしが重なった接合部は、計算が暴れないよう壊れたことにする
      j.broken = true;
      continue;
    }
    // A には u に垂直な力、C には v に垂直な力、B にはその反作用
    const fAx = (torque * -uy) / u2;
    const fAy = (torque * ux) / u2;
    const fCx = (-torque * -vy) / v2;
    const fCy = (-torque * vx) / v2;
    A.fx += fAx;
    A.fy += fAy;
    if (C) {
      C.fx += fCx;
      C.fy += fCy;
    }
    B.fx -= fAx + (C ? fCx : 0);
    B.fy -= fAy + (C ? fCy : 0);
  }
}

/** 時間を dt 秒すすめる */
export function step(world: World, dt: number): void {
  const h = dt / SUBSTEPS;
  for (let s = 0; s < SUBSTEPS; s++) {
    const t = world.time + h;
    const gx = world.quake ? groundOffset(world.quake, t - SETTLE_TIME) : 0;
    const g = GRAVITY * Math.min(1, t / SETTLE_TIME);

    for (const n of world.nodes) {
      n.fx = 0;
      n.fy = -n.mass * g;
    }
    applyMemberForces(world);
    applyJointForces(world, h);

    for (const n of world.nodes) {
      if (n.support) {
        // 基礎は地面と一緒に動く
        const nx = n.baseX + gx;
        n.vx = (nx - n.x) / h;
        n.vy = 0;
        n.x = nx;
        n.y = n.baseY;
        continue;
      }
      n.vx += (n.fx / n.mass - AIR_DAMPING * n.vx) * h;
      n.vy += (n.fy / n.mass - AIR_DAMPING * n.vy) * h;
      const speed = Math.hypot(n.vx, n.vy);
      if (speed > MAX_SPEED) {
        n.vx *= MAX_SPEED / speed;
        n.vy *= MAX_SPEED / speed;
      }
      n.x += n.vx * h;
      n.y += n.vy * h;
      if (n.y < 0) {
        // 地面にぶつかった
        n.y = 0;
        if (n.vy < 0) n.vy = 0;
        n.vx *= 0.5;
      }
    }
    world.time = t;
  }
  updateStatus(world);
}

function updateStatus(world: World): void {
  let top: Node | null = null;
  for (const n of world.nodes) if (!top || n.baseY > top.baseY) top = n;
  if (!top) return;
  const gx = world.quake ? groundOffset(world.quake, world.time - SETTLE_TIME) : 0;
  const drift = Math.abs(top.x - (top.baseX + gx));
  world.maxDrift = Math.max(world.maxDrift, drift);

  const currentHeight = world.nodes.reduce((h, n) => Math.max(h, n.y), 0);
  const fellDown = world.nodes.some((n) => !n.support && n.baseY > 0.5 && n.y < 0.05);
  if (!world.collapsed && (fellDown || currentHeight < world.initialHeight * 0.7)) {
    world.collapsed = true;
    world.collapseTime = world.time;
  }
}

export function brokenCount(world: World): { members: number; joints: number } {
  return {
    members: world.members.filter((m) => m.broken).length,
    joints: world.joints.filter((j) => j.broken).length,
  };
}

/** 部材にかかる力の強さ（0〜1以上）。色分けに使う */
export function memberStressRatio(m: Member): number {
  return Math.abs(m.strain) / m.material.breakStrain;
}

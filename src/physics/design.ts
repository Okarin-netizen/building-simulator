// 生徒が作る「設計図」。物理計算とは切り離して持つ。
// 座標の単位はメートル。x は右向き、y は上向き。y = 0 が地面。

import { MATERIALS, type MaterialId } from './materials';

export interface DesignNode {
  x: number;
  y: number;
}

export interface DesignMember {
  a: number; // 節点の番号
  b: number;
  material: MaterialId;
}

export interface Design {
  nodes: DesignNode[];
  members: DesignMember[];
}

export function emptyDesign(): Design {
  return { nodes: [], members: [] };
}

/** 同じ位置の節点があればその番号を、なければ新しく作って番号を返す */
export function findOrAddNode(design: Design, x: number, y: number): number {
  const i = design.nodes.findIndex((n) => n.x === x && n.y === y);
  if (i >= 0) return i;
  design.nodes.push({ x, y });
  return design.nodes.length - 1;
}

/** 部材を追加する。同じ2点を結ぶ部材があれば材料を置き換える */
export function addMember(design: Design, x1: number, y1: number, x2: number, y2: number, material: MaterialId): void {
  if (x1 === x2 && y1 === y2) return;
  const a = findOrAddNode(design, x1, y1);
  const b = findOrAddNode(design, x2, y2);
  const existing = design.members.find((m) => (m.a === a && m.b === b) || (m.a === b && m.b === a));
  if (existing) {
    existing.material = material;
    return;
  }
  design.members.push({ a, b, material });
}

/** 部材を消し、どの部材にもつながらない節点を片付ける */
export function removeMember(design: Design, index: number): void {
  design.members.splice(index, 1);
  const used = new Set<number>();
  for (const m of design.members) {
    used.add(m.a);
    used.add(m.b);
  }
  const remap = new Map<number, number>();
  const nodes: DesignNode[] = [];
  design.nodes.forEach((n, i) => {
    if (used.has(i)) {
      remap.set(i, nodes.length);
      nodes.push(n);
    }
  });
  design.nodes = nodes;
  for (const m of design.members) {
    m.a = remap.get(m.a)!;
    m.b = remap.get(m.b)!;
  }
}

export function memberLength(design: Design, m: DesignMember): number {
  const a = design.nodes[m.a];
  const b = design.nodes[m.b];
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** 建てるのにかかる費用（万円） */
export function designCost(design: Design): number {
  let cost = 0;
  for (const m of design.members) cost += memberLength(design, m) * MATERIALS[m.material].costPerMeter;
  return Math.round(cost);
}

export function designHeight(design: Design): number {
  return design.nodes.reduce((h, n) => Math.max(h, n.y), 0);
}

/**
 * 見本の建物。幅 width m、1階の高さ storyHeight m、floors 階建ての枠。
 * braced = true なら各階に筋交い（斜めの部材）を入れる。
 */
export function frameDesign(opts: {
  floors: number;
  width?: number;
  storyHeight?: number;
  material?: MaterialId;
  braced?: boolean;
}): Design {
  const { floors, width = 4, storyHeight = 3, material = 'wood', braced = false } = opts;
  const d = emptyDesign();
  for (let f = 0; f < floors; f++) {
    const y0 = f * storyHeight;
    const y1 = (f + 1) * storyHeight;
    addMember(d, 0, y0, 0, y1, material); // 左の柱
    addMember(d, width, y0, width, y1, material); // 右の柱
    addMember(d, 0, y1, width, y1, material); // 梁
    if (braced) addMember(d, f % 2 === 0 ? 0 : width, y0, f % 2 === 0 ? width : 0, y1, material);
  }
  return d;
}

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

/** 機械や水タンクなどの重いもの。高さ y の床に置き、その高さのつなぎ目に重さを等しく分ける */
export interface DesignLoad {
  y: number;
  mass: number;
  /** 画面に出す名前（例：機械） */
  name?: string;
}

export interface Design {
  nodes: DesignNode[];
  members: DesignMember[];
  /** 重いもの（ない設計図もある） */
  loads?: DesignLoad[];
  /** 免震ゴムの上に建てる */
  isolated?: boolean;
}

/** 免震ゴムの値段（基礎1か所あたり、万円） */
export const ISOLATION_COST_PER_BASE = 10;

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

/** 点 p が線分 ab の上（両端は除く）にあるか。座標は方眼の整数なので、ぴったりで判定する */
function strictlyInside(p: DesignNode, a: DesignNode, b: DesignNode): boolean {
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  if (cross !== 0) return false;
  const dot = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
  const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  return dot > 0 && dot < len2;
}

/** 2つの節点を1本の部材でつなぐ。同じ2点を結ぶ部材があれば材料を置き換える */
function connect(design: Design, a: number, b: number, material: MaterialId): void {
  const existing = design.members.find((m) => (m.a === a && m.b === b) || (m.a === b && m.b === a));
  if (existing) existing.material = material;
  else design.members.push({ a, b, material });
}

/** 既存の部材の途中に節点 n があれば、そこで2本に分ける（つなぎ目を作る） */
function splitMembersAt(design: Design, n: number): void {
  const p = design.nodes[n];
  for (let i = design.members.length - 1; i >= 0; i--) {
    const m = design.members[i];
    if (!strictlyInside(p, design.nodes[m.a], design.nodes[m.b])) continue;
    design.members.splice(i, 1, { a: m.a, b: n, material: m.material }, { a: n, b: m.b, material: m.material });
  }
}

/**
 * 部材を追加する。同じ2点を結ぶ部材があれば材料を置き換える。
 * 生徒が長い柱を一度に引いても途中の梁とつながるように、
 * 新しい部材の途中にある点や、既存の部材の途中に置いた端は、つなぎ目として部材を分ける。
 */
export function addMember(design: Design, x1: number, y1: number, x2: number, y2: number, material: MaterialId): void {
  if (x1 === x2 && y1 === y2) return;
  const a = findOrAddNode(design, x1, y1);
  const b = findOrAddNode(design, x2, y2);
  splitMembersAt(design, a);
  splitMembersAt(design, b);
  const A = design.nodes[a];
  const B = design.nodes[b];
  const along = (n: DesignNode) => (n.x - A.x) * (B.x - A.x) + (n.y - A.y) * (B.y - A.y);
  const between = design.nodes
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => strictlyInside(n, A, B))
    .sort((p, q) => along(p.n) - along(q.n))
    .map(({ i }) => i);
  const chain = [a, ...between, b];
  for (let k = 0; k + 1 < chain.length; k++) connect(design, chain[k], chain[k + 1], material);
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
  // 床（その高さのつなぎ目）がなくなった重いものは、いっしょに外す
  if (design.loads) design.loads = design.loads.filter((l) => nodes.some((n) => n.y === l.y && n.y > 0));
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
  if (design.isolated) cost += design.nodes.filter((n) => n.y <= 0).length * ISOLATION_COST_PER_BASE;
  return Math.round(cost);
}

export function designHeight(design: Design): number {
  return design.nodes.reduce((h, n) => Math.max(h, n.y), 0);
}

/**
 * 見本の建物。幅 width m、1階の高さ storyHeight m、floors 階建ての枠。
 * floorMaterials を渡すと、階ごとに材料を変えられる（下の階から順に。階数もその長さになる）。
 * braced = true なら各階に筋交い（斜めの部材）を、階ごとに向きを変えて入れる。
 */
export function frameDesign(opts: {
  floors: number;
  width?: number;
  storyHeight?: number;
  material?: MaterialId;
  floorMaterials?: MaterialId[];
  braced?: boolean;
}): Design {
  const { width = 4, storyHeight = 3, material = 'wood', braced = false } = opts;
  const floorMaterials = opts.floorMaterials ?? Array<MaterialId>(opts.floors).fill(material);
  const d = emptyDesign();
  floorMaterials.forEach((m, f) => {
    const y0 = f * storyHeight;
    const y1 = (f + 1) * storyHeight;
    addMember(d, 0, y0, 0, y1, m); // 左の柱
    addMember(d, width, y0, width, y1, m); // 右の柱
    addMember(d, 0, y1, width, y1, m); // 梁
    if (braced) addMember(d, f % 2 === 0 ? 0 : width, y0, f % 2 === 0 ? width : 0, y1, m); // 筋交い
  });
  return d;
}

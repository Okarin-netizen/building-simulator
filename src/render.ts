// 画面への描画。物理の世界（メートル）と画面（ピクセル）の変換もここで行う。

import { MATERIALS } from './physics/materials';
import type { Design } from './physics/design';
import { midpoint } from './physics/geometry';
import { memberStressRatio, SETTLE_TIME, windHeightFactor, windSpeed, type FirstBreak, type World } from './physics/world';

/** 画面に映す範囲（メートル） */
export const VIEW = { minX: -6, maxX: 16, maxY: 30 };
export const MAX_MEMBER_LENGTH = 6;

export interface Viewport {
  /** 画面に映す高さ（m）。ステージの目標の高さに合わせて拡大する */
  maxY: number;
  scale: number; // 1m あたりのピクセル
  originX: number; // x = 0 の画面上の位置
  groundY: number; // y = 0 の画面上の位置
}

/** 画面に映す高さ：目標の高さ＋6m（最低12m、最大 VIEW.maxY）。建物がもっと高ければそれに合わせる */
export function viewHeightFor(goalHeight: number, buildingHeight = 0): number {
  const want = goalHeight > 0 ? goalHeight + 6 : VIEW.maxY;
  return Math.min(VIEW.maxY, Math.max(12, want, buildingHeight + 3));
}

export function makeViewport(width: number, height: number, maxY: number = VIEW.maxY): Viewport {
  const margin = 32;
  const scale = Math.min((width - margin * 2) / (VIEW.maxX - VIEW.minX), (height - margin * 2) / maxY);
  const usedWidth = scale * (VIEW.maxX - VIEW.minX);
  return {
    maxY,
    scale,
    originX: (width - usedWidth) / 2 - VIEW.minX * scale,
    groundY: height - margin,
  };
}

export const toScreen = (v: Viewport, x: number, y: number) => ({ sx: v.originX + x * v.scale, sy: v.groundY - y * v.scale });
export const toWorld = (v: Viewport, sx: number, sy: number) => ({ x: (sx - v.originX) / v.scale, y: (v.groundY - sy) / v.scale });
/** 点（メートル）を画面の位置にする */
const screenOf = (v: Viewport, p: { x: number; y: number }) => toScreen(v, p.x, p.y);

type ScreenPoint = { sx: number; sy: number };

/** 画面上の2点を結ぶ線を、いまの線の色・太さで引く */
function strokeLine(ctx: CanvasRenderingContext2D, a: ScreenPoint, b: ScreenPoint): void {
  ctx.beginPath();
  ctx.moveTo(a.sx, a.sy);
  ctx.lineTo(b.sx, b.sy);
  ctx.stroke();
}

/** 基礎（地面とのつなぎ目）の土台 */
function drawFoundation(ctx: CanvasRenderingContext2D, p: ScreenPoint): void {
  ctx.fillStyle = '#5b4a33';
  ctx.fillRect(p.sx - 9, p.sy - 2, 18, 8);
}

/** 0（余裕）→ 1（こわれそう）を 青 → 黄 → 赤 にする */
export function stressColor(ratio: number): string {
  const r = Math.max(0, Math.min(1, ratio));
  const lerp = (a: number[], b: number[], t: number) => a.map((c, i) => Math.round(c + (b[i] - c) * t));
  const blue = [47, 111, 214];
  const yellow = [242, 194, 48];
  const red = [217, 58, 43];
  const c = r < 0.5 ? lerp(blue, yellow, r / 0.5) : lerp(yellow, red, (r - 0.5) / 0.5);
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function drawBackground(ctx: CanvasRenderingContext2D, v: Viewport, w: number, h: number, groundShift: number): void {
  ctx.fillStyle = '#dfeef7';
  ctx.fillRect(0, 0, w, h);

  // 1m ごとの方眼（5m ごとに少し濃く）
  const gridColor = (meters: number) => (meters % 5 === 0 ? '#bcd3e3' : '#cfe1ec');
  ctx.lineWidth = 1;
  for (let x = Math.ceil(VIEW.minX); x <= VIEW.maxX; x++) {
    const { sx } = toScreen(v, x, 0);
    ctx.strokeStyle = gridColor(x);
    strokeLine(ctx, { sx, sy: 0 }, { sx, sy: v.groundY });
  }
  for (let y = 1; y <= v.maxY; y++) {
    const { sy } = toScreen(v, 0, y);
    // 1階分（3m）ごとに線を濃くし、高さを書く
    ctx.strokeStyle = y % 3 === 0 ? '#bcd3e3' : '#cfe1ec';
    strokeLine(ctx, { sx: 0, sy }, { sx: w, sy });
    if (y % 3 === 0) {
      ctx.fillStyle = '#5a6b78';
      ctx.font = 'bold 12px system-ui';
      ctx.fillText(`${y}m`, 4, sy - 3);
    }
  }

  // 地面（地震中は横にずれる）
  const shiftPx = groundShift * v.scale;
  ctx.fillStyle = '#8a6a43';
  ctx.fillRect(0, v.groundY, w, h - v.groundY);
  ctx.strokeStyle = '#5a4126';
  ctx.lineWidth = 4;
  strokeLine(ctx, { sx: 0, sy: v.groundY }, { sx: w, sy: v.groundY });
  ctx.strokeStyle = 'rgba(40, 26, 10, 0.35)';
  ctx.lineWidth = 2;
  const step = 24;
  const offset = ((shiftPx % step) + step) % step;
  for (let x = -step + offset; x < w + step; x += step) strokeLine(ctx, { sx: x, sy: v.groundY + 6 }, { sx: x - 10, sy: v.groundY + 18 });
}

/** 部材を置ける点（方眼の交わる所）を、小さな点で示す */
function drawGridDots(ctx: CanvasRenderingContext2D, v: Viewport): void {
  ctx.save();
  ctx.fillStyle = '#7d98ad';
  const r = Math.max(1.5, Math.min(3, v.scale * 0.08));
  for (let x = Math.ceil(VIEW.minX); x <= VIEW.maxX; x++) {
    for (let y = 0; y < v.maxY; y++) {
      const p = toScreen(v, x, y);
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** 目標の高さの線 */
function drawGoalLine(ctx: CanvasRenderingContext2D, v: Viewport, w: number, goalHeight: number): void {
  if (goalHeight <= 0) return;
  const { sy } = toScreen(v, 0, goalHeight);
  ctx.save();
  ctx.strokeStyle = '#2e9d55';
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 8]);
  strokeLine(ctx, { sx: 0, sy }, { sx: w, sy });
  ctx.setLineDash([]);
  // 緑の札に「目標 ○m」
  const label = `目標 ${goalHeight}m`;
  ctx.font = 'bold 14px system-ui';
  const tw = ctx.measureText(label).width;
  const bx = 12;
  const by = sy - 30;
  ctx.fillStyle = '#2e7d4a';
  ctx.beginPath();
  ctx.roundRect(bx, by, tw + 20, 24, 6);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, bx + 10, by + 12);
  ctx.restore();
}

function drawNodeDot(ctx: CanvasRenderingContext2D, sx: number, sy: number, fill: string, stroke: string, r = 5): void {
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

/** 吹き出しの札とピン（予想の印など） */
function drawPin(ctx: CanvasRenderingContext2D, sx: number, sy: number, label: string, color: string): void {
  ctx.save();
  ctx.font = 'bold 14px system-ui';
  const tw = ctx.measureText(label).width;
  const bw = tw + 18;
  const bh = 26;
  const bx = sx - bw / 2;
  const by = sy - 22 - bh;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sx, sy - 4);
  ctx.lineTo(sx, by + bh);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(sx, sy, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 8);
  ctx.fill();
  ctx.strokeStyle = '#1f1f1f';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(label, sx, by + bh / 2 + 1);
  ctx.restore();
}

/** 最初にこわれた所を示す、点滅する輪 */
function drawBreakRing(ctx: CanvasRenderingContext2D, sx: number, sy: number, pulse: number): void {
  ctx.save();
  ctx.strokeStyle = '#1f1f1f';
  ctx.lineWidth = 5;
  const r = 16 + 5 * pulse;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#f6c343';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

export const PREDICT_COLOR = '#e8452c';

/** 重いもの（機械など）を、床の上に箱で描く */
function drawLoad(ctx: CanvasRenderingContext2D, v: Viewport, points: { x: number; y: number }[], label: string): void {
  if (points.length === 0) return;
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  const base = toScreen(v, cx, cy);
  const w = Math.max(56, 2.2 * v.scale);
  const h = Math.max(26, 1.1 * v.scale);
  ctx.save();
  ctx.fillStyle = '#3c4450';
  ctx.strokeStyle = '#1f1f1f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(base.sx - w / 2, base.sy - h - 4, w, h, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f6c343';
  ctx.font = 'bold 13px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, base.sx, base.sy - h / 2 - 4);
  ctx.restore();
}

/** 免震ゴム：基礎の下の、黒い丸みのある台 */
function drawIsolators(ctx: CanvasRenderingContext2D, v: Viewport, points: { x: number; y: number }[]): void {
  ctx.save();
  for (const p of points) {
    const s = toScreen(v, p.x, 0);
    ctx.fillStyle = '#2b2b2b';
    ctx.strokeStyle = '#f6c343';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(s.sx - 13, s.sy + 1, 26, 12, 6);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** 風：左から吹く矢印。長さは風速に合わせる */
function drawWind(ctx: CanvasRenderingContext2D, v: Viewport, speed: number): void {
  if (speed <= 0) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(46, 90, 160, 0.75)';
  ctx.fillStyle = 'rgba(46, 90, 160, 0.75)';
  ctx.lineWidth = 3;
  const left = toScreen(v, VIEW.minX + 0.5, 0).sx;
  for (let y = 2; y < v.maxY; y += 3) {
    // 高い所ほど風が強い
    const len = Math.min(5, (speed / 10) * windHeightFactor(y)) * v.scale;
    const { sy } = toScreen(v, 0, y);
    strokeLine(ctx, { sx: left, sy }, { sx: left + len, sy });
    ctx.beginPath();
    ctx.moveTo(left + len + 8, sy);
    ctx.lineTo(left + len - 2, sy - 6);
    ctx.lineTo(left + len - 2, sy + 6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

const loadLabel = (l: { mass: number; name?: string }) => l.name ?? `おもり ${l.mass}`;

function memberWidth(v: Viewport): number {
  return Math.max(4, v.scale * 0.22);
}

/** 組み立て中の設計図を描く */
export function drawDesign(
  ctx: CanvasRenderingContext2D,
  v: Viewport,
  w: number,
  h: number,
  design: Design,
  preview: { x1: number; y1: number; x2: number; y2: number; color: string; ok: boolean } | null,
  hoverMember: number | null,
  goalHeight = 0,
  pinMember: number | null = null,
  selectedMember: number | null = null,
  /** 置いたばかりの部材（t：0 置いた瞬間 → 1 落ち着いた）。はまった手応えを出す */
  placed: { indices: number[]; t: number } | null = null,
  guide: BuildGuide = {},
): void {
  drawBackground(ctx, v, w, h, 0);
  if (guide.band) drawBand(ctx, v, w, guide.band.y0, guide.band.y1, guide.band.label);
  drawGridDots(ctx, v);
  drawGoalLine(ctx, v, w, goalHeight);

  ctx.lineCap = 'round';
  if (selectedMember !== null && design.members[selectedMember]) {
    // 選んだ部材は、黒ふちの黄色い光で囲んで目立たせる
    const m = design.members[selectedMember];
    const a = screenOf(v, design.nodes[m.a]);
    const b = screenOf(v, design.nodes[m.b]);
    ctx.strokeStyle = '#1f1f1f';
    ctx.lineWidth = memberWidth(v) + 14;
    strokeLine(ctx, a, b);
    ctx.strokeStyle = '#f6c343';
    ctx.lineWidth = memberWidth(v) + 9;
    strokeLine(ctx, a, b);
  }
  const glowing = placed && placed.t < 1 ? new Set(placed.indices) : null;
  if (placed && glowing) {
    // 置いた瞬間に太く白く光り、すぐ元の太さに戻る
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.9 * (1 - placed.t)})`;
    ctx.lineWidth = memberWidth(v) + 12 * (1 - placed.t);
    for (const i of glowing) {
      const m = design.members[i];
      if (m) strokeLine(ctx, screenOf(v, design.nodes[m.a]), screenOf(v, design.nodes[m.b]));
    }
  }
  design.members.forEach((m, i) => {
    ctx.strokeStyle = i === hoverMember ? '#d93a2b' : MATERIALS[m.material].color;
    ctx.lineWidth = memberWidth(v) * (placed && glowing?.has(i) ? 1 + 0.5 * (1 - placed.t) : 1);
    strokeLine(ctx, screenOf(v, design.nodes[m.a]), screenOf(v, design.nodes[m.b]));
  });

  for (const n of design.nodes) {
    const p = screenOf(v, n);
    if (n.y <= 0) drawFoundation(ctx, p);
    drawNodeDot(ctx, p.sx, p.sy, '#ffffff', '#3c4450');
  }

  if (preview) {
    const a = toScreen(v, preview.x1, preview.y1);
    const b = toScreen(v, preview.x2, preview.y2);
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = preview.ok ? preview.color : '#d93a2b';
    ctx.lineWidth = memberWidth(v);
    ctx.setLineDash(preview.ok ? [] : [8, 6]);
    strokeLine(ctx, a, b);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    drawNodeDot(ctx, b.sx, b.sy, '#ffffff', '#3c4450');
  }

  if (design.isolated) drawIsolators(ctx, v, design.nodes.filter((n) => n.y <= 0));
  for (const l of design.loads ?? []) drawLoad(ctx, v, design.nodes.filter((n) => n.y === l.y && n.y > 0), loadLabel(l));

  if (guide.ghost) {
    // お手本の線（点線）：「ここに置いてみよう」
    const a = toScreen(v, guide.ghost.x1, guide.ghost.y1);
    const b = toScreen(v, guide.ghost.x2, guide.ghost.y2);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = '#1f1f1f';
    ctx.lineWidth = memberWidth(v) + 4;
    strokeLine(ctx, a, b);
    ctx.strokeStyle = '#f6c343';
    ctx.lineWidth = memberWidth(v);
    strokeLine(ctx, a, b);
    ctx.restore();
  }

  if (pinMember !== null && design.members[pinMember]) {
    const m = design.members[pinMember];
    const p = screenOf(v, midpoint(design.nodes[m.a], design.nodes[m.b]));
    drawPin(ctx, p.sx, p.sy, 'わたしの予想', PREDICT_COLOR);
  }
}

/** 組み立て中の手助け：見直す階の帯、お手本の線 */
export interface BuildGuide {
  band?: { y0: number; y1: number; label: string };
  ghost?: { x1: number; y1: number; x2: number; y2: number };
}

/** 見直す階を、うすい黄色の帯で示す */
function drawBand(ctx: CanvasRenderingContext2D, v: Viewport, w: number, y0: number, y1: number, label: string): void {
  const top = toScreen(v, 0, y1).sy;
  const bottom = toScreen(v, 0, y0).sy;
  ctx.save();
  ctx.fillStyle = 'rgba(246, 195, 67, 0.35)';
  ctx.fillRect(0, top, w, bottom - top);
  ctx.font = 'bold 14px system-ui';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeText(label, w - 12, (top + bottom) / 2);
  ctx.fillStyle = '#1f1f1f';
  ctx.fillText(label, w - 12, (top + bottom) / 2);
  ctx.restore();
}

export interface WorldMarks {
  /** 予想した部材 */
  predictMember?: number | null;
  /** 最初にこわれた所（その時刻を過ぎたら輪を描く） */
  firstBreak?: FirstBreak | null;
  /** 0〜1 の点滅の強さ */
  pulse?: number;
}

/** 部材のまん中の、いまの位置 */
function memberMidpoint(world: World, index: number) {
  const m = world.members[index];
  return midpoint(world.nodes[m.a], world.nodes[m.b]);
}

/** 地震中の建物を、部材にかかる力の色で描く */
export function drawWorld(
  ctx: CanvasRenderingContext2D,
  v: Viewport,
  w: number,
  h: number,
  world: World,
  groundShift: number,
  goalHeight = 0,
  marks: WorldMarks = {},
): void {
  drawBackground(ctx, v, w, h, groundShift);
  drawGoalLine(ctx, v, w, goalHeight);

  ctx.lineCap = 'round';
  for (const m of world.members) {
    if (m.broken) continue;
    // 外側に材料の色、内側に力の色
    ctx.strokeStyle = m.material.color;
    ctx.lineWidth = memberWidth(v);
    strokeLine(ctx, screenOf(v, world.nodes[m.a]), screenOf(v, world.nodes[m.b]));
    ctx.strokeStyle = stressColor(memberStressRatio(m));
    ctx.lineWidth = memberWidth(v) * 0.5;
    ctx.stroke();
  }

  // つなぎ目：いちばん危ない接合部の色で塗る
  const worst = new Map<number, { ratio: number; broken: boolean }>();
  for (const j of world.joints) {
    const cur = worst.get(j.node) ?? { ratio: 0, broken: false };
    cur.ratio = Math.max(cur.ratio, j.broken ? 1 : j.ratio);
    cur.broken = cur.broken || j.broken;
    worst.set(j.node, cur);
  }
  world.nodes.forEach((n, i) => {
    const p = screenOf(v, n);
    if (n.support) drawFoundation(ctx, p);
    const info = worst.get(i);
    if (!info) {
      drawNodeDot(ctx, p.sx, p.sy, '#ffffff', '#3c4450');
    } else if (info.broken) {
      drawNodeDot(ctx, p.sx, p.sy, '#ffffff', '#d93a2b', 6);
      ctx.strokeStyle = '#d93a2b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.sx - 4, p.sy - 4);
      ctx.lineTo(p.sx + 4, p.sy + 4);
      ctx.moveTo(p.sx + 4, p.sy - 4);
      ctx.lineTo(p.sx - 4, p.sy + 4);
      ctx.stroke();
    } else {
      drawNodeDot(ctx, p.sx, p.sy, stressColor(info.ratio), '#3c4450', 5 + 2 * Math.min(1, info.ratio));
    }
  });

  if (world.isolation) drawIsolators(ctx, v, world.nodes.filter((n) => n.support));
  if (world.wind) drawWind(ctx, v, windSpeed(world.wind, world.time - SETTLE_TIME));
  for (const l of world.loads) drawLoad(ctx, v, world.nodes.filter((n) => n.baseY === l.y && !n.support), loadLabel(l));

  const fb = marks.firstBreak;
  if (fb && world.time >= fb.time) {
    const at = fb.kind === 'joint' ? world.nodes[fb.node] : memberMidpoint(world, fb.index);
    const p = screenOf(v, at);
    drawBreakRing(ctx, p.sx, p.sy, marks.pulse ?? 0);
  }

  const pm = marks.predictMember;
  if (pm !== null && pm !== undefined && world.members[pm]) {
    const p = screenOf(v, memberMidpoint(world, pm));
    drawPin(ctx, p.sx, p.sy, '予想', PREDICT_COLOR);
  }
}

// ---------- 指で操作するときの手助け ----------

/** ルーペの大きさ（半径 px）と、指からはなす距離（px） */
export const LOUPE = { radius: 58, gap: 34 };

/**
 * ルーペを出す位置：ふつうは指の真上。上に場所がなければ、指の左か右に出す。
 * （指の下にかくれない所に出すのが目的）
 */
export function loupeCenter(fingerX: number, fingerY: number, w: number, h: number): { x: number; y: number } {
  const r = LOUPE.radius;
  const off = r + LOUPE.gap;
  const clampX = (x: number) => Math.max(r + 4, Math.min(w - r - 4, x));
  const clampY = (y: number) => Math.max(r + 4, Math.min(h - r - 4, y));
  if (fingerY - off - r >= 0) return { x: clampX(fingerX), y: fingerY - off };
  // 上に入らないときは横へ（画面の広い側）
  const x = fingerX + off + r <= w || fingerX < w / 2 ? fingerX + off : fingerX - off;
  return { x: clampX(x), y: clampY(fingerY) };
}

/** ルーペの倍率：方眼の1マスがルーペの中で 30px 以上になるように（2〜4倍） */
export const loupeZoom = (v: Viewport) => Math.max(2, Math.min(4, 30 / v.scale));

/** いま指している点（スナップした先）を、大きな輪で目立たせる */
export function drawAimRing(ctx: CanvasRenderingContext2D, v: Viewport, p: { x: number; y: number }, color = '#e8452c'): void {
  const s = screenOf(v, p);
  const r = Math.max(9, v.scale * 0.55);
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(s.sx, s.sy, r + 1.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(s.sx, s.sy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

let loupeBuffer: HTMLCanvasElement | null = null;

/**
 * 指でかくれた所を、指からはなれた丸い窓に拡大して映す。
 * focus（スナップした点）を中心に映し、まん中に照準を描く。label は窓の下に出す一言（部材の長さなど）。
 */
export function drawLoupe(
  ctx: CanvasRenderingContext2D,
  v: Viewport,
  w: number,
  h: number,
  focus: { x: number; y: number },
  finger: { sx: number; sy: number },
  label: string | null,
  ok = true,
): void {
  const source = ctx.canvas;
  const dpr = source.width / Math.max(1, w);
  const r = LOUPE.radius;
  const zoom = loupeZoom(v);
  const f = screenOf(v, focus);
  const half = r / zoom;

  // いまの絵を、いったん別の紙に写してから拡大する（同じキャンバスへの直接の写しは避ける）
  const size = Math.max(1, Math.round(half * 2 * dpr));
  loupeBuffer ??= document.createElement('canvas');
  if (loupeBuffer.width !== size || loupeBuffer.height !== size) {
    loupeBuffer.width = size;
    loupeBuffer.height = size;
  }
  const bctx = loupeBuffer.getContext('2d')!;
  bctx.fillStyle = '#dfeef7';
  bctx.fillRect(0, 0, size, size);
  bctx.drawImage(source, (f.sx - half) * dpr, (f.sy - half) * dpr, size, size, 0, 0, size, size);

  const c = loupeCenter(finger.sx, finger.sy, w, h);
  ctx.save();
  // 影
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.beginPath();
  ctx.arc(c.x + 2, c.y + 4, r + 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(loupeBuffer, c.x - r, c.y - r, r * 2, r * 2);
  // 照準（スナップした点）
  const color = ok ? '#e8452c' : '#8a1c12';
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(c.x - r, c.y);
  ctx.lineTo(c.x - 12, c.y);
  ctx.moveTo(c.x + 12, c.y);
  ctx.lineTo(c.x + r, c.y);
  ctx.moveTo(c.x, c.y - r);
  ctx.lineTo(c.x, c.y - 12);
  ctx.moveTo(c.x, c.y + 12);
  ctx.lineTo(c.x, c.y + r);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(c.x, c.y, 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // 縁取り（工事現場の黄色と黒）
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#1f1f1f';
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#f6c343';
  ctx.stroke();

  if (label) {
    ctx.font = 'bold 13px system-ui, sans-serif';
    const tw = ctx.measureText(label).width + 14;
    const ly = c.y + r - 4;
    ctx.fillStyle = ok ? '#1f1f1f' : '#b3261e';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(c.x - tw / 2, ly - 10, tw, 22, 11);
    else ctx.rect(c.x - tw / 2, ly - 10, tw, 22);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, c.x, ly + 1);
  }
  ctx.restore();
}

// ---------- 手応えの演出（こわれた瞬間・倒れた瞬間） ----------

/** 最初にこわれた所の、いまの画面の位置 */
export function firstBreakScreen(v: Viewport, world: World, fb: FirstBreak): ScreenPoint {
  return screenOf(v, fb.kind === 'joint' ? world.nodes[fb.node] : memberMidpoint(world, fb.index));
}

/**
 * こわれた瞬間の印：黄色と黒のギザギザの光と、一言（「バキッ！」など）。
 * t は 0（出た瞬間）→ 1（消える）。はじめ大きく、すぐ落ち着く。
 */
export function drawImpact(ctx: CanvasRenderingContext2D, p: ScreenPoint, t: number, label: string, labelColor = '#1f1f1f'): void {
  if (t < 0 || t > 1) return;
  ctx.save();
  const grow = t < 0.15 ? 0.6 + (t / 0.15) * 0.6 : 1.2 - Math.min(1, (t - 0.15) / 0.5) * 0.2;
  const alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
  ctx.globalAlpha = alpha;
  // ギザギザの光（黒ふちの黄色）
  const spikes = 10;
  const r1 = 34 * grow;
  const r0 = 16 * grow;
  ctx.beginPath();
  for (let i = 0; i <= spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2 + 0.2;
    const r = i % 2 === 0 ? r1 : r0;
    const x = p.sx + Math.cos(a) * r;
    const y = p.sy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = '#f6c343';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#1f1f1f';
  ctx.stroke();
  // 一言の吹き出し
  ctx.font = `900 ${Math.round(22 * Math.min(1.1, grow))}px "Dela Gothic One", system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const ty = p.sy - r1 - 18;
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeText(label, p.sx, ty);
  ctx.fillStyle = labelColor;
  ctx.fillText(label, p.sx, ty);
  ctx.restore();
}

/** 倒れた瞬間の土ぼこり。t は 0 → 1 */
export function drawDust(ctx: CanvasRenderingContext2D, v: Viewport, xs: number[], t: number): void {
  if (t < 0 || t > 1 || xs.length === 0) return;
  ctx.save();
  ctx.globalAlpha = 0.55 * (1 - t);
  ctx.fillStyle = '#a88a62';
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  for (let i = 0; i < 9; i++) {
    const x = lo + ((hi - lo) * i) / 8;
    const p = toScreen(v, x, 0);
    const r = (10 + (i % 3) * 6) * (0.6 + t * 1.4);
    ctx.beginPath();
    ctx.arc(p.sx + (i % 2 ? 1 : -1) * t * 18, p.sy - r * 0.5 - t * 12, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 地震の前ぶれ（「ゴゴゴ…」）。画面の上のほうに出す */
export function drawRumble(ctx: CanvasRenderingContext2D, w: number, t: number): void {
  if (t < 0 || t > 1) return;
  ctx.save();
  ctx.globalAlpha = t < 0.2 ? t / 0.2 : t > 0.8 ? (1 - t) / 0.2 : 1;
  ctx.font = '900 30px "Dela Gothic One", system-ui';
  ctx.textAlign = 'center';
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#ffffff';
  const jx = Math.sin(t * 90) * 2;
  ctx.strokeText('ゴゴゴゴ…', w / 2 + jx, 150);
  ctx.fillStyle = '#5a4126';
  ctx.fillText('ゴゴゴゴ…', w / 2 + jx, 150);
  ctx.restore();
}

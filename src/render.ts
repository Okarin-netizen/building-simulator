// 画面への描画。物理の世界（メートル）と画面（ピクセル）の変換もここで行う。

import { MATERIALS } from './physics/materials';
import type { Design } from './physics/design';
import { memberStressRatio, type FirstBreak, type World } from './physics/world';

/** 画面に映す範囲（メートル） */
export const VIEW = { minX: -6, maxX: 16, maxY: 24 };
export const MAX_MEMBER_LENGTH = 6;

export interface Viewport {
  scale: number; // 1m あたりのピクセル
  originX: number; // x = 0 の画面上の位置
  groundY: number; // y = 0 の画面上の位置
}

export function makeViewport(width: number, height: number): Viewport {
  const margin = 32;
  const scale = Math.min((width - margin * 2) / (VIEW.maxX - VIEW.minX), (height - margin * 2) / VIEW.maxY);
  const usedWidth = scale * (VIEW.maxX - VIEW.minX);
  return {
    scale,
    originX: (width - usedWidth) / 2 - VIEW.minX * scale,
    groundY: height - margin,
  };
}

export const toScreen = (v: Viewport, x: number, y: number) => ({ sx: v.originX + x * v.scale, sy: v.groundY - y * v.scale });
export const toWorld = (v: Viewport, sx: number, sy: number) => ({ x: (sx - v.originX) / v.scale, y: (v.groundY - sy) / v.scale });

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

  // 1m ごとの方眼
  ctx.lineWidth = 1;
  for (let x = Math.ceil(VIEW.minX); x <= VIEW.maxX; x++) {
    const { sx } = toScreen(v, x, 0);
    ctx.strokeStyle = x % 5 === 0 ? '#bcd3e3' : '#cfe1ec';
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, v.groundY);
    ctx.stroke();
  }
  for (let y = 1; y <= VIEW.maxY; y++) {
    const { sy } = toScreen(v, 0, y);
    ctx.strokeStyle = y % 5 === 0 ? '#bcd3e3' : '#cfe1ec';
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(w, sy);
    ctx.stroke();
    if (y % 5 === 0) {
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
  ctx.beginPath();
  ctx.moveTo(0, v.groundY);
  ctx.lineTo(w, v.groundY);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(40, 26, 10, 0.35)';
  ctx.lineWidth = 2;
  const step = 24;
  const offset = ((shiftPx % step) + step) % step;
  for (let x = -step + offset; x < w + step; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, v.groundY + 6);
    ctx.lineTo(x - 10, v.groundY + 18);
    ctx.stroke();
  }
}

/** 目標の高さの線 */
function drawGoalLine(ctx: CanvasRenderingContext2D, v: Viewport, w: number, goalHeight: number): void {
  if (goalHeight <= 0) return;
  const { sy } = toScreen(v, 0, goalHeight);
  ctx.save();
  ctx.strokeStyle = '#2e9d55';
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 8]);
  ctx.beginPath();
  ctx.moveTo(0, sy);
  ctx.lineTo(w, sy);
  ctx.stroke();
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
): void {
  drawBackground(ctx, v, w, h, 0);
  drawGoalLine(ctx, v, w, goalHeight);

  ctx.lineCap = 'round';
  design.members.forEach((m, i) => {
    const a = toScreen(v, design.nodes[m.a].x, design.nodes[m.a].y);
    const b = toScreen(v, design.nodes[m.b].x, design.nodes[m.b].y);
    ctx.strokeStyle = i === hoverMember ? '#d93a2b' : MATERIALS[m.material].color;
    ctx.lineWidth = memberWidth(v);
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
  });

  for (const n of design.nodes) {
    const p = toScreen(v, n.x, n.y);
    if (n.y <= 0) {
      // 基礎
      ctx.fillStyle = '#5b4a33';
      ctx.fillRect(p.sx - 9, p.sy - 2, 18, 8);
    }
    drawNodeDot(ctx, p.sx, p.sy, '#ffffff', '#3c4450');
  }

  if (preview) {
    const a = toScreen(v, preview.x1, preview.y1);
    const b = toScreen(v, preview.x2, preview.y2);
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = preview.ok ? preview.color : '#d93a2b';
    ctx.lineWidth = memberWidth(v);
    ctx.setLineDash(preview.ok ? [] : [8, 6]);
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    drawNodeDot(ctx, b.sx, b.sy, '#ffffff', '#3c4450');
  }

  if (pinMember !== null && design.members[pinMember]) {
    const m = design.members[pinMember];
    const a = design.nodes[m.a];
    const b = design.nodes[m.b];
    const p = toScreen(v, (a.x + b.x) / 2, (a.y + b.y) / 2);
    drawPin(ctx, p.sx, p.sy, 'わたしの予想', PREDICT_COLOR);
  }
}

export interface WorldMarks {
  /** 予想した部材 */
  predictMember?: number | null;
  /** 最初にこわれた所（その時刻を過ぎたら輪を描く） */
  firstBreak?: FirstBreak | null;
  /** 0〜1 の点滅の強さ */
  pulse?: number;
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
    const a = toScreen(v, world.nodes[m.a].x, world.nodes[m.a].y);
    const b = toScreen(v, world.nodes[m.b].x, world.nodes[m.b].y);
    // 外側に材料の色、内側に力の色
    ctx.strokeStyle = m.material.color;
    ctx.lineWidth = memberWidth(v);
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
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
    const p = toScreen(v, n.x, n.y);
    if (n.support) {
      ctx.fillStyle = '#5b4a33';
      ctx.fillRect(p.sx - 9, p.sy - 2, 18, 8);
    }
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

  const fb = marks.firstBreak;
  if (fb && world.time >= fb.time) {
    let px: number;
    let py: number;
    if (fb.kind === 'joint') {
      px = world.nodes[fb.node].x;
      py = world.nodes[fb.node].y;
    } else {
      const m = world.members[fb.index];
      px = (world.nodes[m.a].x + world.nodes[m.b].x) / 2;
      py = (world.nodes[m.a].y + world.nodes[m.b].y) / 2;
    }
    const p = toScreen(v, px, py);
    drawBreakRing(ctx, p.sx, p.sy, marks.pulse ?? 0);
  }

  const pm = marks.predictMember;
  if (pm !== null && pm !== undefined && world.members[pm]) {
    const m = world.members[pm];
    const p = toScreen(v, (world.nodes[m.a].x + world.nodes[m.b].x) / 2, (world.nodes[m.a].y + world.nodes[m.b].y) / 2);
    drawPin(ctx, p.sx, p.sy, '予想', PREDICT_COLOR);
  }
}

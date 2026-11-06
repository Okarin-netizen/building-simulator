// 画面の操作：部材を置く・消す、見本を出す、地震を起こす。

import {
  addMember,
  designCost,
  designHeight,
  emptyDesign,
  frameDesign,
  removeMember,
  type Design,
} from './physics/design';
import { MATERIALS, MATERIAL_IDS, type MaterialId } from './physics/materials';
import { groundOffset, makeQuake, QUAKE_LEVELS, QUAKE_TYPES, type QuakeLevel, type QuakeType } from './physics/quake';
import { brokenCount, createWorld, SETTLE_TIME, step, type World } from './physics/world';
import { drawDesign, drawWorld, makeViewport, MAX_MEMBER_LENGTH, toWorld, VIEW, type Viewport } from './render';

const STORAGE_KEY = 'saikou-tower-design-v1';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('canvas');
const ctx = canvas.getContext('2d')!;
const hint = $<HTMLParagraphElement>('hint');
const resultBox = $<HTMLDivElement>('result');
const startBtn = $<HTMLButtonElement>('start');
const resetBtn = $<HTMLButtonElement>('reset');
const levelSelect = $<HTMLSelectElement>('quake-level');
const typeSelect = $<HTMLSelectElement>('quake-type');
const slowCheck = $<HTMLInputElement>('slow');

let design: Design = loadDesign() ?? frameDesign({ floors: 3 });
let material: MaterialId = 'wood';
let tool: 'place' | 'erase' = 'place';
let world: World | null = null;
let finished = false;
let viewport: Viewport = makeViewport(1, 1);
let cssWidth = 1;
let cssHeight = 1;

let dragStart: { x: number; y: number } | null = null;
let dragEnd: { x: number; y: number } | null = null;
let hoverMember: number | null = null;

// ---------- 保存 ----------

function loadDesign(): Design | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Design;
    if (Array.isArray(d.nodes) && Array.isArray(d.members)) return d;
  } catch {
    // 保存が使えない環境でも動くようにする
  }
  return null;
}

function saveDesign(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(design));
  } catch {
    // 何もしない
  }
}

// ---------- パネル ----------

const materialBox = $<HTMLDivElement>('materials');
for (const id of MATERIAL_IDS) {
  const m = MATERIALS[id];
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.material = id;
  b.innerHTML = `<span class="swatch" style="background:${m.color}"></span>${m.name}<br><small>${m.costPerMeter}万円/m</small>`;
  b.addEventListener('click', () => {
    material = id;
    refreshPanel();
  });
  materialBox.appendChild(b);
}

for (const [id, info] of Object.entries(QUAKE_LEVELS)) {
  levelSelect.add(new Option(info.name, id));
}
levelSelect.value = 'medium';
for (const [id, info] of Object.entries(QUAKE_TYPES)) {
  typeSelect.add(new Option(info.name, id));
}
typeSelect.value = 'mixed';

document.querySelectorAll<HTMLButtonElement>('.tool').forEach((b) =>
  b.addEventListener('click', () => {
    tool = b.dataset.tool as 'place' | 'erase';
    refreshPanel();
  }),
);

$('sample-square').addEventListener('click', () => setDesign(frameDesign({ floors: 3, material })));
$('sample-braced').addEventListener('click', () => setDesign(frameDesign({ floors: 3, material, braced: true })));
$('clear').addEventListener('click', () => setDesign(emptyDesign()));
startBtn.addEventListener('click', startQuake);
resetBtn.addEventListener('click', stopQuake);

function setDesign(d: Design): void {
  if (world) return;
  design = d;
  saveDesign();
  refreshPanel();
}

function refreshPanel(): void {
  const running = world !== null;
  materialBox.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
    b.classList.toggle('active', b.dataset.material === material);
    b.disabled = running;
  });
  document.querySelectorAll<HTMLButtonElement>('.tool').forEach((b) => {
    b.classList.toggle('active', b.dataset.tool === tool);
    b.disabled = running;
  });
  for (const id of ['sample-square', 'sample-braced', 'clear']) $<HTMLButtonElement>(id).disabled = running;
  startBtn.disabled = running || design.members.length === 0;
  resetBtn.disabled = !running;
  levelSelect.disabled = running;
  typeSelect.disabled = running;
  $('stat-height').textContent = String(designHeight(design));
  $('stat-cost').textContent = String(designCost(design));
}

// ---------- 地震 ----------

function startQuake(): void {
  if (design.members.length === 0) return;
  if (!design.nodes.some((n) => n.y <= 0)) {
    hint.textContent = '地面につながった部材がありません。いちばん下の線から柱を立てよう。';
    return;
  }
  const quake = makeQuake(levelSelect.value as QuakeLevel, typeSelect.value as QuakeType);
  world = createWorld(design, quake);
  finished = false;
  resultBox.hidden = true;
  hint.textContent = '地震が来ます…　赤くなる所が、こわれそうな所です。';
  refreshPanel();
}

function stopQuake(): void {
  world = null;
  finished = false;
  resultBox.hidden = true;
  hint.textContent = 'どこを直せば倒れなくなるか考えて、作り直してみよう。';
  refreshPanel();
}

function showResult(w: World): void {
  finished = true;
  const broken = brokenCount(w);
  const driftCm = Math.round(w.maxDrift * 100);
  resultBox.hidden = false;
  if (w.collapsed) {
    resultBox.className = 'result fail';
    resultBox.innerHTML = `倒れてしまった！<small>×印のつなぎ目や、消えた部材が最初にこわれた所です。そこを三角形にしたり、材料を変えたりしてみよう。</small>`;
  } else {
    resultBox.className = 'result ok';
    resultBox.innerHTML = `耐えた！<small>いちばん上の揺れ幅：最大 ${driftCm} cm　／　こわれた部材 ${broken.members} 本・つなぎ目 ${broken.joints} か所</small>`;
  }
  hint.textContent = '「建て直す」で組み立てに戻れます。';
}

// ---------- 入力 ----------

function eventPoint(e: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return toWorld(viewport, e.clientX - rect.left, e.clientY - rect.top);
}

function snap(p: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.max(Math.ceil(VIEW.minX), Math.min(Math.floor(VIEW.maxX), Math.round(p.x))),
    y: Math.max(0, Math.min(VIEW.maxY - 1, Math.round(p.y))),
  };
}

function distanceToSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1e-9;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function memberAt(p: { x: number; y: number }): number | null {
  let best: number | null = null;
  let bestD = 0.45;
  design.members.forEach((m, i) => {
    const d = distanceToSegment(p, design.nodes[m.a], design.nodes[m.b]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

const lengthOk = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(b.x - a.x, b.y - a.y) <= MAX_MEMBER_LENGTH && (a.x !== b.x || a.y !== b.y);

canvas.addEventListener('pointerdown', (e) => {
  if (world) return;
  canvas.setPointerCapture(e.pointerId);
  const p = eventPoint(e);
  if (tool === 'erase') {
    const i = memberAt(p);
    if (i !== null) {
      removeMember(design, i);
      saveDesign();
      refreshPanel();
    }
    return;
  }
  dragStart = snap(p);
  dragEnd = dragStart;
});

canvas.addEventListener('pointermove', (e) => {
  if (world) return;
  const p = eventPoint(e);
  hoverMember = tool === 'erase' ? memberAt(p) : null;
  if (dragStart) dragEnd = snap(p);
});

canvas.addEventListener('pointerup', () => {
  if (dragStart && dragEnd) {
    if (lengthOk(dragStart, dragEnd)) {
      addMember(design, dragStart.x, dragStart.y, dragEnd.x, dragEnd.y, material);
      saveDesign();
      refreshPanel();
      hint.textContent = '部材を置きました。続けて置くか、「地震を起こす」を押してみよう。';
    } else if (dragStart.x !== dragEnd.x || dragStart.y !== dragEnd.y) {
      hint.textContent = `部材の長さは ${MAX_MEMBER_LENGTH} m までです。`;
    }
  }
  dragStart = null;
  dragEnd = null;
});

canvas.addEventListener('pointerleave', () => {
  hoverMember = null;
});

// ---------- 描画ループ ----------

function resize(): void {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  cssWidth = rect.width;
  cssHeight = rect.height;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  viewport = makeViewport(cssWidth, cssHeight);
}
window.addEventListener('resize', resize);

function frame(): void {
  if (world) {
    if (!finished) {
      step(world, (1 / 60) * (slowCheck.checked ? 0.25 : 1));
      const quakeEnd = SETTLE_TIME + (world.quake?.duration ?? 0) + 2;
      if (world.time > quakeEnd || (world.collapsed && world.time > (world.collapseTime ?? 0) + 2.5)) showResult(world);
    }
    const shift = world.quake ? groundOffset(world.quake, world.time - SETTLE_TIME) : 0;
    drawWorld(ctx, viewport, cssWidth, cssHeight, world, shift);
  } else {
    const preview =
      dragStart && dragEnd
        ? { x1: dragStart.x, y1: dragStart.y, x2: dragEnd.x, y2: dragEnd.y, color: MATERIALS[material].color, ok: lengthOk(dragStart, dragEnd) }
        : null;
    drawDesign(ctx, viewport, cssWidth, cssHeight, design, preview, hoverMember);
  }
  requestAnimationFrame(frame);
}

resize();
refreshPanel();
requestAnimationFrame(frame);

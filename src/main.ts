// 画面の操作：ステージを選ぶ、部材を置く・消す、地震で試験する、結果を見る。

import { addMember, designCost, designHeight, emptyDesign, frameDesign, removeMember, type Design } from './physics/design';
import { MATERIALS, MATERIAL_IDS, type MaterialId } from './physics/materials';
import { groundOffset, makeQuake, QUAKE_LEVELS, QUAKE_TYPES, type QuakeLevel, type QuakeType } from './physics/quake';
import { createWorld, SETTLE_TIME, step, type World } from './physics/world';
import { canStartTest, evaluate } from './game/evaluate';
import { loadDesign, loadProgress, recordResult, saveDesign } from './game/progress';
import { CHAPTER_NAMES, nextStage, stageById, STAGES, type Stage } from './game/stages';
import { drawDesign, drawWorld, makeViewport, MAX_MEMBER_LENGTH, toWorld, VIEW, type Viewport } from './render';

const FREE_ID = 'free';
const LAST_STAGE_KEY = 'saikou-tower-last-stage-v1';

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
const menu = $<HTMLDivElement>('menu');
const materialBox = $<HTMLDivElement>('materials');

/** null のときは「自由に作る」モード */
let stage: Stage | null = null;
let design: Design = emptyDesign();
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

const designId = () => stage?.id ?? FREE_ID;
const goalHeight = () => stage?.goalHeight ?? 0;
const allowedMaterials = () => stage?.materials ?? MATERIAL_IDS;
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const starText = (n: number) => '★'.repeat(n) + `<span class="off">${'★'.repeat(3 - n)}</span>`;

// ---------- ステージの切り替え ----------

function openStage(s: Stage | null): void {
  world = null;
  finished = false;
  stage = s;
  design = loadDesign(designId()) ?? (s ? s.initial() : frameDesign({ floors: 3 }));
  if (!allowedMaterials().includes(material)) material = allowedMaterials()[0];
  try {
    localStorage.setItem(LAST_STAGE_KEY, designId());
  } catch {
    // 何もしない
  }
  menu.hidden = true;
  resultBox.hidden = true;

  $('stage-name').textContent = s ? `${s.chapter === 'challenge' ? '' : s.id + ' '}${s.title}` : '自由に作る（実験モード）';
  $('request').textContent = s ? s.request : '好きな形・材料で建てて、地震の強さや揺れ方を変えて試してみよう。';
  hint.textContent = '点から点へドラッグして部材を置こう。地面の線につながった所が基礎になります。';
  $('stage-tools').hidden = !s;
  $('samples').hidden = !!s;
  $('quake-choice').hidden = !!s;
  $('quake-fixed').textContent = s
    ? `この依頼の地震：${QUAKE_LEVELS[s.quake.level].name}・${QUAKE_TYPES[s.quake.type].name}`
    : '';
  buildMaterialButtons();
  refreshPanel();
}

function persist(): void {
  saveDesign(designId(), design);
}

// ---------- ステージ一覧 ----------

function openMenu(): void {
  if (world && !finished) return;
  const progress = loadProgress();
  const list = $('menu-list');
  list.innerHTML = '';
  for (const chapter of ['1', '2', 'challenge']) {
    const h = document.createElement('h3');
    h.textContent = CHAPTER_NAMES[chapter];
    list.appendChild(h);
    const cards = document.createElement('div');
    cards.className = 'stage-cards';
    for (const s of STAGES.filter((x) => String(x.chapter) === chapter)) {
      const rec = progress[s.id];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'stage-card';
      const sub =
        s.chapter === 'challenge'
          ? rec?.bestHeight
            ? `記録 ${rec.bestHeight} m`
            : 'まだ記録なし'
          : `<span class="card-stars">${starText(rec?.stars ?? 0)}</span>`;
      b.innerHTML = `<span class="no">${s.chapter === 'challenge' ? 'チャレンジ' : s.id}</span><br>${escapeHtml(s.title)}<br>${sub}`;
      b.addEventListener('click', () => openStage(s));
      cards.appendChild(b);
    }
    list.appendChild(cards);
  }
  menu.hidden = false;
}

$('open-menu').addEventListener('click', openMenu);
$('free-mode').addEventListener('click', () => openStage(null));
menu.addEventListener('click', (e) => {
  if (e.target === menu) menu.hidden = true;
});

// ---------- パネル ----------

function buildMaterialButtons(): void {
  materialBox.innerHTML = '';
  for (const id of allowedMaterials()) {
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
}

for (const [id, info] of Object.entries(QUAKE_LEVELS)) levelSelect.add(new Option(info.name, id));
levelSelect.value = 'medium';
for (const [id, info] of Object.entries(QUAKE_TYPES)) typeSelect.add(new Option(info.name, id));
typeSelect.value = 'mixed';

document.querySelectorAll<HTMLButtonElement>('.tool').forEach((b) =>
  b.addEventListener('click', () => {
    tool = b.dataset.tool as 'place' | 'erase';
    refreshPanel();
  }),
);

function setDesign(d: Design): void {
  if (world) return;
  design = d;
  persist();
  refreshPanel();
}

$('sample-square').addEventListener('click', () => setDesign(frameDesign({ floors: 3, material })));
$('sample-braced').addEventListener('click', () => setDesign(frameDesign({ floors: 3, material, braced: true })));
$('clear').addEventListener('click', () => setDesign(emptyDesign()));
$('restart').addEventListener('click', () => {
  if (stage && confirm('最初の状態に戻しますか？ いま作っている建物は消えます。')) setDesign(stage.initial());
});
$('show-hint').addEventListener('click', () => {
  if (stage) hint.textContent = `ヒント：${stage.hint}`;
});
startBtn.addEventListener('click', startQuake);
resetBtn.addEventListener('click', backToBuild);

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
  for (const id of ['sample-square', 'sample-braced', 'clear', 'restart', 'show-hint']) $<HTMLButtonElement>(id).disabled = running;
  startBtn.disabled = running || design.members.length === 0;
  resetBtn.disabled = !running;
  levelSelect.disabled = running;
  typeSelect.disabled = running;

  const height = designHeight(design);
  const cost = designCost(design);
  $('stat-height').textContent = String(height);
  $('stat-goal').textContent = stage && stage.goalHeight > 0 ? `（目標 ${stage.goalHeight} m）` : '';
  $('stat-cost').textContent = String(cost);
  $('stat-budget').textContent = stage ? `/ 予算 ${stage.budget}` : '';
  $('cost-line').classList.toggle('over', !!stage && cost > stage.budget);
}

// ---------- 地震の試験 ----------

function startQuake(): void {
  const can = canStartTest(stage, design);
  if (!can.ok) {
    hint.textContent = can.reason!;
    return;
  }
  const quake = stage
    ? makeQuake(stage.quake.level, stage.quake.type)
    : makeQuake(levelSelect.value as QuakeLevel, typeSelect.value as QuakeType);
  world = createWorld(design, quake);
  finished = false;
  resultBox.hidden = true;
  hint.textContent = '地震が来ます…　赤くなる所が、こわれそうな所です。';
  refreshPanel();
}

function backToBuild(): void {
  world = null;
  finished = false;
  resultBox.hidden = true;
  hint.textContent = 'どこを直せば強くなるか考えて、作り直してみよう。';
  refreshPanel();
}

function showResult(w: World): void {
  finished = true;
  const ev = evaluate(stage, design, w);
  const isChallenge = stage?.chapter === 'challenge';
  if (stage) recordResult(stage.id, ev.stars, isChallenge && ev.cleared ? ev.height : undefined);

  const title = ev.cleared
    ? isChallenge
      ? `記録 ${ev.height} m！`
      : stage
        ? 'クリア！'
        : '耐えた！'
    : w.collapsed
      ? '倒れてしまった…'
      : `高さが足りません（目標 ${goalHeight()} m）`;

  let html = `<h3>${title}</h3>`;
  if (stage) html += `<div class="stars">${starText(ev.stars)}</div>`;
  html += `<ul>${ev.checks.map((c) => `<li class="${c.ok ? 'ok' : ''}">${escapeHtml(c.label)}</li>`).join('')}</ul>`;
  if (stage && ev.cleared) html += `<div class="lesson"><strong>なぜ？</strong>${escapeHtml(stage.lesson)}</div>`;
  else if (w.collapsed) html += `<div class="lesson"><strong>見直そう</strong>×印のつなぎ目や、消えた部材が最初にこわれた所です。${stage ? escapeHtml(stage.hint) : ''}</div>`;
  html += `<div class="buttons"><button type="button" data-act="rebuild">建て直す</button>`;
  const next = stage && ev.cleared ? nextStage(stage.id) : undefined;
  if (next) html += `<button type="button" class="primary" data-act="next">次のステージへ</button>`;
  if (stage && ev.cleared && !next) html += `<button type="button" class="primary" data-act="menu">ステージ一覧へ</button>`;
  html += `</div>`;

  resultBox.innerHTML = html;
  resultBox.className = `result ${ev.cleared ? 'ok' : 'fail'}`;
  resultBox.hidden = false;
  resultBox.querySelector('[data-act=rebuild]')?.addEventListener('click', backToBuild);
  resultBox.querySelector('[data-act=next]')?.addEventListener('click', () => next && openStage(next));
  resultBox.querySelector('[data-act=menu]')?.addEventListener('click', openMenu);
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
      persist();
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
      persist();
      refreshPanel();
      const over = stage && designCost(design) > stage.budget;
      hint.textContent = over
        ? '予算オーバーです。部材を減らすか、安い材料にしよう。'
        : '部材を置きました。続けて置くか、「地震を起こす」で試験しよう。';
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
// ヘッダーの文字数が変わると画面の高さも変わるので、キャンバスの大きさの変化を見張る
new ResizeObserver(resize).observe(canvas);

function frame(): void {
  if (world) {
    if (!finished) {
      step(world, (1 / 60) * (slowCheck.checked ? 0.25 : 1));
      const quakeEnd = SETTLE_TIME + (world.quake?.duration ?? 0) + 2;
      if (world.time > quakeEnd || (world.collapsed && world.time > (world.collapseTime ?? 0) + 2.5)) showResult(world);
    }
    const shift = world.quake ? groundOffset(world.quake, world.time - SETTLE_TIME) : 0;
    drawWorld(ctx, viewport, cssWidth, cssHeight, world, shift, goalHeight());
  } else {
    const preview =
      dragStart && dragEnd
        ? { x1: dragStart.x, y1: dragStart.y, x2: dragEnd.x, y2: dragEnd.y, color: MATERIALS[material].color, ok: lengthOk(dragStart, dragEnd) }
        : null;
    drawDesign(ctx, viewport, cssWidth, cssHeight, design, preview, hoverMember, goalHeight());
  }
  requestAnimationFrame(frame);
}

resize();
let lastId: string | null = null;
try {
  lastId = localStorage.getItem(LAST_STAGE_KEY);
} catch {
  // 何もしない
}
if (lastId === FREE_ID) openStage(null);
else openStage(stageById(lastId ?? '') ?? STAGES[0]);
if (!lastId) openMenu();
requestAnimationFrame(frame);

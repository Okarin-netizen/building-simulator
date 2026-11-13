// 画面の操作：ステージを選ぶ、部材を置く・選んで直す、地震で試験する、結果を見る。

import { addMember, designCost, designHeight, emptyDesign, frameDesign, ISOLATION_COST_PER_BASE, removeMember, setMemberMaterial, type Design } from './physics/design';
import { MATERIALS, MATERIAL_IDS, type MaterialId } from './physics/materials';
import { groundOffset, makeQuake, QUAKE_LEVELS, QUAKE_TYPES, TEST_DURATION, type QuakeLevel, type QuakeType } from './physics/quake';
import { createWorld, SETTLE_TIME, step, type World } from './physics/world';
import { distanceToSegment } from './physics/geometry';
import { canStartTest, evaluate, safetyNote } from './game/evaluate';
import { breakAdvice, judgePrediction, describeMember, type Prediction } from './game/predict';
import { applyFrame, captureFrame, frameIndexAt, type Frame } from './game/replay';
import { loadDesign, loadLastStage, loadProgress, logAttempt, recordResult, saveDesign, saveLastStage } from './game/progress';
import { APP_LICENSE, AUTHOR, CHANGELOG, MIT_TEXT, THIRD_PARTY } from './game/about';
import { CHAPTER_NAMES, nextStage, stageById, stageFullTitle, stageLabel, STAGES, type Stage } from './game/stages';
import { $, closeOnBackdrop, el } from './ui/dom';
import { setupClassPanel, type LastResult } from './ui/classPanel';
import { setupReflectionSheet } from './ui/reflectionSheet';
import { drawAimRing, drawDesign, drawLoupe, drawWorld, makeViewport, MAX_MEMBER_LENGTH, toScreen, toWorld, VIEW, viewHeightFor, type Viewport } from './render';

const FREE_ID = 'free';

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
const predictBox = $<HTMLDivElement>('predict-box');
const predictGo = $<HTMLButtonElement>('predict-go');
const replayBar = $<HTMLDivElement>('replay-bar');
const replaySeek = $<HTMLInputElement>('replay-seek');
const replayPlay = $<HTMLButtonElement>('replay-play');
const replaySpeed = $<HTMLSelectElement>('replay-speed');

/** null のときは「自由に作る」モード */
let stage: Stage | null = null;
let design: Design = emptyDesign();
let material: MaterialId = 'wood';
let tool: 'place' | 'load' = 'place';
/** build：組み立て / predict：予想 / test：試験中 / result：結果 / replay：再生 */
type Phase = 'build' | 'predict' | 'test' | 'result' | 'replay';
let phase: Phase = 'build';
let world: World | null = null;
let prediction: Prediction | null = null;
let frames: Frame[] = [];
let replayTime = 0;
let replayPlaying = false;
/** いちばん最近の試験結果（クラスに送る用） */
let lastResult: LastResult | null = null;
let viewport: Viewport = makeViewport(1, 1);
/** 画面に映す高さ（m）。ステージに合わせて拡大する */
let viewMaxY: number = VIEW.maxY;
/** 「1つ戻す」用の、変更前の設計図 */
let undoStack: string[] = [];
const UNDO_LIMIT = 50;
let cssWidth = 1;
let cssHeight = 1;

let dragStart: { x: number; y: number } | null = null;
let dragEnd: { x: number; y: number } | null = null;
let hoverMember: number | null = null;
/** タップで選んだ部材（材料を変える・消す）。設計図の形が変わったら選びなおし */
let selectedMember: number | null = null;

const designId = () => stage?.id ?? FREE_ID;
const goalHeight = () => stage?.goalHeight ?? 0;
const allowedMaterials = () => stage?.materials ?? MATERIAL_IDS;
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const starText = (n: number) => '★'.repeat(n) + `<span class="off">${'★'.repeat(3 - n)}</span>`;

// ---------- ステージの切り替え ----------

function openStage(s: Stage | null): void {
  resetTest();
  selectMember(null);
  stage = s;
  design = loadDesign(designId()) ?? (s ? s.initial() : frameDesign({ floors: 3 }));
  undoStack = [];
  fitView();
  if (!allowedMaterials().includes(material)) material = allowedMaterials()[0];
  saveLastStage(designId());
  menu.hidden = true;

  $('stage-no').textContent = s ? stageLabel(s) : '実験';
  const loadBtn = $<HTMLButtonElement>('tool-load');
  loadBtn.hidden = !s?.load;
  // 「部材を置く」は、機械を置くステージで道具を切りかえるときだけ出す
  $('tool-place').hidden = !s?.load;
  if (s?.load) loadBtn.textContent = `${s.load.name}を置く`;
  if (!s?.load && tool === 'load') tool = 'place';
  $('stage-name').textContent = s ? s.title : '自由に作る';
  $('request').textContent = s ? s.request : '好きな形・材料で建てて、地震の強さや揺れ方を変えて試してみよう。';
  hint.textContent = '点から点へドラッグして部材を置こう。置いた部材はタップすると、材料を変えたり消したりできます。';
  $('stage-tools').hidden = !s;
  $('samples').hidden = !!s;
  $('quake-choice').hidden = !!s;
  $('quake-fixed').textContent = s
    ? s.wind
      ? `この依頼の試験：強い風（風速${s.wind}m/s、突風まじり）`
      : `この依頼の地震：${QUAKE_LEVELS[s.quake.level].name}・${QUAKE_TYPES[s.quake.type].name}`
    : '';
  $('test-title').textContent = s?.wind ? '風の試験' : '地震';
  startBtn.textContent = s?.wind ? '強風スタート！' : '地震スタート！';
  $('toggle-iso').hidden = !!s && !s.isolation;
  $('open-sheet').hidden = s?.chapter !== 'challenge';
  classPanel.refreshRankingButtons();
  sheet.hide();
  buildMaterialButtons();
  refreshPanel();
}

/** 画面に映す高さを、ステージの目標と建物の高さに合わせる */
function fitView(): void {
  const next = stage ? viewHeightFor(stage.goalHeight, designHeight(design)) : VIEW.maxY;
  if (next !== viewMaxY) {
    viewMaxY = next;
    resize();
  }
}

/** 設計図を変える前に呼ぶ（「1つ戻す」で戻れるように） */
function remember(): void {
  undoStack.push(JSON.stringify(design));
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
}

function undo(): void {
  if (phase !== 'build') return;
  const prev = undoStack.pop();
  if (!prev) {
    hint.textContent = 'これ以上は戻せません。';
    return;
  }
  design = JSON.parse(prev);
  selectMember(null);
  persist();
  refreshPanel();
  hint.textContent = '1つ前に戻しました。';
}

function persist(): void {
  saveDesign(designId(), design);
}

// ---------- ステージ一覧 ----------

function openMenu(): void {
  if (phase === 'test') return;
  const progress = loadProgress();
  const list = $('menu-list');
  list.innerHTML = '';
  for (const chapter of ['1', '2', 'challenge', '3', '4', '5', '6']) {
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
      b.innerHTML = `<span class="no">${stageLabel(s)}</span><br>${escapeHtml(s.title)}<br>${sub}`;
      b.addEventListener('click', () => openStage(s));
      cards.appendChild(b);
    }
    list.appendChild(cards);
  }
  menu.hidden = false;
}

$('open-menu').addEventListener('click', openMenu);
$('free-mode').addEventListener('click', () => openStage(null));
closeOnBackdrop(menu);

// ---------- パネル ----------

function buildMaterialButtons(): void {
  materialBox.innerHTML = '';
  for (const id of allowedMaterials()) {
    const m = MATERIALS[id];
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.material = id;
    const t = m.traits;
    const dots = (n: number) => '★'.repeat(n) + `<span class="off">${'★'.repeat(3 - n)}</span>`;
    const traits =
      'note' in t
        ? `<span class="traits">${escapeHtml(t.note)}</span>`
        : `<span class="traits">強さ${dots(t.strength)} 重さ${dots(t.weight)} ねばり${dots(t.toughness)}</span>`;
    const merit = m.merit ? `<span class="merit">${escapeHtml(m.merit)}</span>` : '';
    b.innerHTML = `<span class="mat-top"><span class="swatch" style="background:${m.color}"></span>${m.name}<span class="price">${m.costPerMeter}万円/m</span></span>${traits}${merit}`;
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
    tool = b.dataset.tool as typeof tool;
    selectMember(null);
    refreshPanel();
    if (tool === 'place') hint.textContent = '点から点へドラッグして部材を置こう。';
  }),
);

function setDesign(d: Design): void {
  if (phase !== 'build') return;
  remember();
  design = d;
  selectMember(null);
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
$('toggle-iso').addEventListener('click', () => {
  if (phase !== 'build') return;
  remember();
  design.isolated = !design.isolated;
  persist();
  refreshPanel();
  hint.textContent = design.isolated
    ? `建物の下に免震ゴムを入れました（基礎1か所につき${ISOLATION_COST_PER_BASE}万円）。`
    : '免震ゴムを外しました。';
});
startBtn.addEventListener('click', startPredict);
$('undo').addEventListener('click', undo);
resetBtn.addEventListener('click', backToBuild);

function refreshPanel(): void {
  const running = phase !== 'build';
  materialBox.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
    b.classList.toggle('active', b.dataset.material === material);
    b.disabled = running;
  });
  document.querySelectorAll<HTMLButtonElement>('.tool').forEach((b) => {
    b.classList.toggle('active', b.dataset.tool === tool);
    b.disabled = running;
  });
  for (const id of ['sample-square', 'sample-braced', 'clear', 'restart', 'show-hint', 'undo']) $<HTMLButtonElement>(id).disabled = running;
  startBtn.disabled = running || design.members.length === 0;
  const iso = $<HTMLButtonElement>('toggle-iso');
  iso.disabled = running;
  iso.classList.toggle('active', !!design.isolated);
  iso.textContent = design.isolated ? '免震ゴムを外す' : '免震ゴムを入れる';
  // 試験の前は「地震スタート！」、試験のあとは「組み立てにもどる」だけを出す
  startBtn.hidden = running;
  resetBtn.hidden = !running;
  resetBtn.disabled = !running;
  // 試験中は開けないので、押せないことが見て分かるようにする
  for (const id of ['open-menu', 'open-sheet', 'open-howto']) $<HTMLButtonElement>(id).disabled = phase === 'test';
  levelSelect.disabled = running;
  typeSelect.disabled = running;

  const height = designHeight(design);
  const cost = designCost(design);
  $('stat-height').textContent = String(height);
  $('stat-goal').textContent = stage && stage.goalHeight > 0 ? ` / ${stage.goalHeight}m` : ' m';
  $('stat-cost').textContent = String(cost);
  $('stat-budget').textContent = stage ? ` / ${stage.budget}万円` : ' 万円';
  $('cost-line').classList.toggle('over', !!stage && cost > stage.budget);
}

// ---------- 予想 ----------

function startPredict(): void {
  if (phase !== 'build') return;
  const can = canStartTest(stage, design);
  if (!can.ok) {
    hint.textContent = can.reason!;
    return;
  }
  selectMember(null);
  phase = 'predict';
  prediction = null;
  updatePredictBox();
  predictBox.hidden = false;
  hint.textContent = '';
  refreshPanel();
}

function updatePredictBox(): void {
  $('predict-text').textContent =
    prediction === null
      ? 'いちばん先にこわれそうな部材をタップしてください。'
      : prediction.kind === 'none'
        ? 'わたしの予想：どこもこわれない'
        : `わたしの予想：${describeMember(design, prediction.index)}`;
  predictGo.disabled = prediction === null;
  $('predict-none').classList.toggle('active', prediction?.kind === 'none');
}

$('predict-none').addEventListener('click', () => {
  prediction = { kind: 'none' };
  updatePredictBox();
});
$('predict-cancel').addEventListener('click', () => {
  if (phase !== 'predict') return;
  phase = 'build';
  prediction = null;
  predictBox.hidden = true;
  hint.textContent = '組み立てにもどりました。';
  refreshPanel();
});
predictGo.addEventListener('click', startQuake);

// ---------- 地震の試験 ----------

function startQuake(): void {
  if (phase !== 'predict' || prediction === null) return;
  const quake = stage
    ? makeQuake(stage.quake.level, stage.quake.type)
    : makeQuake(levelSelect.value as QuakeLevel, typeSelect.value as QuakeType);
  const wind = stage?.wind ? { speed: stage.wind, duration: TEST_DURATION } : null;
  world = createWorld(design, wind ? null : quake, wind);
  frames = [captureFrame(world, 0)];
  simLag = 0;
  phase = 'test';
  predictBox.hidden = true;
  resultBox.hidden = true;
  hint.textContent = wind
    ? '強い風が吹きます…　赤くなる所が、こわれそうな所です。'
    : '地震が来ます…　赤くなる所が、こわれそうな所です。';
  refreshPanel();
}

/** 試験の状態をすべて片付ける */
function resetTest(): void {
  phase = 'build';
  world = null;
  prediction = null;
  frames = [];
  replayPlaying = false;
  resultBox.hidden = true;
  predictBox.hidden = true;
  replayBar.hidden = true;
}

function backToBuild(): void {
  resetTest();
  hint.textContent = 'どこを直せば強くなるか考えて、作り直してみよう。';
  refreshPanel();
}

const VERDICT_LABEL = { hit: '大当たり', near: 'おしい', miss: 'はずれ' } as const;

function showResult(w: World): void {
  phase = 'result';
  refreshPanel();
  const ev = evaluate(stage, design, w);
  const judge = judgePrediction(design, prediction ?? { kind: 'none' }, w.firstBreak);
  const isChallenge = stage?.chapter === 'challenge';
  const cost = designCost(design);
  if (stage) recordResult(stage.id, ev.stars, isChallenge && ev.cleared ? ev.height : undefined);
  logAttempt({
    at: new Date().toISOString(),
    stageId: designId(),
    stageTitle: stage ? stageFullTitle(stage) : '自由に作る',
    cleared: ev.cleared,
    stars: stage ? ev.stars : 0,
    height: ev.height,
    cost,
    predicted: judge.predicted,
    actual: judge.actual,
    verdict: judge.verdict,
  });

  lastResult = stage
    ? {
        stage: stageFullTitle(stage),
        // ランキングを高さで並べたとき、倒れた建物が上に来ないよう、クリアしなかったら 0m にする
        height: ev.cleared ? ev.height : 0,
        stars: ev.stars,
        cost,
        result: ev.cleared ? 'クリア' : ev.fell === 'collapsed' ? '倒れた' : ev.fell === 'partly' ? '一部がくずれた' : '高さが足りない',
      }
    : null;

  const title = ev.cleared
    ? isChallenge
      ? `記録 ${ev.height} m！`
      : stage
        ? 'クリア！'
        : '耐えた！'
    : ev.fell === 'collapsed'
      ? '倒れてしまった…'
      : ev.fell === 'partly'
        ? '一部がくずれた…'
        : `高さが足りません（目標 ${goalHeight()} m）`;

  let html = `<div class="result-head"><h3>${title}</h3>${stage ? `<span class="stars">${starText(ev.stars)}</span>` : ''}</div>`;
  html += `<ul>${ev.checks.map((c) => `<li class="${c.ok ? 'ok' : ''}">${escapeHtml(c.label)}</li>`).join('')}</ul>`;
  html += `<div class="answer ${judge.verdict}"><span class="verdict">${VERDICT_LABEL[judge.verdict]}</span><div><strong>予想の答え合わせ</strong><br>${escapeHtml(judge.message)}<br><small>予想：${escapeHtml(judge.predicted)}　／　結果：${escapeHtml(judge.actual)}</small></div></div>`;
  const note = isChallenge ? safetyNote(ev) : null;
  if (note) html += `<p class="safety-note">${escapeHtml(note)}</p>`;
  if (stage && ev.cleared)
    html += `<div class="lesson"><strong>なぜ？</strong><p class="lesson-point">${escapeHtml(stage.point)}</p>${escapeHtml(stage.lesson)}</div>`;
  else if (ev.fell !== 'none') {
    const advice = breakAdvice(design, w.firstBreak);
    const partly = ev.fell === 'partly' ? '建物の一部が折れて、元の高さから落ちました。くずれた所がある建物は「倒れなかった」になりません。' : '';
    html += `<div class="lesson"><strong>見直そう</strong>${partly}スロー再生で、最初にこわれた所（黄色の輪）を確かめよう。${advice ? escapeHtml(advice) : stage ? escapeHtml(stage.hint) : ''}</div>`;
  }
  const canSend = lastResult !== null && classPanel.classForm() !== null;
  const canRank = isChallenge && !!classPanel.classForm()?.ranking;
  html += `<div class="buttons">${canSend ? '<button type="button" data-act="send">クラスに送る</button>' : ''}${canRank ? '<button type="button" data-act="ranking">ランキングを見る</button>' : ''}<button type="button" data-act="replay">スロー再生で見る</button>`;
  // チャレンジでは、次の章（発展）へ進まず、同じタワーを改良するのを主なボタンにする
  if (isChallenge) html += `<button type="button" data-act="sheet">ふりかえりを書く</button><button type="button" class="primary" data-act="rebuild">もっと高くする</button>`;
  else html += `<button type="button" data-act="rebuild">組み立てにもどる</button>`;
  const next = stage && ev.cleared && !isChallenge ? nextStage(stage.id) : undefined;
  if (next) html += `<button type="button" class="primary" data-act="next">次のステージへ</button>`;
  if (stage && ev.cleared && !next && !isChallenge) html += `<button type="button" class="primary" data-act="menu">ステージ一覧へ</button>`;
  html += `</div>`;

  resultBox.innerHTML = html;
  resultBox.className = `result ${ev.cleared ? 'ok' : 'fail'}`;
  resultBox.hidden = false;
  placeResultBox(w);
  resultBox.querySelector('[data-act=replay]')?.addEventListener('click', startReplay);
  resultBox.querySelector('[data-act=send]')?.addEventListener('click', classPanel.openSend);
  resultBox.querySelector('[data-act=ranking]')?.addEventListener('click', () => classPanel.openRanking());
  resultBox.querySelector('[data-act=sheet]')?.addEventListener('click', sheet.open);
  resultBox.querySelector('[data-act=rebuild]')?.addEventListener('click', backToBuild);
  resultBox.querySelector('[data-act=next]')?.addEventListener('click', () => next && openStage(next));
  resultBox.querySelector('[data-act=menu]')?.addEventListener('click', openMenu);
  hint.textContent = w.firstBreak
    ? '「スロー再生で見る」で、こわれた瞬間をもう一度見られます。'
    : '「スロー再生で見る」で、揺れ方をもう一度見られます。';
  refreshPanel();
}

/** 結果カードを、建物に重ならない側（右か左）に置く。どちらにも入らなければ、すき間の広い側 */
function placeResultBox(w: World): void {
  resultBox.classList.remove('left');
  resultBox.style.width = '';
  const xs = w.nodes.map((n) => toScreen(viewport, n.x, n.y).sx);
  if (xs.length === 0) return;
  const gap = 24;
  const need = resultBox.offsetWidth + gap * 2;
  const roomRight = cssWidth - Math.max(...xs);
  const roomLeft = Math.min(...xs);
  const left = roomRight < need && (roomLeft >= need || roomLeft > roomRight);
  resultBox.classList.toggle('left', left);
  // どちらにも入らないときは、すき間の広い側に合わせてカードを細くする（細くしすぎない）
  const room = (left ? roomLeft : roomRight) - gap * 2;
  if (room < resultBox.offsetWidth) resultBox.style.width = `${Math.max(MIN_RESULT_WIDTH, room)}px`;
}
const MIN_RESULT_WIDTH = 300;

// ---------- スロー再生 ----------

const replayStart = () => frames[0]?.time ?? 0;
const replayEnd = () => frames[frames.length - 1]?.time ?? 0;

/** 最初にこわれた少し前から再生する */
function breakReplayTime(): number {
  const fb = world?.firstBreak;
  return fb ? Math.max(replayStart(), fb.time - 1.5) : Math.max(replayStart(), SETTLE_TIME);
}

function startReplay(): void {
  if (phase !== 'result' || !world || frames.length < 2) return;
  phase = 'replay';
  resultBox.hidden = true;
  replayBar.hidden = false;
  $<HTMLButtonElement>('replay-break').disabled = !world.firstBreak;
  replayTime = breakReplayTime();
  replayPlaying = true;
  updateReplayBar();
  hint.textContent = world.firstBreak ? '黄色の輪が、最初にこわれた所です。' : 'どこもこわれませんでした。揺れ方をよく見てみよう。';
}

function closeReplay(): void {
  if (phase !== 'replay' || !world) return;
  replayPlaying = false;
  applyFrame(world, frames[frames.length - 1]);
  phase = 'result';
  replayBar.hidden = true;
  resultBox.hidden = false;
  hint.textContent = '';
}

function updateReplayBar(): void {
  const span = replayEnd() - replayStart() || 1;
  replaySeek.value = String(Math.round(((replayTime - replayStart()) / span) * 1000));
  replayPlay.textContent = replayPlaying ? '一時停止' : '再生';
  $('replay-time').textContent = `${Math.max(0, replayTime - SETTLE_TIME).toFixed(1)}秒`;
}

replayPlay.addEventListener('click', () => {
  if (replayTime >= replayEnd()) replayTime = replayStart();
  replayPlaying = !replayPlaying;
  updateReplayBar();
});
replaySeek.addEventListener('input', () => {
  replayTime = replayStart() + (Number(replaySeek.value) / 1000) * (replayEnd() - replayStart());
  replayPlaying = false;
  updateReplayBar();
});
$('replay-break').addEventListener('click', () => {
  replayTime = breakReplayTime();
  replayPlaying = true;
  updateReplayBar();
});
$('replay-close').addEventListener('click', closeReplay);

// ---------- ふりかえりシート・クラスランキング（src/ui/ にある画面） ----------

/** 画像に写す範囲（キャンバスの画素）。高いステージは空が広いので、建物のまわりを切り出す */
function shotRect(): { x: number; y: number; w: number; h: number } {
  const dpr = canvas.width / cssWidth;
  const pts = [...design.nodes, ...(world && phase !== 'build' && phase !== 'predict' ? world.nodes : [])].map((n) => toScreen(viewport, n.x, n.y));
  if (pts.length === 0) return { x: 0, y: 0, w: canvas.width, h: canvas.height };
  const margin = 80;
  // 横長の画面に収まりやすいよう、高さの 1.4 倍以上の幅にする
  let top = Math.max(0, Math.min(...pts.map((p) => p.sy)) - margin);
  const bottom = cssHeight;
  top = Math.min(top, bottom - 240);
  const h = bottom - Math.max(0, top);
  const cx = (Math.min(...pts.map((p) => p.sx)) + Math.max(...pts.map((p) => p.sx))) / 2;
  const half = Math.min(cssWidth / 2, Math.max((Math.max(...pts.map((p) => p.sx)) - Math.min(...pts.map((p) => p.sx))) / 2 + margin, (h * 1.4) / 2));
  const left = Math.max(0, Math.min(cssWidth - half * 2, cx - half));
  const px = (v: number) => Math.round(v * dpr);
  return { x: px(left), y: px(Math.max(0, top)), w: px(Math.min(cssWidth, half * 2)), h: px(h) };
}

const sheet = setupReflectionSheet({
  canOpen: () => phase !== 'test' && stage?.chapter === 'challenge',
  beforeShot: () => selectMember(null),
  shotRect,
  canvas,
  stageTitle: () => stage?.title ?? '',
});

const classPanel = setupClassPanel({
  isChallenge: () => stage?.chapter === 'challenge',
  closeMenu: () => (menu.hidden = true),
  lastResult: () => lastResult,
  setHint: (text) => (hint.textContent = text),
});

// ---------- このアプリについて（作者・更新履歴・ライセンス） ----------

const aboutDialog = $<HTMLDivElement>('about-dialog');

function buildAbout(): void {
  $('about-version').textContent = `ver.${CHANGELOG[0].version}`;
  $('about-author').textContent = AUTHOR;

  const log = $('about-changelog');
  for (const c of CHANGELOG) {
    const box = el('div', undefined, 'change');
    const head = el('p', undefined, 'change-head');
    head.append(el('span', `ver.${c.version}`, 'change-ver'), ` ${c.title}`, el('small', `　${c.date}`));
    const ul = el('ul');
    for (const it of c.items) ul.append(el('li', it));
    box.append(head, ul);
    log.append(box);
  }

  $('about-license').textContent = `このアプリは${APP_LICENSE.name}です。${APP_LICENSE.summary}`;
  $('about-license-text').textContent = `MIT License\n\n${APP_LICENSE.copyright}\n\n${MIT_TEXT}`;

  const libs = $('about-libs');
  for (const t of THIRD_PARTY) {
    const li = el('li');
    const a = el('a', t.name);
    a.href = t.url;
    a.target = '_blank';
    a.rel = 'noopener';
    li.append(a, `：${t.use}　`, el('span', t.license, 'lib-license'));
    libs.append(li);
  }
}
buildAbout();

$('open-about').addEventListener('click', () => (aboutDialog.hidden = false));
$('about-close').addEventListener('click', () => (aboutDialog.hidden = true));
closeOnBackdrop(aboutDialog);

// ---------- 遊び方 ----------

const howtoDialog = $<HTMLDivElement>('howto-dialog');
/** はじめて開いたときは、遊び方を閉じたらステージ一覧を出す */
let menuAfterHowto = false;

function openHowto(first = false): void {
  if (phase === 'test') return;
  menuAfterHowto = first;
  howtoDialog.hidden = false;
}

function closeHowto(): void {
  howtoDialog.hidden = true;
  if (menuAfterHowto) openMenu();
  menuAfterHowto = false;
}

$('open-howto').addEventListener('click', () => openHowto());
$('howto-close').addEventListener('click', closeHowto);
howtoDialog.addEventListener('click', (e) => {
  if (e.target === howtoDialog) closeHowto();
});

// ---------- 入力 ----------

function eventPoint(e: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return toWorld(viewport, e.clientX - rect.left, e.clientY - rect.top);
}

function snap(p: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.max(Math.ceil(VIEW.minX), Math.min(Math.floor(VIEW.maxX), Math.round(p.x))),
    y: Math.max(0, Math.min(viewport.maxY - 1, Math.round(p.y))),
  };
}

/**
 * 指で置くときのスナップ：近くに今あるつなぎ目があれば、そこに吸いつける。
 * 指は点よりずっと太いので、方眼の半マスより広く（画面で 22px まで）吸いつけて、つなぎ損ねを防ぐ。
 */
function snapTouch(p: { x: number; y: number }): { x: number; y: number } {
  const reach = Math.max(0.5, 22 / viewport.scale);
  let best: { x: number; y: number } | null = null;
  let bestD = reach;
  for (const n of design.nodes) {
    const d = Math.hypot(n.x - p.x, n.y - p.y);
    if (d < bestD && n.y < viewport.maxY) {
      bestD = d;
      best = { x: n.x, y: n.y };
    }
  }
  return best ?? snap(p);
}

function memberAt(p: { x: number; y: number }): number | null {
  let best: number | null = null;
  // 指でもタップしやすいよう、画面で 14px 以内なら当たりにする
  let bestD = Math.max(0.45, 14 / viewport.scale);
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

/** 指（またはペン）で触っている間の、指の画面上の位置。ルーペを出すのに使う。マウスのときは null */
let aim: { sx: number; sy: number; world: { x: number; y: number } } | null = null;
/** 画面を押している間 true（「予想」は、指をはなした所の部材に決める） */
let pressing = false;
/** 押している指が指・ペンかどうか */
let pressTouch = false;

function updateAim(e: PointerEvent): void {
  if (e.pointerType === 'mouse' || !pressing) {
    aim = null;
    return;
  }
  const rect = canvas.getBoundingClientRect();
  aim = { sx: e.clientX - rect.left, sy: e.clientY - rect.top, world: eventPoint(e) };
}

const snapFor = (p: { x: number; y: number }) => (pressTouch ? snapTouch(p) : snap(p));

function endPress(): void {
  pressing = false;
  aim = null;
  dragStart = null;
  dragEnd = null;
  pressAt = null;
}

// ---------- 置いた部材を選んで直す ----------

const selectBox = $<HTMLDivElement>('select-box');
const selectMats = $<HTMLDivElement>('select-mats');

/** 部材を選ぶ（null で選ぶのをやめる）。選んだら、材料を変える・消すの札を出す */
function selectMember(i: number | null): void {
  selectedMember = i !== null && design.members[i] ? i : null;
  updateSelectBox();
}

function updateSelectBox(): void {
  const i = selectedMember;
  selectBox.hidden = i === null || phase !== 'build';
  if (i === null) return;
  const m = design.members[i];
  const a = design.nodes[m.a];
  const b = design.nodes[m.b];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const shown = Number.isInteger(len) ? `${len}` : len.toFixed(1);
  $('select-title').textContent = `選んだ部材：${describeMember(design, i)}　長さ ${shown} m`;
  selectMats.innerHTML = '';
  for (const id of allowedMaterials()) {
    const info = MATERIALS[id];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.classList.toggle('active', m.material === id);
    btn.innerHTML = `<span class="swatch" style="background:${info.color}"></span>${info.name}`;
    btn.addEventListener('click', () => changeSelectedMaterial(id));
    selectMats.appendChild(btn);
  }
  // 札が選んだ部材にかぶらないよう、部材が上半分にあれば札を下に出す
  const mid = toScreen(viewport, (a.x + b.x) / 2, (a.y + b.y) / 2);
  selectBox.classList.toggle('bottom', mid.sy < cssHeight / 2);
}

function changeSelectedMaterial(id: MaterialId): void {
  const i = selectedMember;
  if (i === null || phase !== 'build' || design.members[i].material === id) return;
  remember();
  setMemberMaterial(design, i, id);
  persist();
  refreshPanel();
  updateSelectBox();
  const over = stage && designCost(design) > stage.budget;
  hint.textContent = over
    ? `${MATERIALS[id].name}に変えました。予算オーバーです。`
    : `${MATERIALS[id].name}に変えました。`;
}

function deleteSelected(): void {
  const i = selectedMember;
  if (i === null || phase !== 'build') return;
  remember();
  const hadLoad = (design.loads?.length ?? 0) > 0;
  removeMember(design, i);
  selectMember(null);
  persist();
  refreshPanel();
  fitView();
  hint.textContent =
    hadLoad && !design.loads?.length && stage?.load
      ? `床がなくなったので、${stage.load.name}を外しました。「${stage.load.name}を置く」で置き直そう。`
      : '部材を消しました。';
}

$('select-delete').addEventListener('click', deleteSelected);
$('select-close').addEventListener('click', () => {
  selectMember(null);
  hint.textContent = '';
});
window.addEventListener('keydown', (e) => {
  if (phase !== 'build' || selectedMember === null) return;
  if ((e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    deleteSelected();
  } else if (e.key === 'Escape') {
    selectMember(null);
  }
});

/** 押し始めた所（画面の位置と、方眼の位置）。タップ（ほとんど動かさずにはなす）かどうかを見分ける */
let pressAt: { sx: number; sy: number; world: { x: number; y: number } } | null = null;
/** これより動かさずにはなしたら「タップ」（画面の px） */
const TAP_SLOP = { mouse: 6, touch: 12 };

function choosePrediction(p: { x: number; y: number }): void {
  const i = memberAt(p);
  hoverMember = i;
  if (i !== null) {
    prediction = { kind: 'member', index: i };
    updatePredictBox();
  }
}

canvas.addEventListener('pointerdown', (e) => {
  // 2本目の指（ピンチなど）は無視する
  if (!e.isPrimary) return;
  if (phase !== 'build' && phase !== 'predict') return;
  canvas.setPointerCapture(e.pointerId);
  pressing = true;
  pressTouch = e.pointerType !== 'mouse';
  updateAim(e);
  const p = eventPoint(e);
  if (phase === 'predict') {
    choosePrediction(p);
    return;
  }
  if (tool === 'load') {
    placeLoad(p.y);
    endPress();
    return;
  }
  // 「タップ＝選ぶ」「ドラッグ＝置く」。どちらになるかは、指をはなしたときに決める
  const rect = canvas.getBoundingClientRect();
  pressAt = { sx: e.clientX - rect.left, sy: e.clientY - rect.top, world: p };
  dragStart = snapFor(p);
  dragEnd = dragStart;
});

canvas.addEventListener('pointermove', (e) => {
  if (!e.isPrimary) return;
  if (phase !== 'build' && phase !== 'predict') return;
  updateAim(e);
  const p = eventPoint(e);
  if (phase === 'predict') {
    if (pressing) choosePrediction(p);
    else hoverMember = memberAt(p);
    return;
  }
  hoverMember = null;
  if (dragStart) dragEnd = snapFor(p);
});

canvas.addEventListener('pointerup', (e) => {
  if (!e.isPrimary) return;
  if (dragStart && dragEnd && pressAt && isTap(e, pressAt, dragStart, dragEnd)) {
    tapAt(pressAt.world);
  } else if (dragStart && dragEnd) {
    if (lengthOk(dragStart, dragEnd)) {
      remember();
      addMember(design, dragStart.x, dragStart.y, dragEnd.x, dragEnd.y, material);
      // 部材が分かれて番号が変わることがあるので、選んでいた部材は選びなおし
      selectMember(null);
      persist();
      refreshPanel();
      fitView();
      const over = stage && designCost(design) > stage.budget;
      hint.textContent = over
        ? '予算オーバーです。部材を減らすか、安い材料にしよう。'
        : `部材を置きました。続けて置くか、「${startBtn.textContent}」で試験しよう。`;
    } else if (dragStart.x !== dragEnd.x || dragStart.y !== dragEnd.y) {
      hint.textContent = `部材の長さは ${MAX_MEMBER_LENGTH} m までです。`;
    }
  }
  endPress();
  if (e.pointerType !== 'mouse' && phase === 'predict') hoverMember = null;
});

// タッチが途中で取り消されたら（画面の端に指が出た、など）、置きかけの部材・消しかけの部材を捨てる
canvas.addEventListener('pointercancel', () => {
  endPress();
  hoverMember = null;
});

canvas.addEventListener('pointerleave', (e) => {
  if (e.pointerType === 'mouse') hoverMember = null;
});

/** ほとんど動かさずにはなしたか（点がずれていない、または指のぶれ程度しか動いていない） */
function isTap(
  e: PointerEvent,
  at: { sx: number; sy: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean {
  if (a.x === b.x && a.y === b.y) return true;
  const rect = canvas.getBoundingClientRect();
  const moved = Math.hypot(e.clientX - rect.left - at.sx, e.clientY - rect.top - at.sy);
  return moved < (e.pointerType === 'mouse' ? TAP_SLOP.mouse : TAP_SLOP.touch);
}

/** 組み立て中のタップ：部材の上なら選ぶ（同じ部材なら選ぶのをやめる）、何もない所なら選ぶのをやめる */
function tapAt(p: { x: number; y: number }): void {
  const i = memberAt(p);
  if (i === null) {
    if (selectedMember !== null) hint.textContent = '';
    selectMember(null);
    return;
  }
  if (i === selectedMember) {
    selectMember(null);
    hint.textContent = '';
    return;
  }
  selectMember(i);
  hint.textContent = '材料を変えるか、消すかを選ぼう。新しく置くときは、点から点へドラッグ。';
}

/** ルーペの下に出す一言 */
function aimLabel(): { text: string | null; ok: boolean } {
  if (phase === 'predict') {
    return { text: hoverMember !== null ? 'この部材を予想' : null, ok: true };
  }
  if (dragStart && dragEnd) {
    const len = Math.hypot(dragEnd.x - dragStart.x, dragEnd.y - dragStart.y);
    if (len === 0) return { text: '始まりの点', ok: true };
    const ok = lengthOk(dragStart, dragEnd);
    const shown = Number.isInteger(len) ? `${len}` : len.toFixed(1);
    return { text: ok ? `長さ ${shown} m` : `長すぎ（${MAX_MEMBER_LENGTH} m まで）`, ok };
  }
  return { text: null, ok: true };
}

/** 重いもの（機械など）を、タップした高さにいちばん近い床に置く */
function placeLoad(y: number): void {
  if (!stage?.load) return;
  const levels = [...new Set(design.nodes.filter((n) => n.y > 0).map((n) => n.y))];
  if (levels.length === 0) return;
  const best = levels.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a));
  remember();
  design.loads = [{ y: best, mass: stage.load.mass, name: stage.load.name }];
  persist();
  refreshPanel();
  const where =
    best >= designHeight(design) ? `屋上（高さ${best}m）` : best % 3 === 0 ? `${best / 3 + 1}階の床（高さ${best}m）` : `高さ${best}mの床`;
  hint.textContent = `${where}に${stage.load.name}を置きました。ほかの階に動かすには、その床をタップしよう。`;
}

// ---------- 描画ループ ----------

function resize(): void {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  cssWidth = rect.width;
  cssHeight = rect.height;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  viewport = makeViewport(cssWidth, cssHeight, viewMaxY);
}
// ヘッダーの文字数が変わると画面の高さも変わるので、キャンバスの大きさの変化を見張る
new ResizeObserver(resize).observe(canvas);

let lastFrameAt = performance.now();
/** 計算の1歩（秒） */
const SIM_STEP = 1 / 60;
/** まだ計算していない、たまった時間（秒） */
let simLag = 0;

const legend = $<HTMLDivElement>('legend');

const stageBox = document.querySelector<HTMLDivElement>('.stage')!;

function frame(now: number): void {
  legend.hidden = phase !== 'test' && phase !== 'replay';
  stageBox.classList.toggle('replaying', phase === 'replay');
  document.body.classList.toggle('predicting', phase === 'predict');
  document.body.classList.toggle('replaying', phase === 'replay');
  const dt = Math.min(0.1, (now - lastFrameAt) / 1000);
  lastFrameAt = now;
  if (world && phase === 'test') {
    // 画面の書きかえの速さ（30回/秒の端末、120回/秒の画面など）によらず、実際の時間どおりに進める。
    // 計算はいつも 1/60 秒ずつ進めるので、スロー再生でもふつうでも結果は同じになる
    simLag += dt * (slowCheck.checked ? 0.25 : 1);
    const quakeEnd = SETTLE_TIME + (world.quake?.duration ?? world.wind?.duration ?? 0) + 2;
    while (simLag >= SIM_STEP && phase === 'test') {
      simLag -= SIM_STEP;
      step(world, SIM_STEP);
      frames.push(captureFrame(world, currentShift(world)));
      if (world.time > quakeEnd || (world.collapsed && world.time > (world.collapseTime ?? 0) + 2.5)) showResult(world);
    }
  }
  if (world && phase === 'replay') {
    if (replayPlaying) {
      replayTime += dt * Number(replaySpeed.value);
      if (replayTime >= replayEnd()) {
        replayTime = replayEnd();
        replayPlaying = false;
      }
      updateReplayBar();
    }
    applyFrame(world, frames[frameIndexAt(frames, replayTime)]);
  }
  if (world && phase !== 'build' && phase !== 'predict') {
    const shift = phase === 'replay' ? frames[frameIndexAt(frames, replayTime)].groundShift : currentShift(world);
    drawWorld(ctx, viewport, cssWidth, cssHeight, world, shift, goalHeight(), {
      predictMember: prediction?.kind === 'member' ? prediction.index : null,
      firstBreak: phase === 'test' ? null : world.firstBreak,
      pulse: (Math.sin(now / 150) + 1) / 2,
    });
  } else {
    const preview =
      phase === 'build' && dragStart && dragEnd
        ? { x1: dragStart.x, y1: dragStart.y, x2: dragEnd.x, y2: dragEnd.y, color: MATERIALS[material].color, ok: lengthOk(dragStart, dragEnd) }
        : null;
    const pin = phase === 'predict' && prediction?.kind === 'member' ? prediction.index : null;
    drawDesign(ctx, viewport, cssWidth, cssHeight, design, preview, hoverMember, goalHeight(), pin, phase === 'build' ? selectedMember : null);
    if (aim) {
      // 指の下にかくれた所を、指からはなれたルーペに映す
      const focus = phase === 'build' && tool === 'place' && dragEnd ? dragEnd : aim.world;
      const label = aimLabel();
      drawLoupe(ctx, viewport, cssWidth, cssHeight, focus, aim, label.text, label.ok);
    }
    if (phase === 'build' && dragStart && dragEnd) {
      drawAimRing(ctx, viewport, dragStart, '#1f1f1f');
      if (dragEnd.x !== dragStart.x || dragEnd.y !== dragStart.y) drawAimRing(ctx, viewport, dragEnd);
    }
  }
  stageBox.classList.toggle('aiming', !!aim);
  requestAnimationFrame(frame);
}

function currentShift(w: World): number {
  return w.quake ? groundOffset(w.quake, w.time - SETTLE_TIME) : 0;
}

resize();
classPanel.loadClassLinkFromUrl();
classPanel.refreshClassStatus();
const lastId = loadLastStage();
if (lastId === FREE_ID) openStage(null);
else openStage(stageById(lastId ?? '') ?? STAGES[0]);
if (!lastId) openHowto(true);
requestAnimationFrame(frame);

// 画面の操作：ステージを選ぶ、部材を置く・消す、地震で試験する、結果を見る。

import { addMember, designCost, designHeight, emptyDesign, frameDesign, removeMember, type Design } from './physics/design';
import { MATERIALS, MATERIAL_IDS, type MaterialId } from './physics/materials';
import { groundOffset, makeQuake, QUAKE_LEVELS, QUAKE_TYPES, type QuakeLevel, type QuakeType } from './physics/quake';
import { createWorld, SETTLE_TIME, step, type World } from './physics/world';
import { canStartTest, evaluate } from './game/evaluate';
import { judgePrediction, describeMember, type Prediction } from './game/predict';
import { applyFrame, captureFrame, frameIndexAt, type Frame } from './game/replay';
import { buildSubmitUrl, classLinkFor, parseFormTemplate, readClassLink, validateTemplate, type FormTemplate } from './game/classForm';
import {
  clearAttempts,
  clearClassForm,
  loadClassForm,
  saveClassForm,
  loadAttempts,
  loadDesign,
  loadNotes,
  loadProgress,
  logAttempt,
  recordResult,
  saveDesign,
  saveNotes,
} from './game/progress';
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
const predictBox = $<HTMLDivElement>('predict-box');
const predictGo = $<HTMLButtonElement>('predict-go');
const replayBar = $<HTMLDivElement>('replay-bar');
const replaySeek = $<HTMLInputElement>('replay-seek');
const replayPlay = $<HTMLButtonElement>('replay-play');
const replaySpeed = $<HTMLSelectElement>('replay-speed');
const sheet = $<HTMLDivElement>('sheet');

/** null のときは「自由に作る」モード */
let stage: Stage | null = null;
let design: Design = emptyDesign();
let material: MaterialId = 'wood';
let tool: 'place' | 'erase' = 'place';
/** build：組み立て / predict：予想 / test：試験中 / result：結果 / replay：再生 */
type Phase = 'build' | 'predict' | 'test' | 'result' | 'replay';
let phase: Phase = 'build';
let world: World | null = null;
let prediction: Prediction | null = null;
let frames: Frame[] = [];
let replayTime = 0;
let replayPlaying = false;
/** いちばん最近の試験結果（クラスに送る用） */
let lastResult: { stage: string; height: number; stars: number; cost: number; result: string } | null = null;
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
  resetTest();
  stage = s;
  design = loadDesign(designId()) ?? (s ? s.initial() : frameDesign({ floors: 3 }));
  if (!allowedMaterials().includes(material)) material = allowedMaterials()[0];
  try {
    localStorage.setItem(LAST_STAGE_KEY, designId());
  } catch {
    // 何もしない
  }
  menu.hidden = true;

  $('stage-no').textContent = s ? (s.chapter === 'challenge' ? 'チャレンジ' : s.id) : '実験';
  $('stage-name').textContent = s ? s.title : '自由に作る';
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
  if (phase === 'test') return;
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
    b.innerHTML = `<span class="swatch" style="background:${m.color}"></span>${m.name}<span class="price">${m.costPerMeter}万円/m</span>`;
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
  if (phase !== 'build') return;
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
startBtn.addEventListener('click', startPredict);
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
  for (const id of ['sample-square', 'sample-braced', 'clear', 'restart', 'show-hint']) $<HTMLButtonElement>(id).disabled = running;
  startBtn.disabled = running || design.members.length === 0;
  resetBtn.disabled = !running;
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
  world = createWorld(design, quake);
  frames = [captureFrame(world, 0)];
  phase = 'test';
  predictBox.hidden = true;
  resultBox.hidden = true;
  hint.textContent = '地震が来ます…　赤くなる所が、こわれそうな所です。';
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
  const ev = evaluate(stage, design, w);
  const judge = judgePrediction(design, prediction ?? { kind: 'none' }, w.firstBreak);
  const isChallenge = stage?.chapter === 'challenge';
  if (stage) recordResult(stage.id, ev.stars, isChallenge && ev.cleared ? ev.height : undefined);
  logAttempt({
    at: new Date().toISOString(),
    stageId: designId(),
    stageTitle: stage ? `${stage.chapter === 'challenge' ? 'チャレンジ' : stage.id} ${stage.title}` : '自由に作る',
    cleared: ev.cleared,
    stars: stage ? ev.stars : 0,
    height: ev.height,
    cost: designCost(design),
    predicted: judge.predicted,
    actual: judge.actual,
    verdict: judge.verdict,
  });

  lastResult = stage
    ? {
        stage: `${isChallenge ? 'チャレンジ' : stage.id} ${stage.title}`,
        // ランキングを高さで並べたとき、倒れた建物が上に来ないよう、クリアしなかったら 0m にする
        height: ev.cleared ? ev.height : 0,
        stars: ev.stars,
        cost: designCost(design),
        result: ev.cleared ? 'クリア' : w.collapsed ? '倒れた' : '高さが足りない',
      }
    : null;

  const title = ev.cleared
    ? isChallenge
      ? `記録 ${ev.height} m！`
      : stage
        ? 'クリア！'
        : '耐えた！'
    : w.collapsed
      ? '倒れてしまった…'
      : `高さが足りません（目標 ${goalHeight()} m）`;

  let html = `<div class="result-head"><h3>${title}</h3>${stage ? `<span class="stars">${starText(ev.stars)}</span>` : ''}</div>`;
  html += `<ul>${ev.checks.map((c) => `<li class="${c.ok ? 'ok' : ''}">${escapeHtml(c.label)}</li>`).join('')}</ul>`;
  html += `<div class="answer ${judge.verdict}"><span class="verdict">${VERDICT_LABEL[judge.verdict]}</span><div><strong>予想の答え合わせ</strong><br>${escapeHtml(judge.message)}<br><small>予想：${escapeHtml(judge.predicted)}　／　結果：${escapeHtml(judge.actual)}</small></div></div>`;
  if (stage && ev.cleared) html += `<div class="lesson"><strong>なぜ？</strong>${escapeHtml(stage.lesson)}</div>`;
  else if (w.collapsed) html += `<div class="lesson"><strong>見直そう</strong>スロー再生で、最初にこわれた所（黄色の輪）を確かめよう。${stage ? escapeHtml(stage.hint) : ''}</div>`;
  const canSend = lastResult !== null && classForm() !== null;
  html += `<div class="buttons">${canSend ? '<button type="button" data-act="send">クラスに送る</button>' : ''}<button type="button" data-act="replay">スロー再生で見る</button><button type="button" data-act="rebuild">建て直す</button>`;
  const next = stage && ev.cleared ? nextStage(stage.id) : undefined;
  if (next) html += `<button type="button" class="primary" data-act="next">次のステージへ</button>`;
  if (stage && ev.cleared && !next) html += `<button type="button" class="primary" data-act="menu">ステージ一覧へ</button>`;
  html += `</div>`;

  resultBox.innerHTML = html;
  resultBox.className = `result ${ev.cleared ? 'ok' : 'fail'}`;
  resultBox.hidden = false;
  resultBox.querySelector('[data-act=replay]')?.addEventListener('click', startReplay);
  resultBox.querySelector('[data-act=send]')?.addEventListener('click', openSend);
  resultBox.querySelector('[data-act=rebuild]')?.addEventListener('click', backToBuild);
  resultBox.querySelector('[data-act=next]')?.addEventListener('click', () => next && openStage(next));
  resultBox.querySelector('[data-act=menu]')?.addEventListener('click', openMenu);
  hint.textContent = '「スロー再生で見る」で、こわれた瞬間をもう一度見られます。';
}

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

// ---------- ふりかえりシート ----------

const QUESTIONS = [
  { id: 'q1', text: '予想と結果をくらべて、気づいたことは？' },
  { id: 'q2', text: '三角形（筋交い）を入れると強くなるのは、なぜだと思う？' },
  { id: 'q3', text: '材料はどうやって選んだ？（強さ・重さ・費用のどれを大事にした？）' },
  { id: 'q4', text: '班のみんなの作品で、よいと思った工夫は？' },
];

function openSheet(): void {
  if (phase === 'test') return;
  const notes = loadNotes();
  const attempts = loadAttempts();
  const box = $('sheet-attempts');
  if (attempts.length === 0) {
    box.innerHTML = '<p class="sheet-empty">まだ試験の記録がありません。</p>';
  } else {
    const rows = attempts
      .map((a) => {
        const d = new Date(a.at);
        const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
        const result = a.cleared ? (a.stars > 0 ? `${'★'.repeat(a.stars)}` : '耐えた') : '×';
        return `<tr><td>${time}</td><td>${escapeHtml(a.stageTitle)}</td><td>${a.height}m / ${a.cost}万円</td><td>${escapeHtml(a.predicted)}</td><td>${escapeHtml(a.actual)}</td><td class="v-${a.verdict}">${VERDICT_LABEL[a.verdict]}</td><td>${result}</td></tr>`;
      })
      .join('');
    box.innerHTML = `<div class="table-wrap"><table><thead><tr><th>時刻</th><th>ステージ</th><th>高さ・費用</th><th>予想</th><th>最初にこわれた所</th><th>答え合わせ</th><th>結果</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  const qs = $('sheet-questions');
  qs.innerHTML = QUESTIONS.map(
    (q, i) => `<label class="question">${i + 1}. ${q.text}<textarea rows="3" data-note="${q.id}"></textarea></label>`,
  ).join('');
  sheet.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-note]').forEach((el) => {
    el.value = notes[el.dataset.note!] ?? '';
  });
  sheet.hidden = false;
}

sheet.addEventListener('input', (e) => {
  const el = e.target as HTMLInputElement | HTMLTextAreaElement;
  if (!el.dataset.note) return;
  const notes = loadNotes();
  notes[el.dataset.note] = el.value;
  saveNotes(notes);
});
$('open-sheet').addEventListener('click', openSheet);
$('sheet-close').addEventListener('click', () => (sheet.hidden = true));
$('sheet-print').addEventListener('click', () => window.print());
$('sheet-clear').addEventListener('click', () => {
  if (!confirm('試験の記録と書いたことを全部消しますか？')) return;
  clearAttempts();
  saveNotes({});
  openSheet();
});
sheet.addEventListener('click', (e) => {
  if (e.target === sheet) sheet.hidden = true;
});

// ---------- クラスランキング（先生の Google フォーム） ----------

const classDialog = $<HTMLDivElement>('class-dialog');
const sendDialog = $<HTMLDivElement>('send-dialog');
const classInput = $<HTMLTextAreaElement>('class-input');
const classMsg = $<HTMLParagraphElement>('class-msg');

const classForm = (): FormTemplate | null => validateTemplate(loadClassForm());

function refreshClassStatus(): void {
  $('class-status').textContent = classForm() ? 'クラスランキング：設定ずみ（結果カードの「クラスに送る」で記録を送れます）' : '';
}

function showClassLink(t: FormTemplate | null): void {
  $('class-link-box').hidden = !t;
  if (t) $<HTMLTextAreaElement>('class-link').value = classLinkFor(location.href, t);
}

function openClassDialog(): void {
  classInput.value = '';
  classMsg.textContent = '';
  classMsg.className = 'class-msg';
  const t = classForm();
  if (t) {
    classMsg.textContent = 'この端末は設定ずみです。別のフォームにするときは、新しいリンクを貼ってください。';
    classMsg.className = 'class-msg ok';
  }
  showClassLink(t);
  menu.hidden = true;
  classDialog.hidden = false;
}

classInput.addEventListener('input', () => {
  if (!classInput.value.trim()) return;
  const r = parseFormTemplate(classInput.value);
  if (!r.ok) {
    classMsg.textContent = r.reason;
    classMsg.className = 'class-msg ng';
    return;
  }
  saveClassForm(r.template);
  const extra = r.unused.length > 0 ? `（${r.unused.length}つの質問はなしで送ります）` : '';
  classMsg.textContent = `読み取れました${extra}。下のクラスリンクを生徒に配ってください。`;
  classMsg.className = 'class-msg ok';
  showClassLink(r.template);
  refreshClassStatus();
});

$('class-copy').addEventListener('click', async () => {
  const box = $<HTMLTextAreaElement>('class-link');
  try {
    await navigator.clipboard.writeText(box.value);
    $('class-copy').textContent = 'コピーしました';
  } catch {
    box.select();
    $('class-copy').textContent = '選んだ所をコピーしてください';
  }
  setTimeout(() => ($('class-copy').textContent = 'リンクをコピー'), 2000);
});
$('class-test').addEventListener('click', () => {
  const t = classForm();
  if (!t) return;
  const url = buildSubmitUrl(t, { name: 'テスト', group: '先生', stage: 'チャレンジ 最高タワーチャレンジ', height: '0', stars: '0', cost: '0', result: 'ためし' });
  window.open(url, '_blank', 'noopener');
});
$('class-forget').addEventListener('click', () => {
  if (!confirm('この端末のクラスランキングの設定を消しますか？')) return;
  clearClassForm();
  openClassDialog();
  refreshClassStatus();
});
$('class-close').addEventListener('click', () => (classDialog.hidden = true));
$('open-class').addEventListener('click', openClassDialog);

function openSend(): void {
  if (!lastResult) return;
  const notes = loadNotes();
  $<HTMLInputElement>('send-name').value = notes.nickname ?? '';
  $<HTMLInputElement>('send-group').value = notes.group ?? '';
  $('send-summary').textContent = `${lastResult.stage}　高さ ${lastResult.height} m・星 ${lastResult.stars}・費用 ${lastResult.cost} 万円（${lastResult.result}）${lastResult.height === 0 ? '　※クリアしないと高さの記録は 0 m です' : ''}`;
  sendDialog.hidden = false;
  $<HTMLInputElement>('send-name').focus();
}

$('send-cancel').addEventListener('click', () => (sendDialog.hidden = true));
$('send-go').addEventListener('click', () => {
  const t = classForm();
  const name = $<HTMLInputElement>('send-name').value.trim();
  const group = $<HTMLInputElement>('send-group').value.trim();
  if (!t || !lastResult) return;
  if (!name) {
    $('send-summary').textContent = 'ニックネームを入れてください。';
    return;
  }
  const notes = loadNotes();
  notes.nickname = name;
  notes.group = group;
  saveNotes(notes);
  const url = buildSubmitUrl(t, {
    name,
    group,
    stage: lastResult.stage,
    height: String(lastResult.height),
    stars: String(lastResult.stars),
    cost: String(lastResult.cost),
    result: lastResult.result,
  });
  window.open(url, '_blank', 'noopener');
  sendDialog.hidden = true;
  hint.textContent = '開いたフォームで「送信」を押してください。';
});
for (const d of [classDialog, sendDialog])
  d.addEventListener('click', (e) => {
    if (e.target === d) d.hidden = true;
  });

/** クラスリンクから開いたときは、先生のフォームの設定を読みこむ */
function loadClassLinkFromUrl(): void {
  const t = readClassLink(location.hash);
  if (!t) return;
  saveClassForm(t);
  history.replaceState(null, '', location.pathname + location.search);
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
  if (phase === 'predict') {
    const i = memberAt(eventPoint(e));
    if (i !== null) {
      prediction = { kind: 'member', index: i };
      updatePredictBox();
    }
    return;
  }
  if (phase !== 'build') return;
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
  if (phase !== 'build' && phase !== 'predict') return;
  const p = eventPoint(e);
  hoverMember = tool === 'erase' || phase === 'predict' ? memberAt(p) : null;
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
        : '部材を置きました。続けて置くか、「地震スタート！」で試験しよう。';
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

let lastFrameAt = performance.now();

function frame(now: number): void {
  const dt = Math.min(0.1, (now - lastFrameAt) / 1000);
  lastFrameAt = now;
  if (world && phase === 'test') {
    step(world, (1 / 60) * (slowCheck.checked ? 0.25 : 1));
    frames.push(captureFrame(world, currentShift(world)));
    const quakeEnd = SETTLE_TIME + (world.quake?.duration ?? 0) + 2;
    if (world.time > quakeEnd || (world.collapsed && world.time > (world.collapseTime ?? 0) + 2.5)) showResult(world);
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
    drawDesign(ctx, viewport, cssWidth, cssHeight, design, preview, hoverMember, goalHeight(), pin);
  }
  requestAnimationFrame(frame);
}

function currentShift(w: World): number {
  return w.quake ? groundOffset(w.quake, w.time - SETTLE_TIME) : 0;
}

resize();
loadClassLinkFromUrl();
refreshClassStatus();
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

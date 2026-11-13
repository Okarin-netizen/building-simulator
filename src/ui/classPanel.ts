// クラスランキングの画面：先生の設定（フォームのリンク・ランキングの URL）、生徒の「クラスに送る」、アプリ内のランキング表示。

import RANKING_FORM_SCRIPT from '../teacher/rankingForm.gs?raw';
import { fetchRanking, isMine, RankingSheetError } from '../game/classRanking';
import { buildSubmitUrl, classLinkFor, parseFormTemplate, parseTeacherInput, readClassLink, validateTemplate, type FormTemplate } from '../game/classForm';
import { clearClassForm, loadClassForm, loadNotes, saveClassForm, saveNotes } from '../game/progress';
import { $, closeOnBackdrop, openTab, showFallbackLink } from './dom';

/** 結果カードの「クラスに送る」で送る記録 */
export interface LastResult {
  stage: string;
  height: number;
  stars: number;
  cost: number;
  result: string;
}

/** この画面が main.ts から借りるもの */
export interface ClassHost {
  isChallenge(): boolean;
  closeMenu(): void;
  lastResult(): LastResult | null;
  setHint(text: string): void;
}

export interface ClassPanel {
  /** この端末に保存した先生の設定（なければ null） */
  classForm(): FormTemplate | null;
  refreshClassStatus(): void;
  refreshRankingButtons(): void;
  openRanking(big?: boolean): void;
  openSend(): void;
  loadClassLinkFromUrl(): void;
}

export function setupClassPanel(host: ClassHost): ClassPanel {
  const classDialog = $<HTMLDivElement>('class-dialog');
  const sendDialog = $<HTMLDivElement>('send-dialog');
  const classMsg = $<HTMLParagraphElement>('class-msg');
  const sendName = $<HTMLInputElement>('send-name');
  const sendGroup = $<HTMLInputElement>('send-group');

  const classForm = (): FormTemplate | null => validateTemplate(loadClassForm());

  function refreshClassStatus(): void {
    const t = classForm();
    $('class-status').textContent = t
      ? `クラスランキング：設定ずみ（結果カードの「クラスに送る」で記録を送れます${t.ranking ? '。ランキングもアプリで見られます' : ''}）`
      : '';
    refreshRankingButtons();
  }

  /** ランキングを見るボタンは、先生がランキングの公開まで設定したときだけ出す */
  function refreshRankingButtons(): void {
    const has = !!classForm()?.ranking;
    $('menu-ranking').hidden = !has;
    $('open-ranking').hidden = !has || !host.isChallenge();
  }

  // ---------- アプリ内のクラスランキング ----------

  const rankingDialog = $<HTMLDivElement>('ranking-dialog');
  const rankingMsg = $<HTMLParagraphElement>('ranking-msg');
  const rankingTable = $<HTMLTableElement>('ranking-table');
  let rankingLoad: AbortController | null = null;

  async function loadRanking(): Promise<void> {
    const url = classForm()?.ranking;
    if (!url) return;
    rankingLoad?.abort();
    const ctrl = new AbortController();
    rankingLoad = ctrl;
    const timer = setTimeout(() => ctrl.abort(), 15000);
    rankingMsg.className = 'class-msg';
    rankingMsg.textContent = '読みこみ中…';
    try {
      let data;
      try {
        data = await fetchRanking(url, ctrl.signal);
      } catch (e) {
        if (ctrl.signal.aborted || e instanceof RankingSheetError) throw e;
        // クラス全員がいっせいに開くと、先生のウェブアプリが混み合うことがある。少しずらして1回だけ読み直す
        await new Promise((r) => setTimeout(r, 1000 + Math.random() * 2000));
        if (ctrl.signal.aborted) throw e;
        data = await fetchRanking(url, ctrl.signal);
      }
      if (rankingLoad !== ctrl) return;
      const notes = loadNotes();
      const body = $('ranking-body');
      body.replaceChildren(
        ...data.rows.map((r) => {
          const tr = document.createElement('tr');
          if (r.rank <= 3) tr.classList.add('podium');
          if (isMine(r, notes.nickname ?? '', notes.group ?? '')) tr.classList.add('mine');
          for (const v of [`${r.rank}`, r.group, r.name, `${r.height} m`]) {
            const td = document.createElement('td');
            td.textContent = v;
            tr.append(td);
          }
          return tr;
        }),
      );
      rankingTable.hidden = data.rows.length === 0;
      rankingMsg.textContent = data.rows.length === 0 ? 'まだ記録がありません。結果カードの「クラスに送る」で送ってみよう。' : '';
      const more = data.total > data.rows.length ? `（上位 ${data.rows.length} 人を表示、全部で ${data.total} 人）` : `（${data.total} 人）`;
      $('ranking-updated').textContent = `${data.updated ? `${data.updated.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} 現在` : ''}${more}`;
    } catch (e) {
      if (rankingLoad !== ctrl) return;
      rankingMsg.className = 'class-msg ng';
      rankingMsg.textContent =
        e instanceof RankingSheetError
          ? 'ランキングを読みこめませんでした。先生に知らせてください。（先生へ：ランキングのスプレッドシートが見つからないか、開けません。スクリプトの createRankingForm を実行したアカウントでデプロイしているか確かめてください）'
          : 'ランキングを読みこめませんでした。インターネットにつながっているか確かめて、「更新する」を押してください。直らないときは先生に知らせてください。（先生へ：ウェブアプリの「アクセスできるユーザー」が「全員」になっているか確かめてください）';
    } finally {
      clearTimeout(timer);
    }
  }

  // 大きく映すとき（教室の画面用）は、30秒ごとに自動で読み直す。ウェブアプリも30秒ごとにしか読み直さない
  const bigButton = $<HTMLButtonElement>('ranking-big');
  let autoReload: ReturnType<typeof setInterval> | null = null;
  function setBig(big: boolean): void {
    rankingDialog.classList.toggle('big', big);
    bigButton.textContent = big ? '小さくもどす' : '大きく映す';
    if (autoReload) clearInterval(autoReload);
    autoReload = big ? setInterval(() => void loadRanking(), 30000) : null;
  }

  function openRanking(big = false): void {
    if (!classForm()?.ranking) return;
    host.closeMenu();
    setBig(big);
    rankingDialog.hidden = false;
    void loadRanking();
  }

  function closeRanking(): void {
    rankingLoad?.abort();
    rankingLoad = null;
    setBig(false);
    rankingDialog.hidden = true;
  }

  bigButton.addEventListener('click', () => setBig(!rankingDialog.classList.contains('big')));
  $('ranking-reload').addEventListener('click', () => void loadRanking());
  $('ranking-close').addEventListener('click', closeRanking);
  $('open-ranking').addEventListener('click', () => openRanking());
  $('menu-ranking').addEventListener('click', () => openRanking());

  // ---------- 先生用：クラスランキングの準備（①〜⑤の手順） ----------

  /** 手順の進み具合を画面に出す */
  function refreshSetup(): void {
    const t = classForm();
    const state = $('class-state');
    state.className = `class-state ${t ? 'ok' : ''}`;
    state.textContent = !t
      ? 'この端末では、まだ準備していません。'
      : t.ranking
        ? '✓ 準備できています：記録を集めて、アプリの中でランキングを見られます。'
        : '✓ 記録は集められます（アプリの中のランキングはなし。②③をすると見られます）。';
    $('setup-1').classList.toggle('done', !!t);
    $('setup-2').classList.toggle('done', !!t?.ranking);
    $('setup-3').classList.toggle('done', !!t);
    $('setup-4').classList.toggle('locked', !t);
    $('setup-5').classList.toggle('locked', !t?.ranking);
    $('class-link-box').hidden = !t;
    $<HTMLTextAreaElement>('class-link').value = t ? classLinkFor(location.href, t) : '';
    $('class-link-note').textContent = t?.ranking ? 'ランキングも見られます。' : '';
    $('class-show-box').hidden = !t?.ranking;
    $('class-show-note').textContent = t?.ranking
      ? '教室の大きな画面に映すと、30秒ごとに自動で新しくなります。生徒は、メニューやチャレンジの画面の「ランキング」ボタンで見られます。'
      : t
        ? '②③をすると、アプリの中で見られます。「全員」が選べないときは、スプレッドシートの「ランキング」シートを映してください。'
        : '③まで終わると使えます。';
  }

  function setClassMsg(text: string, kind: '' | 'ok' | 'ng' = ''): void {
    classMsg.textContent = text;
    classMsg.className = `class-msg ${kind}`;
  }

  function saveSetup(t: FormTemplate): void {
    saveClassForm(t);
    refreshSetup();
    refreshClassStatus();
  }

  /** 貼ったウェブアプリにつないで確かめる。古い答えが後から届いても無視する */
  let connecting = 0;
  async function connectRanking(url: string): Promise<void> {
    const my = ++connecting;
    setClassMsg('ウェブアプリにつないでいます…');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const data = await fetchRanking(url, ctrl.signal);
      if (my !== connecting) return;
      const fromApp = data.form ? parseFormTemplate(data.form) : null;
      const base = fromApp?.ok ? fromApp.template : classForm();
      if (!base) {
        setClassMsg(
          'つながりましたが、スクリプトが前の版のようです。①でスクリプトをコピーし直して貼りかえ、「デプロイ」→「デプロイを管理」→ 鉛筆のマーク →「バージョン」を「新バージョン」にして「デプロイ」してから、もう一度貼ってください。',
          'ng',
        );
        return;
      }
      saveSetup({ ...base, ranking: url });
      setClassMsg(`つながりました（今の記録 ${data.total} 人）。④のクラスリンクを配ってください。`, 'ok');
    } catch (e) {
      if (my !== connecting) return;
      setClassMsg(
        e instanceof RankingSheetError
          ? 'ウェブアプリには届きましたが、記録のスプレッドシートが見つかりません。①の「実行」を先にしてから、もう一度貼ってください。'
          : 'ウェブアプリから答えがありません。②で「アクセスできるユーザー」を「全員」にしたか確かめてください。学校のアカウントで「全員」が選べないときは、下の「「全員」が選べないとき」を見てください。',
        'ng',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  const pasteInput = $<HTMLInputElement>('class-paste');
  pasteInput.addEventListener('input', () => {
    const v = pasteInput.value.trim();
    connecting++;
    if (!v) {
      setClassMsg('');
      return;
    }
    const r = parseTeacherInput(v);
    if (r.kind === 'error') {
      setClassMsg(r.reason, 'ng');
      return;
    }
    if (r.kind === 'ranking') {
      void connectRanking(r.url);
      return;
    }
    // 同じフォームの事前入力リンクを貼り直したときは、つないだランキングはそのまま
    const prev = classForm();
    const keep = !r.template.ranking && prev?.ranking && prev.url === r.template.url ? { ranking: prev.ranking } : {};
    saveSetup({ ...r.template, ...keep });
    const extra = r.unused.length > 0 ? `（${r.unused.length}つの質問はなしで送ります）` : '';
    setClassMsg(`読み取れました${extra}。④のクラスリンクを配ってください。`, 'ok');
  });

  function openClassDialog(): void {
    pasteInput.value = '';
    connecting++;
    setClassMsg('');
    refreshSetup();
    host.closeMenu();
    classDialog.hidden = false;
  }

  $('class-script-open').addEventListener('click', () => {
    const url = 'https://script.google.com/home/projects/create';
    if (!openTab(url)) {
      classMsg.className = 'class-msg ng';
      showFallbackLink(classMsg, url, 'Apps Script を開く');
    }
  });
  $('class-show').addEventListener('click', () => {
    classDialog.hidden = true;
    openRanking(true);
  });

  const classCopy = $<HTMLButtonElement>('class-copy');
  classCopy.addEventListener('click', async () => {
    const box = $<HTMLTextAreaElement>('class-link');
    try {
      await navigator.clipboard.writeText(box.value);
      classCopy.textContent = 'コピーしました';
    } catch {
      box.select();
      classCopy.textContent = '選んだ所をコピーしてください';
    }
    setTimeout(() => (classCopy.textContent = 'リンクをコピー'), 2000);
  });
  const scriptCopy = $<HTMLButtonElement>('class-script-copy');
  scriptCopy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(RANKING_FORM_SCRIPT);
      scriptCopy.textContent = 'コピーしました';
    } catch {
      // 古い方法でコピーする
      const tmp = document.createElement('textarea');
      tmp.value = RANKING_FORM_SCRIPT;
      document.body.append(tmp);
      tmp.select();
      const ok = document.execCommand('copy');
      tmp.remove();
      scriptCopy.textContent = ok ? 'コピーしました' : 'コピーできませんでした';
    }
    setTimeout(() => (scriptCopy.textContent = '1. スクリプトをコピー'), 3000);
  });
  $('class-test').addEventListener('click', () => {
    const t = classForm();
    if (!t) return;
    const url = buildSubmitUrl(t, { name: 'テスト', group: '先生', stage: 'チャレンジ 最高タワーチャレンジ', height: '0', stars: '0', cost: '0', result: 'ためし' });
    if (!openTab(url)) {
      classMsg.className = 'class-msg ng';
      showFallbackLink(classMsg, url);
    }
  });
  $('class-forget').addEventListener('click', () => {
    if (!confirm('この端末のクラスランキングの準備を消しますか？（フォームやスプレッドシートは消えません）')) return;
    clearClassForm();
    openClassDialog();
    refreshClassStatus();
  });
  $('class-close').addEventListener('click', () => (classDialog.hidden = true));
  $('open-class').addEventListener('click', openClassDialog);

  function openSend(): void {
    const lastResult = host.lastResult();
    if (!lastResult) return;
    const notes = loadNotes();
    sendName.value = notes.nickname ?? '';
    sendGroup.value = notes.group ?? '';
    $('send-summary').textContent = `${lastResult.stage}　高さ ${lastResult.height} m・星 ${lastResult.stars}・費用 ${lastResult.cost} 万円（${lastResult.result}）${lastResult.height === 0 ? '　※クリアしないと高さの記録は 0 m です' : ''}`;
    $('send-fallback').hidden = true;
    sendDialog.hidden = false;
    sendName.focus();
  }

  $('send-cancel').addEventListener('click', () => (sendDialog.hidden = true));
  $('send-go').addEventListener('click', () => {
    const t = classForm();
    const lastResult = host.lastResult();
    const name = sendName.value.trim();
    const group = sendGroup.value.trim();
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
    if (!openTab(url)) {
      // ダイアログは閉じずに、リンクを押してもらう
      showFallbackLink($('send-fallback'), url);
      return;
    }
    sendDialog.hidden = true;
    host.setHint('開いたフォームで「送信」を押してください。');
  });
  closeOnBackdrop(classDialog);
  closeOnBackdrop(sendDialog);


  /** クラスリンクから開いたときは、先生のフォームの設定を読みこむ */
  function loadClassLinkFromUrl(): void {
    const t = readClassLink(location.hash);
    if (!t) return;
    saveClassForm(t);
    history.replaceState(null, '', location.pathname + location.search);
  }
  // アプリを開いたままクラスリンクを開き直したとき（# のあとだけ変わり、ページは読み直されない）も設定を読む
  window.addEventListener('hashchange', () => {
    loadClassLinkFromUrl();
    refreshClassStatus();
  });

  return { classForm, refreshClassStatus, refreshRankingButtons, openRanking, openSend, loadClassLinkFromUrl };
}

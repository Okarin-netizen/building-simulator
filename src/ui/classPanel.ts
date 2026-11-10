// クラスランキングの画面：先生の設定（フォームのリンク・ランキングの URL）、生徒の「クラスに送る」、アプリ内のランキング表示。

import RANKING_FORM_SCRIPT from '../teacher/rankingForm.gs?raw';
import { fetchRanking, isMine, RankingSheetError } from '../game/classRanking';
import { buildSubmitUrl, classLinkFor, parseFormTemplate, parseRankingUrl, readClassLink, validateTemplate, type FormTemplate } from '../game/classForm';
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
  openRanking(): void;
  openSend(): void;
  loadClassLinkFromUrl(): void;
}

export function setupClassPanel(host: ClassHost): ClassPanel {
  const classDialog = $<HTMLDivElement>('class-dialog');
  const sendDialog = $<HTMLDivElement>('send-dialog');
  const classInput = $<HTMLTextAreaElement>('class-input');
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

  function openRanking(): void {
    if (!classForm()?.ranking) return;
    host.closeMenu();
    rankingDialog.hidden = false;
    void loadRanking();
  }

  $('ranking-reload').addEventListener('click', () => void loadRanking());
  $('ranking-close').addEventListener('click', () => {
    rankingLoad?.abort();
    rankingLoad = null;
    rankingDialog.hidden = true;
  });
  $('open-ranking').addEventListener('click', openRanking);
  $('menu-ranking').addEventListener('click', openRanking);

  function showClassLink(t: FormTemplate | null): void {
    $('class-link-box').hidden = !t;
    if (!t) return;
    $<HTMLTextAreaElement>('class-link').value = classLinkFor(location.href, t);
    const msg = $('class-ranking-msg');
    if (t.ranking) {
      rankingInput.value = t.ranking;
      msg.textContent = 'ランキングの読み先が入っています。このクラスリンクを配ると、生徒もアプリの中でランキングを見られます。';
      msg.className = 'class-msg ok';
    } else {
      rankingInput.value = '';
      msg.textContent = '';
      msg.className = 'class-msg';
    }
  }

  const rankingInput = $<HTMLInputElement>('class-ranking');
  rankingInput.addEventListener('input', () => {
    const t = classForm();
    const msg = $('class-ranking-msg');
    if (!t) return;
    const v = rankingInput.value.trim();
    if (!v) {
      if (t.ranking) {
        const { ranking: _drop, ...rest } = t;
        void _drop;
        saveClassForm(rest);
        showClassLink(rest);
        refreshClassStatus();
      }
      return;
    }
    const url = parseRankingUrl(v);
    if (!url) {
      msg.textContent = 'ウェブアプリの URL ではありません。Apps Script の「デプロイ」→「デプロイを管理」で出る、https://script.google.com/ で始まり /exec で終わる URL を貼ってください。';
      msg.className = 'class-msg ng';
      return;
    }
    const next = { ...t, ranking: url };
    saveClassForm(next);
    showClassLink(next);
    refreshClassStatus();
  });

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
    host.closeMenu();
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
    setTimeout(() => (scriptCopy.textContent = 'フォームを作るスクリプトをコピー'), 3000);
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
    if (!confirm('この端末のクラスランキングの設定を消しますか？')) return;
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

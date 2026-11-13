// ふりかえりシート（最高タワーチャレンジのときだけ）：問いに答え、名前・答え・ビルの画面を1枚の画像にして保存・共有する。

import { loadAttempts, loadNotes, loadProgress, saveNotes } from '../game/progress';
import { ANSWER_MAX, canvasToBlob, cardFileName, drawReflectionCard, loadCardFonts } from '../game/reflectionCard';
import { $, askConfirm, closeOnBackdrop } from './dom';

/** シートが画面（main.ts）から借りるもの */
export interface SheetHost {
  /** いまシートを開いてよいか（試験中でなく、チャレンジのステージ） */
  canOpen(): boolean;
  /** 写す前に、選んだ部材の光などを消す */
  beforeShot(): void;
  /** 画像に写す範囲（キャンバスの画素） */
  shotRect(): { x: number; y: number; w: number; h: number };
  canvas: HTMLCanvasElement;
  stageTitle(): string;
}

export interface ReflectionSheet {
  open(): void;
  hide(): void;
}

export function setupReflectionSheet(host: SheetHost): ReflectionSheet {
  const sheet = $<HTMLDivElement>('sheet');

  const QUESTIONS = [
    { id: 'q1', text: '予想と結果をくらべて、気づいたことは？' },
    { id: 'q2', text: '三角形（筋交い）を入れると強くなるのは、なぜだと思う？' },
    { id: 'q3', text: '材料はどうやって選んだ？（強さ・重さ・費用のどれを大事にした？）' },
    { id: 'q4', text: '班のみんなの作品で、よいと思った工夫は？' },
  ];

  /** シートを開いたときのビルの画面（画像に入れるもの） */
  const shotCanvas = document.createElement('canvas');
  const sheetMsg = $<HTMLParagraphElement>('sheet-msg');

  function challengeRecord(): string {
    const best = loadProgress().challenge?.bestHeight;
    const tries = loadAttempts().filter((a) => a.stageId === 'challenge').length;
    return `${best ? `最高記録 ${best} m` : 'まだ記録なし'}（試験 ${tries} 回）`;
  }

  function openSheet(): void {
    if (!host.canOpen()) return;
    host.beforeShot();
    // 選んだ部材の光などを消してから写すため、1こま描き直すのを待つ
    requestAnimationFrame(() => {
      const r = host.shotRect();
      shotCanvas.width = r.w;
      shotCanvas.height = r.h;
      shotCanvas.getContext('2d')!.drawImage(host.canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      $<HTMLImageElement>('sheet-shot').src = shotCanvas.toDataURL('image/png');
    });
    const notes = loadNotes();
    $('sheet-record').textContent = `${host.stageTitle()}　${challengeRecord()}`;
    const qs = $('sheet-questions');
    qs.innerHTML = QUESTIONS.map(
      (q, i) => `<label class="question">${i + 1}. ${q.text}<textarea rows="3" maxlength="${ANSWER_MAX}" data-note="${q.id}"></textarea></label>`,
    ).join('');
    sheet.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-note]').forEach((el) => {
      el.value = notes[el.dataset.note!] ?? '';
    });
    sheetMsg.hidden = true;
    $('sheet-share').hidden = !canShareFiles();
    sheet.hidden = false;
    fitAllTextareas();
  }

  /** 書いた分だけ欄を広げる */
  function fitTextarea(el: HTMLTextAreaElement): void {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }
  const fitAllTextareas = () => sheet.querySelectorAll('textarea').forEach(fitTextarea);

  sheet.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement | HTMLTextAreaElement;
    if (!el.dataset.note) return;
    sheetMsg.hidden = true;
    if (el instanceof HTMLTextAreaElement) fitTextarea(el);
    const notes = loadNotes();
    notes[el.dataset.note] = el.value;
    saveNotes(notes);
  });

  function canShareFiles(): boolean {
    try {
      const probe = new File([''], 'a.png', { type: 'image/png' });
      return typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [probe] });
    } catch {
      return false;
    }
  }

  function showSheetMsg(text: string, ok = false): void {
    sheetMsg.textContent = text;
    sheetMsg.className = `class-msg ${ok ? 'ok' : 'ng'}`;
    sheetMsg.hidden = false;
  }

  /** 名前・答え・ビルの画面を1枚の PNG にする。名前がなければ作らない */
  async function makeReflectionFile(): Promise<File | null> {
    const notes = loadNotes();
    const name = (notes.name ?? '').trim();
    if (!name) {
      showSheetMsg('名前を書いてから保存しよう。');
      $<HTMLInputElement>('note-name').focus();
      return null;
    }
    // 前の版で書いた長い答えも、画像にできる長さまでにする
    const questions = QUESTIONS.map((q) => ({ text: q.text, answer: String(notes[q.id] ?? '').slice(0, ANSWER_MAX) }));
    const empty = questions.filter((q) => !q.answer.trim()).length;
    if (empty > 0 && !(await askConfirm(`まだ書いていない問いが ${empty} つあります。このまま保存しますか？`, '保存する'))) return null;
    const now = new Date();
    await loadCardFonts(name + (notes.group ?? '') + questions.map((q) => q.text + q.answer).join(''));
    const card = drawReflectionCard({
      name,
      group: (notes.group ?? '').trim(),
      stageTitle: host.stageTitle(),
      record: challengeRecord(),
      date: `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`,
      questions,
      shot: shotCanvas,
    });
    const blob = await canvasToBlob(card);
    return new File([blob], cardFileName(now), { type: 'image/png' });
  }

  /** 画像づくりの間はボタンを押せなくし、うまくいかなかったときは理由を見せる */
  async function withReflectionFile(btn: HTMLButtonElement, use: (file: File) => Promise<void> | void): Promise<void> {
    if (btn.disabled) return;
    btn.disabled = true;
    try {
      const file = await makeReflectionFile();
      if (file) await use(file);
    } catch {
      showSheetMsg('画像を作れませんでした。答えを短くするか、ページを開き直してもう一度ためしてください。');
    } finally {
      btn.disabled = false;
    }
  }

  const sheetSave = $<HTMLButtonElement>('sheet-save');
  sheetSave.addEventListener('click', () =>
    withReflectionFile(sheetSave, (file) => {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      showSheetMsg(`「${file.name}」を保存しました（「ダウンロード」フォルダ）。この画像を提出しよう。`, true);
    }),
  );
  const sheetShare = $<HTMLButtonElement>('sheet-share');
  sheetShare.addEventListener('click', () =>
    withReflectionFile(sheetShare, async (file) => {
      try {
        await navigator.share({ files: [file], title: '最高タワー工房 ふりかえり' });
      } catch (e) {
        // 共有の画面を閉じただけのときは何もしない
        if ((e as Error)?.name !== 'AbortError') showSheetMsg('共有できませんでした。「画像で保存する」で保存して提出しよう。');
      }
    }),
  );
  $('open-sheet').addEventListener('click', openSheet);
  $('sheet-close').addEventListener('click', () => (sheet.hidden = true));
  $('sheet-clear').addEventListener('click', async () => {
    if (!(await askConfirm('ふりかえりに書いたことを全部消しますか？（名前は残ります）', '消す'))) return;
    // 名前・組班と、クラスに送るときのニックネームは残す
    const { nickname, name, group } = loadNotes();
    const keep: Record<string, string> = {};
    if (nickname) keep.nickname = nickname;
    if (name) keep.name = name;
    if (group) keep.group = group;
    saveNotes(keep);
    openSheet();
  });
  closeOnBackdrop(sheet);

  return { open: openSheet, hide: () => (sheet.hidden = true) };
}

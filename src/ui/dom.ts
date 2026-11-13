// 画面の部品で、いろいろな所から使う小さな道具

export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** 画面をおおう窓（ダイアログ）の外側をタップしたら閉じる */
export function closeOnBackdrop(dialog: HTMLElement): void {
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.hidden = true;
  });
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

/**
 * 新しいタブでフォームを開く。ポップアップがブロックされて開けなかったら false。
 * （'noopener' をつけると開けたかどうか分からないので、開いてから opener を切る）
 */
export function openTab(url: string): boolean {
  const w = window.open(url, '_blank');
  if (!w) return false;
  w.opener = null;
  return true;
}

/** 開けなかったときに、押せばフォームが開くリンクを見せる */
export function showFallbackLink(box: HTMLElement, url: string, label = 'フォームを開く'): void {
  box.replaceChildren('新しいタブを開けませんでした。ここを押して開いてください：');
  const a = el('a', label);
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  box.append(a);
  box.hidden = false;
}

/**
 * アプリの中に出す確認の窓。押したほうで true / false を返す。
 * ブラウザの confirm() は Chromebook の全画面モードで上が切れて読めないので、こちらを使う。
 */
export function askConfirm(message: string, okLabel = 'はい'): Promise<boolean> {
  return new Promise((resolve) => {
    const back = el('div', undefined, 'menu confirm-dialog');
    back.setAttribute('role', 'dialog');
    back.setAttribute('aria-modal', 'true');
    const card = el('div', undefined, 'menu-card confirm-card');
    const text = el('p', message, 'confirm-text');
    const actions = el('div', undefined, 'buttons sheet-actions');
    const cancel = el('button', 'やめる');
    const ok = el('button', okLabel, 'primary');
    cancel.type = ok.type = 'button';
    actions.append(cancel, ok);
    card.append(text, actions);
    back.append(card);

    const done = (answer: boolean) => {
      window.removeEventListener('keydown', onKey, true);
      back.remove();
      resolve(answer);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        done(false);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.stopPropagation(); // 後ろの画面で部材が消えないように
      }
    };
    cancel.addEventListener('click', () => done(false));
    ok.addEventListener('click', () => done(true));
    back.addEventListener('click', (e) => {
      if (e.target === back) done(false);
    });
    window.addEventListener('keydown', onKey, true);
    document.body.append(back);
    ok.focus();
  });
}

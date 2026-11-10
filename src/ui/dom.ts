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
export function showFallbackLink(box: HTMLElement, url: string): void {
  box.replaceChildren('新しいタブを開けませんでした。ここを押してフォームを開いてください：');
  const a = el('a', 'フォームを開く');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  box.append(a);
  box.hidden = false;
}

// 結果カードの部品：見出し・ひとことの結果・星3つの紙ふぶき・カードを置く場所

import type { Evaluation } from '../game/evaluate';
import { el } from './dom';

/** 結果カードの見出し。mode は、チャレンジ・ふつうのステージ・自由に作る のどれか */
export function resultTitle(ev: Evaluation, mode: 'challenge' | 'stage' | 'free', goalHeight: number): string {
  if (ev.cleared) return mode === 'challenge' ? `記録 ${ev.height} m！` : mode === 'stage' ? 'クリア！' : '耐えた！';
  if (ev.fell === 'collapsed') return '倒れてしまった…';
  if (ev.fell === 'partly') return '一部がくずれた…';
  return `高さが足りません（目標 ${goalHeight} m）`;
}

/** クラスに送るときの、ひとことの結果 */
export function resultWord(ev: Evaluation): string {
  if (ev.cleared) return 'クリア';
  if (ev.fell === 'collapsed') return '倒れた';
  if (ev.fell === 'partly') return '一部がくずれた';
  return '高さが足りない';
}

/** 星3つのときの紙ふぶき（工事現場の黄色と黒）。すぐ消える */
export function confetti(): HTMLElement {
  const box = el('div', undefined, 'confetti');
  box.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 18; i++) {
    const piece = el('span');
    piece.style.left = `${5 + ((i * 53) % 90)}%`;
    piece.style.animationDelay = `${0.6 + (i % 6) * 0.06}s`;
    piece.style.background = i % 3 === 0 ? '#1f1f1f' : '#f6c343';
    piece.style.setProperty('--turn', `${(i % 2 ? 1 : -1) * (180 + i * 20)}deg`);
    box.append(piece);
  }
  setTimeout(() => box.remove(), 2600);
  return box;
}

const MIN_RESULT_WIDTH = 300;

/**
 * 結果カードを、建物に重ならない側（右か左）に置く。どちらにも入らなければ、すき間の広い側。
 * buildingXs は建物のつなぎ目の画面上の x 座標
 */
export function placeResultBox(box: HTMLElement, buildingXs: number[], screenWidth: number): void {
  box.classList.remove('left');
  box.style.width = '';
  if (buildingXs.length === 0) return;
  const gap = 24;
  const need = box.offsetWidth + gap * 2;
  const roomRight = screenWidth - Math.max(...buildingXs);
  const roomLeft = Math.min(...buildingXs);
  const left = roomRight < need && (roomLeft >= need || roomLeft > roomRight);
  box.classList.toggle('left', left);
  // どちらにも入らないときは、すき間の広い側に合わせてカードを細くする（細くしすぎない）
  const room = (left ? roomLeft : roomRight) - gap * 2;
  if (room < box.offsetWidth) box.style.width = `${Math.max(MIN_RESULT_WIDTH, room)}px`;
}

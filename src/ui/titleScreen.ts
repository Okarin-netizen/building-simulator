// タイトル画面。開いたらまず出して、大きなボタン1つ（または Enter・スペース）で遊びはじめる。
// 後ろではもう、はじめて＝1-1、2回目から＝前に開いたステージ が開いている。

import type { Progress } from '../game/progress';
import { stageFullTitle, STAGES, type Stage } from '../game/stages';
import { CHANGELOG, AUTHOR } from '../game/about';
import { $ } from './dom';

export interface TitleSummary {
  /** いちばん大きなボタンの文字 */
  primary: string;
  /** ボタンの下に出す、どこから始まるか */
  where: string;
  /** 集めた星（チャレンジはのぞく） */
  stars: number;
  maxStars: number;
}

/** タイトル画面に出す文字を決める。stage が null なら自由に作るモード */
export function titleSummary(progress: Progress, first: boolean, stage: Stage | null): TitleSummary {
  const starStages = STAGES.filter((s) => s.chapter !== 'challenge');
  const stars = starStages.reduce((n, s) => n + Math.min(3, Math.max(0, progress[s.id]?.stars ?? 0)), 0);
  return {
    primary: first ? 'はじめる' : 'つづきから',
    where: stage ? stageFullTitle(stage) : '自由に作る（実験モード）',
    stars,
    maxStars: starStages.length * 3,
  };
}

export function setupTitleScreen(opts: {
  onStart: () => void;
  onStageSelect: () => void;
  onHowto: () => void;
}): { show: (s: TitleSummary) => void; isOpen: () => boolean } {
  const box = $<HTMLDivElement>('title-screen');
  const hide = () => {
    box.hidden = true;
  };
  $('title-version').textContent = `ver.${CHANGELOG[0].version}　作者：${AUTHOR}`;
  $('title-start').addEventListener('click', () => {
    hide();
    opts.onStart();
  });
  $('title-stages').addEventListener('click', () => {
    hide();
    opts.onStageSelect();
  });
  $('title-howto').addEventListener('click', () => {
    hide();
    opts.onHowto();
  });
  // Enter・スペースで「はじめる／つづきから」（ほかのボタンにいるときは、そのボタン）
  window.addEventListener('keydown', (e) => {
    if (box.hidden || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if ((e.target as HTMLElement | null)?.closest('button, a, input, textarea, select')) return;
    e.preventDefault();
    if (!e.repeat) $<HTMLButtonElement>('title-start').click();
  });
  return {
    show(s) {
      $('title-start').textContent = s.primary;
      $('title-where').textContent = s.where;
      $('title-stars').innerHTML = `集めた星 <b>★ ${s.stars}</b> / ${s.maxStars}`;
      box.hidden = false;
    },
    isOpen: () => !box.hidden,
  };
}

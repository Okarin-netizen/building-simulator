// 進み具合（各ステージの星・記録）と、作りかけの設計図の保存。
// 端末のブラウザ内にだけ保存する。使えない環境でもエラーにしない。

import type { Design } from '../physics/design';

const PROGRESS_KEY = 'saikou-tower-progress-v1';
const DESIGN_KEY = (id: string) => `saikou-tower-design-${id}-v1`;

export interface StageRecord {
  stars: number;
  /** 最高タワーの記録（m） */
  bestHeight?: number;
}

export type Progress = Record<string, StageRecord>;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 保存できなくても遊べるようにする
  }
}

export function loadProgress(): Progress {
  return read<Progress>(PROGRESS_KEY) ?? {};
}

/** よりよい結果のときだけ記録を更新する */
export function recordResult(stageId: string, stars: number, height?: number): Progress {
  const progress = loadProgress();
  const cur = progress[stageId] ?? { stars: 0 };
  const next: StageRecord = { stars: Math.max(cur.stars, stars) };
  const best = stars > 0 && height !== undefined ? Math.max(cur.bestHeight ?? 0, height) : cur.bestHeight;
  if (best !== undefined) next.bestHeight = best;
  progress[stageId] = next;
  write(PROGRESS_KEY, progress);
  return progress;
}

export function loadDesign(id: string): Design | null {
  const d = read<Design>(DESIGN_KEY(id));
  return d && Array.isArray(d.nodes) && Array.isArray(d.members) ? d : null;
}

export function saveDesign(id: string, design: Design): void {
  write(DESIGN_KEY(id), design);
}

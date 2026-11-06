// 進み具合（各ステージの星・記録）と、作りかけの設計図の保存。
// 端末のブラウザ内にだけ保存する。使えない環境でもエラーにしない。

import type { Design } from '../physics/design';
import { MATERIALS } from '../physics/materials';

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
  const p = read<Progress>(PROGRESS_KEY);
  if (!p || typeof p !== 'object' || Array.isArray(p)) return {};
  for (const k of Object.keys(p)) if (!p[k] || typeof p[k] !== 'object') delete p[k];
  return p;
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

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** 保存した設計図が正しい形か確かめる。壊れたデータで画面が開かなくならないようにする */
export function isValidDesign(d: unknown): d is Design {
  if (!d || typeof d !== 'object') return false;
  const { nodes, members, loads } = d as Partial<Design>;
  if (!Array.isArray(nodes) || !Array.isArray(members)) return false;
  if (!nodes.every((n) => n && isNum(n.x) && isNum(n.y))) return false;
  const okIndex = (i: unknown) => Number.isInteger(i) && (i as number) >= 0 && (i as number) < nodes.length;
  if (!members.every((m) => m && okIndex(m.a) && okIndex(m.b) && m.a !== m.b && typeof m.material === 'string' && Object.prototype.hasOwnProperty.call(MATERIALS, m.material))) return false;
  if (loads !== undefined && !(Array.isArray(loads) && loads.every((l) => l && isNum(l.y) && isNum(l.mass)))) return false;
  return true;
}

export function loadDesign(id: string): Design | null {
  const d = read<unknown>(DESIGN_KEY(id));
  return isValidDesign(d) ? d : null;
}

export function saveDesign(id: string, design: Design): void {
  write(DESIGN_KEY(id), design);
}

// ---------- 試験の記録（ふりかえりシート用） ----------

const ATTEMPTS_KEY = 'saikou-tower-attempts-v1';
const NOTES_KEY = 'saikou-tower-notes-v1';
const MAX_ATTEMPTS = 60;

export interface Attempt {
  /** 試験した時刻（ISO 形式） */
  at: string;
  stageId: string;
  stageTitle: string;
  cleared: boolean;
  stars: number;
  height: number;
  cost: number;
  predicted: string;
  actual: string;
  verdict: 'hit' | 'near' | 'miss';
}

export function loadAttempts(): Attempt[] {
  const list = read<Attempt[]>(ATTEMPTS_KEY);
  return Array.isArray(list) ? list.filter((a) => a && typeof a === 'object' && typeof a.at === 'string') : [];
}

export function logAttempt(a: Attempt): Attempt[] {
  const list = [...loadAttempts(), a].slice(-MAX_ATTEMPTS);
  write(ATTEMPTS_KEY, list);
  return list;
}

export function clearAttempts(): void {
  write(ATTEMPTS_KEY, []);
}

/** ふりかえりシートの書きこみ（名前・答え） */
export type Notes = Record<string, string>;

export function loadNotes(): Notes {
  const n = read<Notes>(NOTES_KEY);
  return n && typeof n === 'object' && !Array.isArray(n) ? n : {};
}

export function saveNotes(notes: Notes): void {
  write(NOTES_KEY, notes);
}

// ---------- クラスランキングの設定（先生の Google フォーム） ----------

const CLASS_KEY = 'saikou-tower-class-form-v1';

export function loadClassForm(): unknown {
  return read<unknown>(CLASS_KEY);
}

export function saveClassForm(t: unknown): void {
  write(CLASS_KEY, t);
}

export function clearClassForm(): void {
  try {
    localStorage.removeItem(CLASS_KEY);
  } catch {
    // 何もしない
  }
}

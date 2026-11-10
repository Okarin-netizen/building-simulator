// アプリ内のクラスランキング：先生の Apps Script ウェブアプリ（src/teacher/rankingForm.gs の doGet）から読む。
// 受け取るのは順位・組班・ニックネーム・高さだけ。おかしな値は捨てる。

export interface RankingRow {
  rank: number;
  group: string;
  name: string;
  height: number;
}

export interface Ranking {
  rows: RankingRow[];
  total: number;
  updated: Date | null;
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 20) : typeof v === 'number' ? String(v) : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

/** ウェブアプリの答え（JSON）を読む。読めないときは null */
export function parseRanking(raw: unknown): Ranking | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { rows?: unknown; total?: unknown; updated?: unknown };
  if (!Array.isArray(r.rows)) return null;
  const rows: RankingRow[] = [];
  for (const x of r.rows.slice(0, 100)) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const rank = num(o.rank);
    const height = num(o.height);
    const name = text(o.name);
    if (rank === null || height === null || !name) continue;
    rows.push({ rank, group: text(o.group), name, height });
  }
  const updated = typeof r.updated === 'string' ? new Date(r.updated) : null;
  return {
    rows,
    total: num(r.total) ?? rows.length,
    updated: updated && !Number.isNaN(updated.getTime()) ? updated : null,
  };
}

/** 自分の行か（ニックネームと、入れていれば組・班が同じ） */
export const isMine = (row: RankingRow, name: string, group: string) =>
  name.trim() !== '' && row.name === name.trim().slice(0, 20) && (group.trim() === '' || row.group === group.trim().slice(0, 20));

/** ウェブアプリには届いたが、先生のスプレッドシートを読めなかった（doGet が { error } を返した） */
export class RankingSheetError extends Error {}

/** ウェブアプリから読む */
export async function fetchRanking(url: string, signal?: AbortSignal): Promise<Ranking> {
  const res = await fetch(url, { cache: 'no-store', signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw: unknown = await res.json();
  if (raw && typeof raw === 'object' && typeof (raw as { error?: unknown }).error === 'string') throw new RankingSheetError((raw as { error: string }).error);
  const data = parseRanking(raw);
  if (!data) throw new Error('形がちがう');
  return data;
}

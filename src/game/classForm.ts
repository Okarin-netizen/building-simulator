// クラスランキング：先生の Google フォームに、生徒の記録を送る。
// 先生はフォームの「事前入力したURLを取得」で、各質問に決まった言葉（NAME など）を入れたリンクを作る。
// アプリはその言葉を生徒の記録に置きかえて、記入済みのフォームを開く。生徒は送信ボタンを押すだけ。
// サーバーは使わない。記録は先生の Google フォーム（スプレッドシート）にだけ残る。

/** フォームの質問に入れてもらう言葉 */
export const FIELDS = {
  name: { placeholder: 'NAME', label: 'ニックネーム', required: true },
  group: { placeholder: 'GROUP', label: '組・班', required: false },
  stage: { placeholder: 'STAGE', label: 'ステージ', required: true },
  height: { placeholder: 'HEIGHT', label: '高さ（m）', required: true },
  stars: { placeholder: 'STARS', label: '星の数', required: false },
  cost: { placeholder: 'COST', label: '費用（万円）', required: false },
  result: { placeholder: 'RESULT', label: '結果', required: false },
} as const;

export type FieldId = keyof typeof FIELDS;
export type FormValues = Record<FieldId, string>;

const FIELD_IDS = Object.keys(FIELDS) as FieldId[];
/** 見つからなかった、必ず要る項目 */
const missingRequired = (entries: Partial<Record<FieldId, string>>) => FIELD_IDS.filter((f) => FIELDS[f].required && !entries[f]);

export interface FormTemplate {
  /** 事前入力リンクから、置きかえる言葉以外を取り出したもの */
  url: string;
  /** 項目ごとの entry 番号（例：entry.123456） */
  entries: Partial<Record<FieldId, string>>;
}

export type ParseResult = { ok: true; template: FormTemplate; unused: FieldId[] } | { ok: false; reason: string };

const FORM_HOST = 'docs.google.com';
const FORM_PATH = /^\/forms\/(u\/\d+\/)?d\/e\/[\w-]+\/viewform$/;
const ENTRY_KEY = /^entry\.\d+$/;

/** Google フォームの回答ページの URL か */
const isFormUrl = (u: URL) => u.protocol === 'https:' && u.hostname === FORM_HOST && FORM_PATH.test(u.pathname);
/** 送り先の URL（? や # のあとを取りのぞいたもの） */
const formUrl = (u: URL) => `https://${FORM_HOST}${u.pathname}`;

/** 先生が貼った事前入力リンクを読み取る */
export function parseFormTemplate(input: string): ParseResult {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return { ok: false, reason: 'リンクの形がちがいます。フォームの「事前入力したURLを取得」でできたリンクを貼ってください。' };
  }
  if (!isFormUrl(u)) {
    return { ok: false, reason: 'Google フォームのリンクではありません（docs.google.com/forms/… で始まるリンクを貼ってください）。' };
  }
  const entries: Partial<Record<FieldId, string>> = {};
  for (const [key, value] of u.searchParams) {
    if (!ENTRY_KEY.test(key)) continue;
    const id = FIELD_IDS.find((f) => FIELDS[f].placeholder === value.trim().toUpperCase());
    if (id) entries[id] = key;
  }
  const missing = missingRequired(entries);
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `次の質問が見つかりません：${missing.map((f) => `${FIELDS[f].label}（${FIELDS[f].placeholder}）`).join('、')}。事前入力のときに、その質問へ英字の言葉をそのまま入れてください。`,
    };
  }
  const unused = FIELD_IDS.filter((f) => !entries[f]);
  return { ok: true, template: { url: formUrl(u), entries }, unused };
}

/** 生徒の記録を入れた、記入済みフォームのリンク */
export function buildSubmitUrl(t: FormTemplate, values: FormValues): string {
  const u = new URL(t.url);
  u.searchParams.set('usp', 'pp_url');
  for (const [id, entry] of Object.entries(t.entries) as [FieldId, string][]) u.searchParams.set(entry, values[id] ?? '');
  return u.toString();
}

/** 生徒に配る「クラスリンク」。アプリの URL の # のあとに設定を入れる */
export function classLinkFor(appUrl: string, t: FormTemplate): string {
  const base = appUrl.split('#')[0];
  return `${base}#class=${encodeURIComponent(JSON.stringify(t))}`;
}

/** クラスリンクの # の部分から設定を読む。おかしな値は受けつけない */
export function readClassLink(hash: string): FormTemplate | null {
  const m = /(?:^#|&)class=([^&]+)/.exec(hash);
  if (!m) return null;
  try {
    return validateTemplate(JSON.parse(decodeURIComponent(m[1])));
  } catch {
    return null;
  }
}

/** 保存した設定などが正しい形か確かめる */
export function validateTemplate(raw: unknown): FormTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as { url?: unknown; entries?: unknown };
  if (typeof t.url !== 'string' || !t.entries || typeof t.entries !== 'object') return null;
  let u: URL;
  try {
    u = new URL(t.url);
  } catch {
    return null;
  }
  if (!isFormUrl(u)) return null;
  const entries: Partial<Record<FieldId, string>> = {};
  for (const id of FIELD_IDS) {
    const e = (t.entries as Record<string, unknown>)[id];
    if (typeof e === 'string' && ENTRY_KEY.test(e)) entries[id] = e;
  }
  if (missingRequired(entries).length > 0) return null;
  return { url: formUrl(u), entries };
}

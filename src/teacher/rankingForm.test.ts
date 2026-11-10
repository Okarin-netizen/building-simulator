import SOURCE from './rankingForm.gs?raw';
import { FIELDS, readClassLink, type FieldId } from '../game/classForm';

// 先生が Google Apps Script に貼るスクリプト。Node で読みこんで、アプリと話が合うかを確かめる

interface Question {
  id: FieldId;
  title: string;
  placeholder: string;
  required: boolean;
}

function load(globals: Record<string, unknown> = {}) {
  const names = Object.keys(globals);
  const factory = new Function(
    ...names,
    `${SOURCE}\nreturn { createRankingForm, makeClassLink, buildClassLink_, computeRanking_, RANKING_QUESTIONS, APP_URL };`,
  );
  return factory(...names.map((n) => globals[n])) as {
    createRankingForm: () => string;
    buildClassLink_: (prefilled: string, app: string) => string;
    RANKING_QUESTIONS: Question[];
    APP_URL: string;
  };
}

/** どのメソッドを呼んでも自分を返す、Google のサービスのまねもの */
function chain(overrides: Record<string, unknown> = {}): any {
  const target: Record<string, unknown> = { ...overrides };
  return new Proxy(target, {
    get: (t, key) => (key in t ? t[key as string] : () => chain()),
  });
}

describe('先生用：ランキングのフォームを作るスクリプト', () => {
  test('質問と置きかえる言葉が、アプリの classForm.ts とそろっている', () => {
    const { RANKING_QUESTIONS } = load();
    expect(RANKING_QUESTIONS.map((q) => q.id).sort()).toEqual(Object.keys(FIELDS).sort());
    for (const q of RANKING_QUESTIONS) {
      expect(q.placeholder).toBe(FIELDS[q.id].placeholder);
      expect(q.title).toBe(FIELDS[q.id].label);
      expect(q.required).toBe(FIELDS[q.id].required);
    }
  });

  test('事前入力リンクから、アプリが読めるクラスリンクを作る', () => {
    const { buildClassLink_, APP_URL } = load();
    const prefilled =
      'https://docs.google.com/forms/d/e/1FAIpQLSabc_DEF-123/viewform?usp=pp_url&entry.111=NAME&entry.222=GROUP&entry.333=STAGE&entry.444=HEIGHT&entry.555=STARS&entry.666=COST&entry.777=RESULT';
    const link = buildClassLink_(prefilled, APP_URL);
    expect(link.startsWith(`${APP_URL}#class=`)).toBe(true);
    const t = readClassLink(link.slice(link.indexOf('#')));
    expect(t).toEqual({
      url: 'https://docs.google.com/forms/d/e/1FAIpQLSabc_DEF-123/viewform',
      entries: {
        name: 'entry.111',
        group: 'entry.222',
        stage: 'entry.333',
        height: 'entry.444',
        stars: 'entry.555',
        cost: 'entry.666',
        result: 'entry.777',
      },
    });
  });

  test('学校のアカウントの /a/学校/ や /u/0/ が入ったリンクでも、アプリが読める形にする', () => {
    const { buildClassLink_, APP_URL } = load();
    for (const prefix of ['/a/example.ed.jp/forms/', '/forms/u/0/']) {
      const link = buildClassLink_(
        `https://docs.google.com${prefix}d/e/XYZ/viewform?usp=pp_url&entry.1=NAME&entry.2=STAGE&entry.3=HEIGHT`,
        APP_URL,
      );
      expect(readClassLink(link.slice(link.indexOf('#')))?.url).toBe('https://docs.google.com/forms/d/e/XYZ/viewform');
    }
  });

  test('必要な質問が足りないリンクはエラーにする', () => {
    const { buildClassLink_, APP_URL } = load();
    expect(() => buildClassLink_('https://docs.google.com/forms/d/e/X/viewform?entry.1=NAME', APP_URL)).toThrow('STAGE');
    expect(() => buildClassLink_('https://example.com/', APP_URL)).toThrow();
  });

  test('フォーム・回答シート・ランキングシートを作り、クラスリンクを返す（Google のサービスはまねもの）', () => {
    let entry = 100;
    const prefillAnswers: string[] = [];
    const formulas: string[] = [];
    const props: Record<string, string> = {};
    const sheetNames: string[] = [];
    const textItem = () => {
      const id = `entry.${++entry}`;
      const item: any = chain({
        setTitle: () => item,
        setRequired: () => item,
        createResponse: (v: string) => {
          prefillAnswers.push(`${id}=${encodeURIComponent(v)}`);
          return {};
        },
      });
      return item;
    };
    const form = chain({
      getEditUrl: () => 'https://docs.google.com/forms/d/FORM/edit',
      getPublishedUrl: () => 'https://docs.google.com/forms/d/e/FORM_ID/viewform',
      addTextItem: textItem,
      createResponse: () => {
        const r: any = chain({
          withItemResponse: () => r,
          toPrefilledUrl: () => `https://docs.google.com/forms/d/e/FORM_ID/viewform?usp=pp_url&${prefillAnswers.join('&')}`,
        });
        return r;
      },
    });
    const sheet = (name: string, formUrl: string | null) => {
      const range: any = chain({ setFormula: (f: string) => (formulas.push(f), range) });
      return chain({ getName: () => name, getFormUrl: () => formUrl, getSheetId: () => name, getLastRow: () => 0, getRange: () => range });
    };
    const responses = sheet('フォームの回答 1', 'https://docs.google.com/forms/d/FORM/edit');
    const ss = chain({
      getId: () => 'SS',
      getUrl: () => 'https://docs.google.com/spreadsheets/d/SS/edit',
      getSheets: () => [sheet('シート1', null), responses],
      insertSheet: (n: string) => (sheetNames.push(n), sheet(n, null)),
    });
    const { createRankingForm, APP_URL } = load({
      FormApp: { create: () => form, DestinationType: { SPREADSHEET: 'SPREADSHEET' } },
      SpreadsheetApp: { create: () => ss, openById: () => ss, flush: () => {} },
      Logger: { log: () => {} },
      PropertiesService: { getScriptProperties: () => ({ setProperties: (p: Record<string, string>) => Object.assign(props, p) }) },
    });

    const link = createRankingForm();
    expect(props.SHEET_ID).toBe('SS');
    expect(props.PREFILLED_URL).toContain('usp=pp_url');
    expect(sheetNames).toEqual(['ランキング', '先生用メモ']);
    expect(formulas.join('\n')).toContain("'フォームの回答 1'!B2:B");
    expect(formulas.join('\n')).toContain('最高タワー');
    const t = readClassLink(link.slice(APP_URL.length));
    expect(t?.url).toBe('https://docs.google.com/forms/d/e/FORM_ID/viewform');
    expect(Object.keys(t!.entries).sort()).toEqual(Object.keys(FIELDS).sort());
  });
});

describe('先生用スクリプト：アプリ内ランキング', () => {
  const HEAD = ['タイムスタンプ', 'ニックネーム', '組・班', 'ステージ', '高さ（m）', '星の数', '費用（万円）', '結果'];
  const row = (name: string, group: string, stage: string, height: unknown, result = 'クリア') => [new Date(), name, group, stage, height, 3, 200, result];
  const CH = 'チャレンジ 最高タワーチャレンジ';

  test('チャレンジの記録だけを、一人ひとりの最高の高さで並べる（同じ高さは同じ順位）', () => {
    const { computeRanking_ } = load() as any;
    const r = computeRanking_(
      [
        HEAD,
        row('たろう', '1-1', CH, 9),
        row('たろう', '1-1', CH, 12),
        row('はなこ', '1-2', CH, 12),
        row('じろう', '', CH, '6'),
        row('じろう', '', '1-1 ななめの1本', 30),
        row('先生テスト', '先生', CH, 0, 'ためし'),
        row('', '1-1', CH, 99),
        row('さぶろう', '1-3', CH, 0, '倒れた'),
      ],
      50,
    );
    expect(r.total).toBe(4);
    expect(r.rows).toEqual([
      { rank: 1, group: '1-1', name: 'たろう', height: 12 },
      { rank: 1, group: '1-2', name: 'はなこ', height: 12 },
      { rank: 3, group: '', name: 'じろう', height: 6 },
      { rank: 4, group: '1-3', name: 'さぶろう', height: 0 },
    ]);
    // 時刻や費用などは返さない
    expect(Object.keys(r.rows[0]).sort()).toEqual(['group', 'height', 'name', 'rank']);
  });

  test('件数の上限を守り、列の順番が変わっても見出しで探す', () => {
    const { computeRanking_ } = load() as any;
    const head = ['高さ（m）', 'ステージ', 'ニックネーム', 'タイムスタンプ'];
    const rows = Array.from({ length: 5 }, (_, i) => [i, CH, `n${i}`, new Date()]);
    const r = computeRanking_([head, ...rows], 3);
    expect(r.total).toBe(5);
    expect(r.rows.map((x: { name: string }) => x.name)).toEqual(['n4', 'n3', 'n2']);
    expect(computeRanking_([['ちがう見出し']], 3)).toEqual({ rows: [], total: 0 });
  });

  test('makeClassLink：デプロイしたウェブアプリの URL を入れたクラスリンクを作る', () => {
    const props: Record<string, string> = {
      SHEET_ID: 'SS',
      PREFILLED_URL: 'https://docs.google.com/forms/d/e/X/viewform?usp=pp_url&entry.1=NAME&entry.2=STAGE&entry.3=HEIGHT',
    };
    const make = (serviceUrl: string | null) =>
      (load({
        PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null }) },
        ScriptApp: { getService: () => ({ getUrl: () => serviceUrl }) },
        SpreadsheetApp: { openById: () => chain({ getSheetByName: () => null }) },
        Logger: { log: () => {} },
      }) as any).makeClassLink() as string;
    const link = make('https://script.google.com/macros/s/AKfy/dev');
    expect(readClassLink(link.slice(link.indexOf('#')))?.ranking).toBe('https://script.google.com/macros/s/AKfy/exec');
    expect(() => make(null)).toThrow('デプロイ');
  });

  test('ウェブアプリの URL を入れたクラスリンクを、アプリが読める', () => {
    const { buildClassLink_, APP_URL } = load();
    const ranking = 'https://script.google.com/macros/s/AKfycbx-123_abc/exec';
    const link = (buildClassLink_ as any)(
      'https://docs.google.com/forms/d/e/X/viewform?entry.1=NAME&entry.2=STAGE&entry.3=HEIGHT',
      APP_URL,
      ranking,
    );
    expect(readClassLink(link.slice(link.indexOf('#')))?.ranking).toBe(ranking);
  });
});

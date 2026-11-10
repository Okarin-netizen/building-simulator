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
    `${SOURCE}\nreturn { createRankingForm, buildClassLink_, RANKING_QUESTIONS, APP_URL };`,
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
    });

    const link = createRankingForm();
    expect(sheetNames).toEqual(['ランキング', '先生用メモ']);
    expect(formulas.join('\n')).toContain("'フォームの回答 1'!B2:B");
    expect(formulas.join('\n')).toContain('最高タワー');
    const t = readClassLink(link.slice(APP_URL.length));
    expect(t?.url).toBe('https://docs.google.com/forms/d/e/FORM_ID/viewform');
    expect(Object.keys(t!.entries).sort()).toEqual(Object.keys(FIELDS).sort());
  });
});

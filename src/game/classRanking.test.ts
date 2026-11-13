import { readClassLink, validateTemplate } from './classForm';
import { fetchRanking, isMine, nextTarget, parseRanking, RankingSheetError, starText } from './classRanking';

const FORM = { url: 'https://docs.google.com/forms/d/e/X/viewform', entries: { name: 'entry.1', stage: 'entry.2', height: 'entry.3' } };

describe('アプリ内のクラスランキング', () => {
  test('ランキングの URL は、先生の Apps Script ウェブアプリだけ受けつける', () => {
    const ok = ['https://script.google.com/macros/s/AKfy_c-1/exec', 'https://script.google.com/a/macros/example.ed.jp/s/AKfy/exec'];
    for (const ranking of ok) expect(validateTemplate({ ...FORM, ranking })?.ranking).toBe(ranking);
    const ng = [
      'https://evil.example.com/macros/s/AKfy/exec',
      'http://script.google.com/macros/s/AKfy/exec',
      'https://script.google.com/macros/s/AKfy/exec?x=1',
      'https://script.google.com.evil.com/macros/s/AKfy/exec',
      'javascript:alert(1)',
    ];
    for (const ranking of ng) {
      const t = validateTemplate({ ...FORM, ranking });
      expect(t).not.toBeNull(); // フォームの設定は生かし、ランキングだけ捨てる
      expect(t?.ranking).toBeUndefined();
    }
    const link = `#class=${encodeURIComponent(JSON.stringify({ ...FORM, ranking: ok[0] }))}`;
    expect(readClassLink(link)?.ranking).toBe(ok[0]);
  });

  test('ウェブアプリの答えを読み、おかしな行は捨てる', () => {
    const r = parseRanking({
      updated: '2026-11-10T03:00:00.000Z',
      total: 3,
      rows: [
        { rank: 1, group: '1-1', name: 'たろう', height: 12 },
        { rank: 2, group: '', name: 'はなこ', height: 9, secret: 'x' },
        { rank: 'a', name: 'x', height: 1 },
        { rank: 3, name: '', height: 1 },
        { rank: 3, name: 'ながいなまえながいなまえながいなまえながいなまえ', height: -1 },
        null,
      ],
    });
    expect(r?.rows).toEqual([
      { rank: 1, group: '1-1', name: 'たろう', height: 12 },
      { rank: 2, group: '', name: 'はなこ', height: 9 },
    ]);
    expect(r?.total).toBe(3);
    expect(r?.updated?.toISOString()).toBe('2026-11-10T03:00:00.000Z');
    expect(parseRanking({ error: 'x' })).toBeNull();
    // 新しい版のスクリプトは、記録を送るフォームのリンクも返す（先生の準備画面で使う）
    expect(parseRanking({ rows: [], total: 0, form: 'https://docs.google.com/forms/d/e/X/viewform?entry.1=NAME' })?.form).toContain('NAME');
    expect(parseRanking({ rows: [], total: 0 })).not.toHaveProperty('form');
    expect(parseRanking('<html>')).toBeNull();
  });

  test('自分の行を見分ける', () => {
    const row = { rank: 1, group: '1-1', name: 'たろう', height: 12 };
    expect(isMine(row, 'たろう', '1-1')).toBe(true);
    expect(isMine(row, ' たろう ', '')).toBe(true);
    expect(isMine(row, 'たろう', '1-2')).toBe(false);
    expect(isMine(row, '', '')).toBe(false);
  });
});

describe('先生が貼るウェブアプリの URL', () => {
  test('/dev や ? のあとを直して受けつけ、ほかの URL は受けつけない', async () => {
    const { parseRankingUrl } = await import('./classForm');
    expect(parseRankingUrl(' https://script.google.com/macros/s/AKfy/exec ')).toBe('https://script.google.com/macros/s/AKfy/exec');
    expect(parseRankingUrl('https://script.google.com/macros/s/AKfy/dev')).toBe('https://script.google.com/macros/s/AKfy/exec');
    expect(parseRankingUrl('https://script.google.com/macros/s/AKfy/exec?usp=sharing')).toBe('https://script.google.com/macros/s/AKfy/exec');
    expect(parseRankingUrl('https://script.google.com/a/example.ed.jp/macros/s/AKfy/exec')).toBe('https://script.google.com/a/example.ed.jp/macros/s/AKfy/exec');
    expect(parseRankingUrl('https://script.google.com/a/macros/example.ed.jp/s/AKfy/exec')).toBe('https://script.google.com/a/macros/example.ed.jp/s/AKfy/exec');
    expect(parseRankingUrl('https://docs.google.com/forms/d/e/X/viewform')).toBeNull();
    expect(parseRankingUrl('https://script.google.com/home/projects/abc/edit')).toBeNull();
  });

  test('ウェブアプリがスプレッドシートを読めなかったときは、それと分かるエラーにする', async () => {
    const real = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'ランキングを読めませんでした' }), { status: 200 })) as typeof fetch;
    try {
      await expect(fetchRanking('https://script.google.com/macros/s/X/exec')).rejects.toBeInstanceOf(RankingSheetError);
    } finally {
      globalThis.fetch = real;
    }
  });
});

describe('ランキングの星', () => {
  test('星の数を読み、ない・おかしいときは付けない', () => {
    const r = parseRanking({
      rows: [
        { rank: 1, name: 'a', height: 20, stars: 3 },
        { rank: 2, name: 'b', height: 10, stars: 7 },
        { rank: 3, name: 'c', height: 5 },
        { rank: 4, name: 'd', height: 5, stars: 'x' },
      ],
      total: 4,
    });
    expect(r?.rows.map((x) => x.stars)).toEqual([3, 3, undefined, undefined]);
    expect(r?.rows[2]).not.toHaveProperty('stars');
  });

  test('★☆ で表す', () => {
    expect(starText(0)).toBe('☆☆☆');
    expect(starText(2)).toBe('★★☆');
  });

  test('参考記録（星1・2のもっと高い記録）を読み、順位の高さ以下なら捨てる', () => {
    const r = parseRanking({
      rows: [
        { rank: 1, name: 'あ', height: 21, stars: 3, best: 27, bestStars: 1 },
        { rank: 2, name: 'い', height: 18, stars: 3, best: 18, bestStars: 3 },
        { rank: 3, name: 'う', height: 0, stars: 0, best: 'x' },
      ],
    });
    expect(r?.rows).toEqual([
      { rank: 1, group: '', name: 'あ', height: 21, stars: 3, best: 27, bestStars: 1 },
      { rank: 2, group: '', name: 'い', height: 18, stars: 3 },
      { rank: 3, group: '', name: 'う', height: 0, stars: 0 },
    ]);
  });

  test('すぐ上の人まで、あと何 m か', () => {
    const rows = [
      { rank: 1, group: '', name: 'あ', height: 24 },
      { rank: 2, group: '', name: 'い', height: 21 },
      { rank: 2, group: '', name: 'う', height: 21 },
      { rank: 4, group: '', name: 'え', height: 21 },
    ];
    expect(nextTarget(rows, 'う', '')).toEqual({ row: rows[0], more: 3 });
    expect(nextTarget(rows, 'え', '')).toEqual({ row: rows[2], more: 0 });
    expect(nextTarget(rows, 'あ', '')).toBeNull();
    expect(nextTarget(rows, 'お', '')).toBeNull();
  });
});

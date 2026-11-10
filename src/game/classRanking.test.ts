import { readClassLink, validateTemplate } from './classForm';
import { isMine, parseRanking } from './classRanking';

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
});

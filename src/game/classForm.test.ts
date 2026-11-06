import { buildSubmitUrl, classLinkFor, parseFormTemplate, readClassLink, validateTemplate } from './classForm';

const PREFILL =
  'https://docs.google.com/forms/d/e/1FAIpQLSabc_DEF-123/viewform?usp=pp_url&entry.111=NAME&entry.222=GROUP&entry.333=STAGE&entry.444=HEIGHT&entry.555=STARS';

describe('Google フォームの事前入力リンク', () => {
  test('置きかえる言葉から、質問ごとの entry 番号を読み取る', () => {
    const r = parseFormTemplate(PREFILL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.template.url).toBe('https://docs.google.com/forms/d/e/1FAIpQLSabc_DEF-123/viewform');
    expect(r.template.entries).toEqual({ name: 'entry.111', group: 'entry.222', stage: 'entry.333', height: 'entry.444', stars: 'entry.555' });
    expect(r.unused).toEqual(['cost', 'result']);
  });

  test('小文字や前後の空白でも読める', () => {
    const r = parseFormTemplate(' https://docs.google.com/forms/d/e/X/viewform?entry.1=name&entry.2=Stage&entry.3=height ');
    expect(r.ok).toBe(true);
  });

  test('必要な質問が足りないとき・Google フォーム以外は受けつけない', () => {
    const missing = parseFormTemplate('https://docs.google.com/forms/d/e/X/viewform?entry.1=NAME');
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toContain('STAGE');
    expect(parseFormTemplate('https://evil.example.com/forms/d/e/X/viewform?entry.1=NAME&entry.2=STAGE&entry.3=HEIGHT').ok).toBe(false);
    expect(parseFormTemplate('http://docs.google.com/forms/d/e/X/viewform?entry.1=NAME&entry.2=STAGE&entry.3=HEIGHT').ok).toBe(false);
    expect(parseFormTemplate('なにか').ok).toBe(false);
  });

  test('記録を入れた記入済みリンクを作る（日本語もそのまま送れる）', () => {
    const r = parseFormTemplate(PREFILL);
    if (!r.ok) throw new Error();
    const url = new URL(
      buildSubmitUrl(r.template, { name: 'たろう', group: '1組3班', stage: 'チャレンジ', height: '21', stars: '2', cost: '290', result: '倒れなかった' }),
    );
    expect(url.searchParams.get('entry.111')).toBe('たろう');
    expect(url.searchParams.get('entry.333')).toBe('チャレンジ');
    expect(url.searchParams.get('entry.444')).toBe('21');
    expect(url.searchParams.get('usp')).toBe('pp_url');
    expect(url.searchParams.has('entry.666')).toBe(false);
  });

  test('クラスリンクに入れた設定を読み戻せる。書きかえられた値は受けつけない', () => {
    const r = parseFormTemplate(PREFILL);
    if (!r.ok) throw new Error();
    const link = classLinkFor('https://okarin-netizen.github.io/building-simulator/#old', r.template);
    expect(link.startsWith('https://okarin-netizen.github.io/building-simulator/#class=')).toBe(true);
    expect(readClassLink(new URL(link).hash)).toEqual(r.template);
    expect(readClassLink('#other=1')).toBeNull();
    expect(readClassLink('#class=%7Bbroken')).toBeNull();
    expect(validateTemplate({ url: 'https://evil.example.com/forms/d/e/X/viewform', entries: r.template.entries })).toBeNull();
    expect(validateTemplate({ url: r.template.url, entries: { ...r.template.entries, name: 'javascript:1' } })).toBeNull();
  });
});

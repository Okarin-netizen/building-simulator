// クリアしたが星3つに届かなかったときの注意の文を確かめる。

import { safetyNote, type Evaluation } from './evaluate';

/** 3つの確かめ（倒れなかった・こわれた所0・揺れ幅）から評価を作る */
function ev(cleared: boolean, noDamage: boolean, smallDrift: boolean): Evaluation {
  const checks = [
    { label: '倒れなかった', ok: cleared },
    { label: 'こわれた部材・つなぎ目が0', ok: cleared && noDamage },
    { label: '揺れ幅', ok: cleared && smallDrift },
  ];
  return { cleared, stars: checks.filter((c) => c.ok).length, height: 27, checks, fell: cleared ? 'none' : 'collapsed' };
}

test('星3つなら注意は出ない', () => {
  expect(safetyNote(ev(true, true, true))).toBeNull();
});

test('倒れたときは注意を出さない（「見直そう」が出るため）', () => {
  expect(safetyNote(ev(false, false, false))).toBeNull();
});

test('こわれた所があれば、修理が必要だと伝える', () => {
  expect(safetyNote(ev(true, false, true))).toBe('倒れなかったけれど、こわれた所があります。本物の建物なら、大きな修理が必要です。');
  // こわれた所があって揺れ幅も大きいときは、こわれた所の注意を優先する
  expect(safetyNote(ev(true, false, false))).toContain('こわれた所があります');
});

test('こわれた所は0でも揺れ幅が基準を超えたら、揺れの危険を伝える', () => {
  expect(safetyNote(ev(true, true, false))).toBe('倒れなかったけれど、揺れ幅が大きめです。本物の建物なら、中の人や家具が危険です。');
});

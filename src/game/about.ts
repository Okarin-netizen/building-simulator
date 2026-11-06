/** 「このアプリについて」に出す、作者・更新履歴・ライセンスの情報 */

export const AUTHOR = '技術科　岡田';

export const APP_LICENSE = {
  name: 'MIT ライセンス',
  summary:
    'だれでも無料で使い、改良し、配ることができます。配るときは、下の著作権表示とこの許可の文を残してください。',
  copyright: `Copyright (c) 2026 ${AUTHOR}`,
};

export interface ChangeEntry {
  version: string;
  date: string; // YYYY-MM-DD（日本時間）
  title: string;
  items: string[];
}

/** 新しいものを上に書く */
export const CHANGELOG: ChangeEntry[] = [
  {
    version: '0.7',
    date: '2026-11-07',
    title: '発展の章（風・制震と免震）',
    items: [
      '発展 第5章「風」を追加：台風に耐える5階建て（5-1）。風は高い所ほど強く、同じ向きに押し続ける',
      '発展 第6章「制震と免震」を追加：制震ダンパーで揺れを吸収する（6-1）、免震ゴムで病院を守る（6-2）',
      '新しい材料「制震ダンパー」と、建物の下に入れる「免震ゴム」を追加（自由に作るモードでも使える）',
    ],
  },
  {
    version: '0.6',
    date: '2026-11-07',
    title: '発展の章（重心・共振）',
    items: [
      '発展 第3章「重さと重心」を追加：重い機械をどの階に置くか（3-1）、細長いタワーの幅を広げる（3-2）',
      '発展 第4章「揺れ方と共振」を追加：小刻みな揺れで低い建物が共振する（4-1）、長周期地震動で高い建物が共振する（4-2）',
      '機械などの重いものを床に置く道具を追加',
    ],
  },
  {
    version: '0.5',
    date: '2026-11-07',
    title: '揺れと材料の調整',
    items: [
      '地震の揺れを、ゆっくりから速いものまで（0.3〜4.2秒）均等に混ぜる形に変更し、高い建物ほど倒れにくくなる逆転を修正',
      '部材を置ける高さを 23 m から 30 m に広げ、ステージ2-3をクリアできるように',
    ],
  },
  {
    version: '0.4',
    date: '2026-11-07',
    title: 'クラスランキング',
    items: [
      '先生の Google フォームに記録を送る「クラスに送る」を追加（サーバーなし、ニックネームのみ）',
      '先生用のクラスランキング設定画面と、生徒に配るクラスリンクを追加',
    ],
  },
  {
    version: '0.3',
    date: '2026-11-07',
    title: '予想 → 試験 → ふりかえり',
    items: [
      '試験の前に、いちばん先にこわれそうな部材を予想して答え合わせ',
      'スロー再生で、最初にこわれた瞬間を巻き戻して確かめられるように',
      '印刷できるふりかえりシートを追加',
    ],
  },
  {
    version: '0.2',
    date: '2026-11-07',
    title: 'ステージと星の評価',
    items: [
      '6つのステージ（依頼）、予算、星3つの評価、「なぜ？」の解説カードを追加',
      '画面を「工事現場」のデザインに変更',
    ],
  },
  {
    version: '0.1',
    date: '2026-11-07',
    title: '物理の試作版',
    items: ['柱・梁・筋交いを組んで地震で揺らす、質点とばねの物理を作成'],
  },
];

export interface ThirdParty {
  name: string;
  use: string;
  license: string;
  url: string;
}

/** アプリが使っているもの（フォントは画面に表示、ほかは作るときの道具） */
export const THIRD_PARTY: ThirdParty[] = [
  {
    name: 'Dela Gothic One',
    use: 'タイトルなどのフォント（Google Fonts）',
    license: 'SIL Open Font License 1.1',
    url: 'https://fonts.google.com/specimen/Dela+Gothic+One',
  },
  {
    name: 'Zen Kaku Gothic New',
    use: '本文のフォント（Google Fonts）',
    license: 'SIL Open Font License 1.1',
    url: 'https://fonts.google.com/specimen/Zen+Kaku+Gothic+New',
  },
  {
    name: 'TypeScript',
    use: 'プログラムを書く言語（作るときだけ使用）',
    license: 'Apache License 2.0',
    url: 'https://www.typescriptlang.org/',
  },
  {
    name: 'Vite',
    use: '公開用ファイルを作る道具（作るときだけ使用）',
    license: 'MIT License',
    url: 'https://vitejs.dev/',
  },
  {
    name: 'Vitest',
    use: 'テストの道具（作るときだけ使用）',
    license: 'MIT License',
    url: 'https://vitest.dev/',
  },
];

export const MIT_TEXT = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

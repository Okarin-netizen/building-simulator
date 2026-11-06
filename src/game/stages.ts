// ステージ（依頼）の定義。授業で使う第1・2章と、最高タワーチャレンジ。
// 数値を変えたら stages.test.ts で「解ける」「工夫しないと解けない」が保たれているか確かめる。

import { addMember, emptyDesign, frameDesign, type Design } from '../physics/design';
import type { MaterialId } from '../physics/materials';
import type { QuakeLevel, QuakeType } from '../physics/quake';

export interface Stage {
  id: string;
  chapter: 1 | 2 | 3 | 4 | 'challenge';
  title: string;
  /** 依頼主からの依頼文 */
  request: string;
  /** 目標の高さ（m）。最高タワーでは 0（高いほどよい） */
  goalHeight: number;
  /** 予算（万円）。超えると地震の試験ができない */
  budget: number;
  quake: { level: QuakeLevel; type: QuakeType };
  materials: MaterialId[];
  /** 最初から建っている部分 */
  initial: () => Design;
  /** 行き詰まったときのヒント */
  hint: string;
  /** クリアしたときの「なぜ？」カード */
  lesson: string;
  /** 生徒が置き場所を決める重いもの（第3章） */
  load?: { name: string; mass: number };
}

/** 幅を bays 区画に分けた、筋交い入りの枠（幅 bays × bay m） */
export function wideTower(floors: number, bays: number, material: MaterialId = 'wood', bay = 4): Design {
  const d = emptyDesign();
  for (let f = 0; f < floors; f++) {
    const y0 = f * 3;
    const y1 = y0 + 3;
    for (let b = 0; b <= bays; b++) addMember(d, b * bay, y0, b * bay, y1, material);
    for (let b = 0; b < bays; b++) {
      addMember(d, b * bay, y1, (b + 1) * bay, y1, material);
      if ((f + b) % 2 === 0) addMember(d, b * bay, y0, (b + 1) * bay, y1, material);
      else addMember(d, (b + 1) * bay, y0, b * bay, y1, material);
    }
  }
  return d;
}

/** 階ごとに材料を指定した、筋交い入りの枠 */
export function bracedTower(materials: MaterialId[], width = 4): Design {
  const d = emptyDesign();
  materials.forEach((m, f) => {
    const y0 = f * 3;
    const y1 = y0 + 3;
    addMember(d, 0, y0, 0, y1, m);
    addMember(d, width, y0, width, y1, m);
    addMember(d, 0, y1, width, y1, m);
    addMember(d, f % 2 === 0 ? 0 : width, y0, f % 2 === 0 ? width : 0, y1, m);
  });
  return d;
}

export const STAGES: Stage[] = [
  {
    id: '1-1',
    chapter: 1,
    title: 'ななめの1本',
    request: 'この2階建ての枠は、強い地震で倒れてしまいます。部材を足して、倒れないようにしてください。',
    goalHeight: 6,
    budget: 30,
    quake: { level: 'strong', type: 'mixed' },
    materials: ['wood'],
    initial: () => frameDesign({ floors: 2 }),
    hint: '四角の角から角へ、ななめに1本ずつ部材を入れてみよう。',
    lesson:
      '四角い枠は、角（つなぎ目）が曲がるだけで形がくずれます。ななめの部材（筋交い）を入れると四角が2つの三角形に分かれます。三角形は辺の長さが変わらない限り形が変わらないので、横からの力に強くなります。',
  },
  {
    id: '1-2',
    chapter: 1,
    title: '3階建ての家',
    request: '高さ9mの3階建てを建ててください。中くらいの地震に耐えること。',
    goalHeight: 9,
    budget: 50,
    quake: { level: 'medium', type: 'mixed' },
    materials: ['wood'],
    initial: emptyDesign,
    hint: '柱・梁で四角い枠を作ったら、各階に筋交いを入れよう。予算に注意。',
    lesson:
      '各階に三角形があると、それぞれの階が形をくずさずに力を下へ伝えられます。1つの階でも四角のままだと、その階だけが大きく曲がって倒れる原因になります。',
  },
  {
    id: '1-3',
    chapter: 1,
    title: '強い地震に備える',
    request: '高さ12mの4階建てを、強い地震に耐えるように建ててください。予算は少なめです。',
    goalHeight: 12,
    budget: 70,
    quake: { level: 'strong', type: 'mixed' },
    materials: ['wood'],
    initial: emptyDesign,
    hint: '予算内に収めるには、必要な所にだけ部材を使おう。各階に筋交いを1本ずつ入れるのが近道。',
    lesson:
      '部材をたくさん使えば強くなるとは限りません。三角形を正しい所に作れば、少ない材料でも強い建物になります。これが「構造を工夫する」ということです。',
  },
  {
    id: '2-1',
    chapter: 2,
    title: '6階建てのビル',
    request: '高さ18mの6階建てを、強い地震に耐えるように建ててください。鉄骨と鉄筋コンクリートも使えます。',
    goalHeight: 18,
    budget: 200,
    quake: { level: 'strong', type: 'mixed' },
    materials: ['wood', 'steel', 'concrete'],
    initial: emptyDesign,
    hint: '全部を鉄骨にすると予算オーバー。下の階ほど大きな力がかかるので、下の階だけ強い材料にしてみよう。',
    lesson:
      '建物の下の階ほど、上の階の重さと地震の力を多く受けます。強くて高い材料（鉄骨）は力の大きい所だけに使い、上の階は軽くて安い材料にすると、費用をおさえながら強い建物になります。',
  },
  {
    id: '2-2',
    chapter: 2,
    title: '重すぎるビル',
    request: 'この鉄筋コンクリートの4階建ては、強い地震で倒れてしまいます。材料を変えて、倒れないようにしてください。',
    goalHeight: 12,
    budget: 130,
    quake: { level: 'strong', type: 'mixed' },
    materials: ['wood', 'steel', 'concrete'],
    initial: () => bracedTower(['concrete', 'concrete', 'concrete', 'concrete']),
    hint: '同じ場所に別の材料で部材を置くと、材料を置きかえられます。重い材料が建物全体にどう影響するか考えよう。',
    lesson:
      '地震の力は「重さ × 揺れの強さ」で大きくなります。鉄筋コンクリートは押す力に強い一方で重く、曲がる前にこわれやすい（ねばりが少ない）材料です。重い建物ほど地震の力を多く受けるので、軽くする工夫も大切です。',
  },
  {
    id: '2-3',
    chapter: 2,
    title: '8階建てに挑戦',
    request: '高さ24mの8階建てを、強い地震に耐えるように建ててください。',
    goalHeight: 24,
    budget: 320,
    quake: { level: 'strong', type: 'mixed' },
    materials: ['wood', 'steel', 'concrete'],
    initial: emptyDesign,
    hint: '材料の使い分けに加えて、筋交いを両方向（×の形）に入れる方法もあるよ。',
    lesson:
      '高い建物ほど、地震のときに上の方が大きく揺れます。材料の使い分けと三角形の組み方の両方を工夫すると、限られた予算でも高い建物を建てられます。',
  },
  {
    id: 'challenge',
    chapter: 'challenge',
    title: '最高タワーチャレンジ',
    request: '予算300万円で、強い地震に耐える、できるだけ高いタワーを建ててください。高さが記録になります。',
    goalHeight: 0,
    budget: 300,
    quake: { level: 'strong', type: 'mixed' },
    materials: ['wood', 'steel', 'concrete'],
    initial: emptyDesign,
    hint: 'これまでの章で見つけた工夫（三角形・材料の使い分け）を全部使ってみよう。',
    lesson: '班のみんなの記録と比べて、高いタワーの工夫を説明し合ってみよう。',
  },
  {
    id: '3-1',
    chapter: 3,
    title: '重い機械をどこに置く？',
    request: 'この4階建てに、重い機械（50）を1台置きます。強い地震に耐えられる階に置いてください。',
    goalHeight: 12,
    budget: 70,
    quake: { level: 'strong', type: 'mixed' },
    materials: ['wood'],
    initial: () => bracedTower(['wood', 'wood', 'wood', 'wood']),
    hint: '「機械を置く」を選んで床をタップすると、その階に機械を置けます。高い階と低い階で試して比べよう。',
    lesson:
      '重いものが高い所にあると、建物全体の重心が高くなり、地震のときに上の方が大きく振られて倒れやすくなります。重いものはなるべく低い階に置くと、重心が下がって安定します。',
    load: { name: '機械', mass: 50 },
  },
  {
    id: '3-2',
    chapter: 3,
    title: '細長いタワー',
    request: '木材だけで、高さ21mの7階建てを、強い地震に耐えるように建ててください。',
    goalHeight: 21,
    budget: 200,
    quake: { level: 'strong', type: 'mixed' },
    materials: ['wood'],
    initial: emptyDesign,
    hint: '幅4mの細いタワーは倒れやすいよ。柱を3本にして、幅を8mに広げてみよう。',
    lesson:
      '細長い建物は、揺れると根元の柱に大きな力がかかり、倒れやすくなります。幅を広げると、同じ揺れでも根元にかかる力が小さくなり、どっしり安定します。高さに対して幅が大切です。',
  },
  {
    id: '4-1',
    chapter: 4,
    title: '小刻みな揺れの町',
    request: 'この町の地震は、小刻みに速く揺れます。この3階建ては倒れてしまうので、倒れないようにしてください。',
    goalHeight: 9,
    budget: 100,
    quake: { level: 'strong', type: 'short' },
    materials: ['wood', 'steel'],
    initial: () => bracedTower(['wood', 'wood', 'wood']),
    hint: 'この建物は、ふつうの揺れなら倒れません。1つの階だけ鉄骨に変えて、建物の揺れ方を変えてみよう。',
    lesson:
      '建物には、それぞれ揺れやすい速さ（固有周期）があります。地震の揺れの速さと建物の揺れやすい速さが合うと、揺れがどんどん大きくなります。これを「共振」といいます。材料や形を変えて揺れやすい速さをずらすと、共振を避けられます。',
  },
  {
    id: '4-2',
    chapter: 4,
    title: 'ゆったりした揺れ（長周期地震動）',
    request: '遠くの大地震で、ゆったりと大きく揺れる地震が来ます。高さ21mの7階建てを、倒れないように建ててください。',
    goalHeight: 21,
    budget: 250,
    quake: { level: 'strong', type: 'long' },
    materials: ['wood', 'steel', 'concrete'],
    initial: emptyDesign,
    hint: '下の2階だけ鉄骨では足りないよ。鉄骨を何階分にすれば共振しなくなるか、1階ずつ増やして試そう。',
    lesson:
      '高い建物ほど、ゆっくり揺れやすい（固有周期が長い）ので、ゆったりした揺れ（長周期地震動）と共振しやすくなります。実際に、遠くの大地震で高層ビルが長い時間大きく揺れたことがあります。建物を硬くして揺れやすい速さを変えることが対策になります。',
  },
];

export const CHAPTER_NAMES: Record<string, string> = {
  '1': '第1章 四角と三角',
  '2': '第2章 材料を選ぶ',
  '3': '発展 第3章 重さと重心',
  '4': '発展 第4章 揺れ方と共振',
  challenge: 'チャレンジ',
};

/** ステージの番号の表示（例：1-2、チャレンジ） */
export const stageLabel = (s: Stage) => (s.chapter === 'challenge' ? 'チャレンジ' : s.id);

export function stageById(id: string): Stage | undefined {
  return STAGES.find((s) => s.id === id);
}

export function nextStage(id: string): Stage | undefined {
  const i = STAGES.findIndex((s) => s.id === id);
  return i >= 0 ? STAGES[i + 1] : undefined;
}

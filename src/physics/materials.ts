// 材料の性質（ゲーム用の値）。
// 実物の大小関係（強さ・重さ・ねばり・価格）に合わせているが、数値そのものは遊びやすさで調整している。

export type MaterialId = 'wood' | 'steel' | 'concrete' | 'damper';

export interface Material {
  id: MaterialId;
  name: string;
  /** 伸び縮みのしにくさ（部材の長さ1mあたり） */
  axialStiffness: number;
  /** 部材1mあたりの重さ */
  massPerMeter: number;
  /** 何割伸び縮みしたら折れるか */
  breakStrain: number;
  /** 接合部の曲がりにくさ */
  jointStiffness: number;
  /** 接合部が何ラジアン曲がったら壊れるか */
  jointBreakAngle: number;
  /** 1mあたりの値段（万円） */
  costPerMeter: number;
  color: string;
  /** 伸び縮みの揺れを吸収する強さ（ふつうの部材は 0.2） */
  dampingRatio?: number;
  /** 両端がピン（つなぎ目で角度を保たない）。制震ダンパー用 */
  pinned?: boolean;
  /** 材料ボタンに出す特徴（生徒向け。1〜3 の目安） */
  traits: { strength: number; weight: number; toughness: number } | { note: string };
}

export const MATERIALS: Record<MaterialId, Material> = {
  wood: {
    id: 'wood',
    name: '木材',
    axialStiffness: 1.6e5,
    massPerMeter: 0.5,
    breakStrain: 0.013,
    jointStiffness: 1500,
    jointBreakAngle: 0.06,
    costPerMeter: 1,
    color: '#c58b4c',
    traits: { strength: 1, weight: 1, toughness: 2 },
  },
  steel: {
    id: 'steel',
    name: '鉄骨',
    axialStiffness: 6.0e5,
    massPerMeter: 1.2,
    breakStrain: 0.06,
    jointStiffness: 5000,
    jointBreakAngle: 0.15,
    costPerMeter: 4,
    color: '#3d4a5c',
    traits: { strength: 3, weight: 2, toughness: 3 },
  },
  concrete: {
    id: 'concrete',
    name: '鉄筋コンクリート',
    axialStiffness: 4.5e5,
    massPerMeter: 2.5,
    breakStrain: 0.007,
    jointStiffness: 6000,
    jointBreakAngle: 0.04,
    costPerMeter: 2,
    color: '#b9b6ac',
    traits: { strength: 2, weight: 3, toughness: 1 },
  },
  damper: {
    id: 'damper',
    name: '制震ダンパー',
    // やわらかいが、伸び縮みするときに揺れのエネルギーを熱にして吸収する
    axialStiffness: 0.8e5,
    massPerMeter: 0.6,
    breakStrain: 0.2,
    jointStiffness: 0,
    jointBreakAngle: 10,
    costPerMeter: 3,
    color: '#7a5cc4',
    traits: { note: '揺れを吸収する（やわらかい）' },
    dampingRatio: 10,
    pinned: true,
  },
};

export const MATERIAL_IDS: MaterialId[] = ['wood', 'steel', 'concrete', 'damper'];

// 材料の性質（ゲーム用の値）。
// 実物の大小関係（強さ・重さ・ねばり・価格）に合わせているが、数値そのものは遊びやすさで調整している。

export type MaterialId = 'wood' | 'steel' | 'concrete';

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
}

export const MATERIALS: Record<MaterialId, Material> = {
  wood: {
    id: 'wood',
    name: '木材',
    axialStiffness: 1.6e+05,
    massPerMeter: 0.5,
    breakStrain: 0.03,
    jointStiffness: 1500,
    jointBreakAngle: 0.06,
    costPerMeter: 1,
    color: '#c58b4c',
  },
  steel: {
    id: 'steel',
    name: '鉄骨',
    axialStiffness: 6.0e+05,
    massPerMeter: 1.2,
    breakStrain: 0.06,
    jointStiffness: 5000,
    jointBreakAngle: 0.15,
    costPerMeter: 4,
    color: '#6f7f91',
  },
  concrete: {
    id: 'concrete',
    name: '鉄筋コンクリート',
    axialStiffness: 4.5e+05,
    massPerMeter: 2.5,
    breakStrain: 0.015,
    jointStiffness: 6000,
    jointBreakAngle: 0.04,
    costPerMeter: 2,
    color: '#a9a9a2',
  },
};

export const MATERIAL_IDS: MaterialId[] = ['wood', 'steel', 'concrete'];

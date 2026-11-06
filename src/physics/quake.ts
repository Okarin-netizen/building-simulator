// 地面の揺れ。いくつかの周期の揺れ（正弦波）を重ね、始まりと終わりがなめらかになるよう包む。
// 本物の地震はいろいろな速さの揺れが混ざっているので、「ふつう」は混ぜた揺れにしている。

export type QuakeLevel = 'weak' | 'medium' | 'strong';
export type QuakeType = 'short' | 'mixed' | 'long';

export interface QuakeWave {
  /** 1往復にかかる時間（秒） */
  period: number;
  /** この波の加速度の大きさの割合 */
  weight: number;
  phase: number;
}

export interface Quake {
  /** 地面の揺れの加速度の目安（m/s²） */
  peakAccel: number;
  waves: QuakeWave[];
  /** 揺れが続く時間（秒） */
  duration: number;
}

export const QUAKE_LEVELS: Record<QuakeLevel, { name: string; peakAccel: number }> = {
  weak: { name: '弱い（震度4くらい）', peakAccel: 1 },
  medium: { name: '中くらい（震度5強くらい）', peakAccel: 3 },
  strong: { name: '強い（震度6強くらい）', peakAccel: 6 },
};

export const QUAKE_TYPES: Record<QuakeType, { name: string; waves: QuakeWave[] }> = {
  short: {
    name: '小刻みな揺れ',
    waves: [
      { period: 0.3, weight: 0.6, phase: 0 },
      { period: 0.5, weight: 0.4, phase: 1.3 },
    ],
  },
  mixed: {
    name: 'ふつうの揺れ',
    // 短い周期から長い周期まで、同じくらいの強さで混ぜる。
    // どの高さの建物にも同じように揺れが届くので、「高い建物ほど大きな力を受ける」ことが分かりやすくなる。
    // （周期の少ない波だけだと、建物の揺れやすい周期と合ったときだけ大きく揺れる「共振のくじ引き」になってしまう）
    waves: [0.3, 0.42, 0.55, 0.7, 0.9, 1.15, 1.5, 2.0, 2.6, 3.3, 4.2].map((period, i) => ({
      period,
      weight: 1 / 11,
      phase: (i * 2.39) % (2 * Math.PI),
    })),
  },
  long: {
    name: 'ゆったりした揺れ',
    waves: [
      { period: 2.0, weight: 0.6, phase: 0 },
      { period: 3.0, weight: 0.4, phase: 1.9 },
    ],
  },
};

export function makeQuake(level: QuakeLevel, type: QuakeType = 'mixed', duration = 15): Quake {
  return { peakAccel: QUAKE_LEVELS[level].peakAccel, waves: QUAKE_TYPES[type].waves, duration };
}

function envelope(q: Quake, t: number): number {
  const ramp = 2;
  if (t <= 0 || t >= q.duration) return 0;
  if (t < ramp) return t / ramp;
  if (t > q.duration - ramp) return (q.duration - t) / ramp;
  return 1;
}

/** 時刻 t での地面の横のずれ（m）。t < 0 は揺れる前 */
export function groundOffset(q: Quake, t: number): number {
  const e = envelope(q, t);
  if (e === 0) return 0;
  let x = 0;
  for (const wave of q.waves) {
    const w = (2 * Math.PI) / wave.period;
    // 加速度が peakAccel × weight になるような揺れ幅
    const amplitude = (q.peakAccel * wave.weight) / (w * w);
    x += amplitude * Math.sin(w * t + wave.phase);
  }
  return x * e;
}

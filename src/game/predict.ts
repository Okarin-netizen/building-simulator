// 試験の前の「予想」と、試験のあとの答え合わせ。画面に依存しない。

import type { Design } from '../physics/design';
import { MATERIALS } from '../physics/materials';
import type { FirstBreak } from '../physics/world';

/** 最初にこわれそうな部材を1本選ぶか、「こわれない」と予想する */
export type Prediction = { kind: 'member'; index: number } | { kind: 'none' };

export type Verdict = 'hit' | 'near' | 'miss';

export interface PredictionResult {
  verdict: Verdict;
  /** 予想の説明（例：1階の左の柱（木材）） */
  predicted: string;
  /** 実際の結果の説明 */
  actual: string;
  message: string;
}

/** 「おしい」とする距離（m）：だいたい1階分 */
export const NEAR_DISTANCE = 3.5;

const STORY = 3;

function memberKind(design: Design, index: number): string {
  const m = design.members[index];
  const a = design.nodes[m.a];
  const b = design.nodes[m.b];
  if (a.x === b.x) return '柱';
  if (a.y === b.y) return '梁';
  return '筋交い';
}

/** 部材を「2階の筋交い（木材）」のように言葉にする */
export function describeMember(design: Design, index: number): string {
  const m = design.members[index];
  const a = design.nodes[m.a];
  const b = design.nodes[m.b];
  const kind = memberKind(design, index);
  // 梁は上の階の床なので、その下の階として数える
  const low = kind === '梁' ? Math.max(0, Math.min(a.y, b.y) - 0.5) : Math.min(a.y, b.y);
  const floor = Math.floor(low / STORY) + 1;
  return `${floor}階の${kind}（${MATERIALS[m.material].name}）`;
}

export function describeBreak(design: Design, fb: FirstBreak | null): string {
  if (!fb) return 'どこもこわれなかった';
  if (fb.kind === 'member') return describeMember(design, fb.index);
  const n = design.nodes[fb.node];
  return n.y <= 0 ? '基礎（地面とのつなぎ目）' : `高さ${Math.round(n.y)}mのつなぎ目`;
}

export function describePrediction(design: Design, p: Prediction): string {
  return p.kind === 'none' ? 'どこもこわれない' : describeMember(design, p.index);
}

/** こわれた場所の位置（設計図の座標） */
export function breakPoint(design: Design, fb: FirstBreak): { x: number; y: number } {
  if (fb.kind === 'joint') return design.nodes[fb.node];
  const m = design.members[fb.index];
  const a = design.nodes[m.a];
  const b = design.nodes[m.b];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** 点と線分のいちばん近い距離 */
function distanceToSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1e-9;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function judgePrediction(design: Design, p: Prediction, fb: FirstBreak | null): PredictionResult {
  const predicted = describePrediction(design, p);
  const actual = describeBreak(design, fb);
  const result = (verdict: Verdict, message: string): PredictionResult => ({ verdict, predicted, actual, message });

  if (p.kind === 'none') {
    return fb
      ? result('miss', `こわれないと予想したけれど、${actual}が最初にこわれました。`)
      : result('hit', '予想どおり、どこもこわれませんでした！');
  }
  if (!fb) return result('miss', 'どこもこわれませんでした。思ったより強い建物です。');

  const m = design.members[p.index];
  const a = design.nodes[m.a];
  const b = design.nodes[m.b];
  if (fb.kind === 'member' && fb.index === p.index) return result('hit', '大当たり！ 予想した部材が最初にこわれました。');
  if (fb.kind === 'joint' && (fb.node === m.a || fb.node === m.b))
    return result('hit', '大当たり！ 予想した部材の端のつなぎ目が最初にこわれました。');
  // 左右対称の建物では、同じ階の同じ種類の部材は「同じ所」とみなす
  if (fb.kind === 'member' && actual === predicted)
    return result('hit', `大当たり！ 予想と同じ${actual}が最初にこわれました。`);
  const bp = breakPoint(design, fb);
  const sameStory = Math.abs(bp.y - (a.y + b.y) / 2) <= STORY / 2;
  if (sameStory || distanceToSegment(bp, a, b) <= NEAR_DISTANCE) return result('near', `おしい！ 最初にこわれたのは、すぐ近くの${actual}でした。`);
  return result('miss', `はずれ。最初にこわれたのは${actual}でした。なぜそこに力が集まったのか考えよう。`);
}

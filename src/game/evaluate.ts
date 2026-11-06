// 試験の結果を評価する（星の数）。画面に依存しない。

import { designCost, designHeight, type Design } from '../physics/design';
import { brokenCount, type World } from '../physics/world';
import type { Stage } from './stages';

/** 揺れ幅の基準：建物の高さの何割までなら「揺れが小さい」とするか */
export const DRIFT_LIMIT_RATIO = 0.02;

export interface CanTest {
  ok: boolean;
  reason?: string;
}

/** 地震の試験を始めてよいか（予算と基礎） */
export function canStartTest(stage: Stage | null, design: Design): CanTest {
  if (design.members.length === 0) return { ok: false, reason: '部材を置いてから試験しよう。' };
  if (!design.nodes.some((n) => n.y <= 0)) return { ok: false, reason: '地面につながった部材がありません。いちばん下の線から柱を立てよう。' };
  if (stage?.load) {
    const load = design.loads?.[0];
    if (!load || !design.nodes.some((n) => n.y === load.y && n.y > 0))
      return { ok: false, reason: `「${stage.load.name}を置く」を選んで、${stage.load.name}を置く階の床をタップしよう。` };
  }
  if (stage && designCost(design) > stage.budget)
    return { ok: false, reason: `予算オーバーです（${designCost(design)} / ${stage.budget} 万円）。部材を減らすか、安い材料にしよう。` };
  return { ok: true };
}

export interface Evaluation {
  cleared: boolean;
  stars: number; // 0〜3
  height: number;
  checks: { label: string; ok: boolean }[];
}

export function evaluate(stage: Stage | null, design: Design, world: World): Evaluation {
  const height = designHeight(design);
  const broken = brokenCount(world);
  const reachedGoal = !stage || height >= stage.goalHeight;
  const stood = !world.collapsed;
  const cleared = reachedGoal && stood;
  const noDamage = broken.members === 0 && broken.joints === 0;
  const smallDrift = world.maxDrift <= Math.max(height, 1) * DRIFT_LIMIT_RATIO;
  const driftCm = Math.round(world.maxDrift * 100);
  const limitCm = Math.round(Math.max(height, 1) * DRIFT_LIMIT_RATIO * 100);

  const checks = [
    { label: stage && stage.goalHeight > 0 ? `高さ${stage.goalHeight}m以上で、倒れなかった` : '倒れなかった', ok: cleared },
    { label: 'こわれた部材・つなぎ目が0', ok: cleared && noDamage },
    { label: `いちばん上の揺れ幅が${limitCm}cm以下（${driftCm}cm）`, ok: cleared && smallDrift },
  ];
  return { cleared, stars: checks.filter((c) => c.ok).length, height, checks };
}

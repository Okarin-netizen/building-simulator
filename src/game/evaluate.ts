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

/** 地面につながっていない部材があるか（どこかの基礎まで部材をたどって行けない） */
export function hasFloatingMember(design: Design): boolean {
  const reach = design.nodes.map((n) => n.y <= 0);
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of design.members) {
      if (reach[m.a] !== reach[m.b]) {
        reach[m.a] = reach[m.b] = true;
        changed = true;
      }
    }
  }
  return design.members.some((m) => !reach[m.a]);
}

/** 地震の試験を始めてよいか（予算と基礎） */
export function canStartTest(stage: Stage | null, design: Design): CanTest {
  if (design.members.length === 0) return { ok: false, reason: '部材を置いてから試験しよう。' };
  if (!design.nodes.some((n) => n.y <= 0)) return { ok: false, reason: '地面につながった部材がありません。いちばん下の線から柱を立てよう。' };
  if (hasFloatingMember(design))
    return { ok: false, reason: '地面につながっていない部材があります。宙に浮いた部材を消すか、柱でつなごう。' };
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
  /** none：くずれなかった / collapsed：倒れた / partly：一部がくずれ落ちた */
  fell: 'none' | 'collapsed' | 'partly';
}

/** 試験のあと、元の高さからこれ以上下がったつなぎ目があれば「くずれた」とみなす（m） */
export const FALL_TOLERANCE = 0.5;

/**
 * 建物の一部がくずれたか。てっぺんに立てた棒が折れて垂れ下がった場合などは、
 * 全体の高さは残っていても「倒れなかった」とは言えないので、ここで見つける。
 */
export function partlyFell(world: World): boolean {
  return world.nodes.some((n) => !n.support && n.baseY > 0 && n.y < n.baseY - FALL_TOLERANCE);
}

export function evaluate(stage: Stage | null, design: Design, world: World): Evaluation {
  const height = designHeight(design);
  const broken = brokenCount(world);
  const reachedGoal = !stage || height >= stage.goalHeight;
  const fell: Evaluation['fell'] = world.collapsed ? 'collapsed' : partlyFell(world) ? 'partly' : 'none';
  const cleared = reachedGoal && fell === 'none';
  const noDamage = broken.members === 0 && broken.joints === 0;
  const ratio = stage?.driftLimit ?? DRIFT_LIMIT_RATIO;
  const smallDrift = world.maxDrift <= Math.max(height, 1) * ratio;
  const driftCm = Math.round(world.maxDrift * 100);
  const limitCm = Math.round(Math.max(height, 1) * ratio * 100);
  const percent = Math.round(ratio * 1000) / 10;

  const checks = [
    { label: stage && stage.goalHeight > 0 ? `高さ${stage.goalHeight}m以上で、倒れなかった` : '倒れなかった', ok: cleared },
    { label: 'こわれた部材・つなぎ目が0', ok: cleared && noDamage },
    {
      label: `いちばん上の揺れ幅が${limitCm}cm以下（高さの${percent}%）${fell === 'none' ? `：${driftCm}cm` : ''}`,
      ok: cleared && smallDrift,
    },
  ];
  return { cleared, stars: checks.filter((c) => c.ok).length, height, checks, fell };
}

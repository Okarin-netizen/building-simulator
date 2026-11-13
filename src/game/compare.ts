// 同じステージの前回の試験と比べる（結果カードの「前回とくらべて」）。
// 星が増えない小さな改良でも「強くなった」と分かるようにし、1か所ずつ変えて比べる考え方につなげる。

export interface TrySummary {
  stars: number;
  /** none：倒れなかった / collapsed / partly */
  fell: 'none' | 'collapsed' | 'partly';
  /** いちばん上の揺れ幅（cm）。倒れたときは比べない */
  driftCm: number;
  /** こわれた部材・つなぎ目の数 */
  broken: number;
  cost: number;
  height: number;
}

const signed = (n: number) => (n > 0 ? `＋${n}` : n < 0 ? `−${-n}` : '±0');

/** 前回とのちがいを、短い言葉の並びにする。比べるものがなければ空 */
export function compareTries(prev: TrySummary | null, cur: TrySummary): { text: string; better: boolean | null }[] {
  if (!prev) return [];
  const out: { text: string; better: boolean | null }[] = [];
  if (prev.fell !== 'none' && cur.fell === 'none') out.push({ text: '前回は倒れたけれど、今回は耐えた！', better: true });
  else if (prev.fell === 'none' && cur.fell !== 'none') out.push({ text: '前回は耐えたのに、今回は倒れた', better: false });
  if (cur.stars !== prev.stars) out.push({ text: `星 ${prev.stars} → ${cur.stars}`, better: cur.stars > prev.stars });
  if (prev.fell === 'none' && cur.fell === 'none') {
    const d = cur.driftCm - prev.driftCm;
    if (d !== 0) out.push({ text: `揺れ幅 ${prev.driftCm} → ${cur.driftCm} cm（${signed(d)}）`, better: d < 0 });
    if (cur.broken !== prev.broken) out.push({ text: `こわれた所 ${prev.broken} → ${cur.broken}`, better: cur.broken < prev.broken });
  }
  if (cur.height !== prev.height) out.push({ text: `高さ ${prev.height} → ${cur.height} m`, better: null });
  if (cur.cost !== prev.cost) out.push({ text: `費用 ${signed(cur.cost - prev.cost)} 万円`, better: cur.cost < prev.cost });
  return out;
}

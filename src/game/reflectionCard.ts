// ふりかえりを、名前・答え・ビルの画面をまとめた1枚の画像（PNG）にする。
// 生徒はこの画像を保存して、Classroom などで提出する。

export interface ReflectionCard {
  name: string;
  group: string;
  stageTitle: string;
  /** 最高記録など、記録の1行 */
  record: string;
  /** 書いた日（例：2026年11月10日） */
  date: string;
  questions: { text: string; answer: string }[];
  /** ビルの画面のスクリーンショット */
  shot: CanvasImageSource & { width: number; height: number };
}

export const CARD_WIDTH = 1200;
const PAD = 48;
const FONT = "'Zen Kaku Gothic New', 'Hiragino Sans', sans-serif";
const DISPLAY = "'Dela Gothic One', 'Hiragino Sans', sans-serif";
const INK = '#1f1f1f';
const YELLOW = '#f6c343';
const QUIET = '#6b6253';
const LINE = '#d8d0c0';

/** 文字を、幅に収まるように1文字ずつ折り返す（日本語は単語の区切りがないため）。改行はそのまま生かす */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  for (const para of text.replace(/\r\n?/g, '\n').split('\n')) {
    let line = '';
    for (const ch of Array.from(para)) {
      if (line && measure(line + ch) > maxWidth) {
        // 句読点や閉じかっこが行の頭に来ないよう、前の行に入れる
        if ('、。，．）」』！？・ー'.includes(ch)) {
          lines.push(line + ch);
          line = '';
          continue;
        }
        lines.push(line);
        line = ch;
      } else line += ch;
    }
    lines.push(line);
  }
  return lines;
}

/**
 * 保存するファイルの名前。日本語のファイル名は端末によって「download」などに変わってしまうことがあるので、
 * 英数字だけにする（名前は画像の中に入っている）
 */
export function cardFileName(now: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `furikaeri_${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}_${two(now.getHours())}${two(now.getMinutes())}.png`;
}

/** 画像に使う文字（フォント）を読みこんでから描く。読みこめなくても描けるようにする */
export async function loadCardFonts(sample: string): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load(`700 28px ${FONT}`, sample),
      document.fonts.load(`500 22px ${FONT}`, sample),
      document.fonts.load(`40px ${DISPLAY}`, '最高タワー工房ふりかえり'),
    ]);
  } catch {
    // 何もしない（ふつうの文字で描く）
  }
}

/** ふりかえりの画像を描いたキャンバスを返す */
export function drawReflectionCard(card: ReflectionCard): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const inner = CARD_WIDTH - PAD * 2;

  // 先に高さを計算する
  const shotMaxH = 620;
  const scale = Math.min(inner / card.shot.width, shotMaxH / card.shot.height);
  const shotW = Math.round(card.shot.width * scale);
  const shotH = Math.round(card.shot.height * scale);

  ctx.font = `700 24px ${FONT}`;
  const qLines = card.questions.map((q, i) => wrapText(`${i + 1}. ${q.text}`, inner, (s) => ctx.measureText(s).width));
  ctx.font = `500 24px ${FONT}`;
  const aLines = card.questions.map((q) => wrapText(q.answer.trim() || '（まだ書いていません）', inner - 32, (s) => ctx.measureText(s).width));
  const LH = 38;
  let qaHeight = 0;
  card.questions.forEach((_, i) => (qaHeight += qLines[i].length * LH + 8 + aLines[i].length * LH + 28));

  const headerH = 120;
  const height = headerH + 24 + 92 + shotH + 40 + qaHeight + PAD;
  canvas.width = CARD_WIDTH;
  canvas.height = Math.ceil(height);

  // 背景とヘッダー（工事現場の黄色と黒）
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, CARD_WIDTH, headerH - 16);
  stripes(ctx, 0, headerH - 16, CARD_WIDTH, 16);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = YELLOW;
  ctx.font = `40px ${DISPLAY}`;
  ctx.fillText('最高タワー工房', PAD, 54);
  const titleW = ctx.measureText('最高タワー工房').width;
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 30px ${FONT}`;
  ctx.fillText('ふりかえり', PAD + titleW + 20, 56);
  ctx.textAlign = 'right';
  ctx.font = `500 22px ${FONT}`;
  ctx.fillText(card.date, CARD_WIDTH - PAD, 56);
  ctx.textAlign = 'left';

  // 名前・組班・記録
  let y = headerH + 24;
  ctx.fillStyle = INK;
  ctx.font = `700 30px ${FONT}`;
  const who = `名前：${card.name || '　　　　'}` + (card.group ? `　　組・班：${card.group}` : '');
  ctx.fillText(fitOneLine(ctx, who, inner), PAD, y + 18);
  ctx.font = `500 22px ${FONT}`;
  ctx.fillStyle = QUIET;
  ctx.fillText(fitOneLine(ctx, `${card.stageTitle}　${card.record}`, inner), PAD, y + 62);
  y += 92;

  // ビルの画面
  const shotX = PAD + Math.round((inner - shotW) / 2);
  ctx.drawImage(card.shot, shotX, y, shotW, shotH);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.strokeRect(shotX, y, shotW, shotH);
  y += shotH + 40;

  // 問いと答え
  ctx.textBaseline = 'top';
  card.questions.forEach((q, i) => {
    ctx.fillStyle = INK;
    ctx.font = `700 24px ${FONT}`;
    for (const l of qLines[i]) {
      ctx.fillText(l, PAD, y);
      y += LH;
    }
    y += 8;
    const boxH = aLines[i].length * LH;
    ctx.fillStyle = YELLOW;
    ctx.fillRect(PAD, y - 4, 6, boxH);
    ctx.fillStyle = q.answer.trim() ? INK : QUIET;
    ctx.font = `500 24px ${FONT}`;
    for (const l of aLines[i]) {
      ctx.fillText(l, PAD + 32, y);
      y += LH;
    }
    y += 28;
    if (i < card.questions.length - 1) {
      ctx.fillStyle = LINE;
      ctx.fillRect(PAD, y - 16, inner, 1);
    }
  });
  return canvas;
}

function stripes(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = YELLOW;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = INK;
  for (let sx = x - h; sx < x + w + h; sx += 28) {
    ctx.beginPath();
    ctx.moveTo(sx, y + h);
    ctx.lineTo(sx + h, y);
    ctx.lineTo(sx + h + 14, y);
    ctx.lineTo(sx + 14, y + h);
    ctx.fill();
  }
  ctx.restore();
}

/** 1行に入らないときは、末尾を「…」にする */
function fitOneLine(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const chars = Array.from(text);
  while (chars.length && ctx.measureText(chars.join('') + '…').width > maxWidth) chars.pop();
  return chars.join('') + '…';
}

/** キャンバスを PNG のファイルにする */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像にできませんでした'))), 'image/png'));
}

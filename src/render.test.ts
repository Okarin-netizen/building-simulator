import { describe, expect, it } from 'vitest';
import { LOUPE, loupeCenter, loupeZoom, makeViewport } from './render';

describe('指で操作するときのルーペ', () => {
  const r = LOUPE.radius;

  it('ふつうは指の真上に出て、指と重ならない', () => {
    const c = loupeCenter(200, 300, 390, 400);
    expect(c.x).toBe(200);
    expect(300 - c.y).toBeGreaterThanOrEqual(r + 20);
  });

  it('上に場所がないときは横に出て、画面からはみ出さない', () => {
    for (const x of [10, 200, 380]) {
      const c = loupeCenter(x, 40, 390, 400);
      expect(Math.abs(c.x - x)).toBeGreaterThanOrEqual(r);
      expect(c.x - r).toBeGreaterThanOrEqual(0);
      expect(c.x + r).toBeLessThanOrEqual(390);
      expect(c.y - r).toBeGreaterThanOrEqual(0);
    }
  });

  it('スマホの小さな画面でも、ルーペの中の方眼1マスは 30px 以上', () => {
    const v = makeViewport(390, 300, 15);
    expect(v.scale * loupeZoom(v)).toBeGreaterThanOrEqual(30);
  });
});

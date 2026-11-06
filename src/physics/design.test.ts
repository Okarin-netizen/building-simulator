import { addMember, designCost, designHeight, emptyDesign, frameDesign, removeMember } from './design';
import { groundOffset, makeQuake } from './quake';

test('同じ2点に部材を置くと、増えずに材料が置き換わる', () => {
  const d = emptyDesign();
  addMember(d, 0, 0, 0, 3, 'wood');
  addMember(d, 0, 3, 0, 0, 'steel');
  expect(d.members).toHaveLength(1);
  expect(d.members[0].material).toBe('steel');
  expect(d.nodes).toHaveLength(2);
});

test('部材を消すと、どこにもつながらない節点も消える', () => {
  const d = emptyDesign();
  addMember(d, 0, 0, 0, 3, 'wood');
  addMember(d, 0, 3, 4, 3, 'wood');
  removeMember(d, 1);
  expect(d.nodes).toHaveLength(2);
  expect(d.members[0]).toMatchObject({ a: 0, b: 1 });
});

test('費用は 長さ × 材料の単価、高さは一番上の節点', () => {
  const d = frameDesign({ floors: 2, material: 'wood' }); // 柱 3m×4本 + 梁 4m×2本 = 20m
  expect(designCost(d)).toBe(20);
  expect(designHeight(d)).toBe(6);
});

test('地面は揺れの前後では動かない', () => {
  const q = makeQuake('strong');
  expect(groundOffset(q, -1)).toBe(0);
  expect(groundOffset(q, q.duration + 1)).toBe(0);
  expect(Math.abs(groundOffset(q, 5))).toBeGreaterThan(0);
});

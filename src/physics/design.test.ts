import { addMember, designCost, designHeight, emptyDesign, frameDesign, removeMember, setMemberMaterial } from './design';
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

test('置いた部材の材料をあとから変えると、形はそのままで費用が変わる', () => {
  const d = frameDesign({ floors: 1, material: 'wood' });
  const before = JSON.stringify({ nodes: d.nodes, ab: d.members.map((m) => [m.a, m.b]) });
  const cost = designCost(d);
  setMemberMaterial(d, 2, 'steel');
  expect(d.members[2].material).toBe('steel');
  expect(d.members.filter((m) => m.material === 'wood')).toHaveLength(2);
  expect(JSON.stringify({ nodes: d.nodes, ab: d.members.map((m) => [m.a, m.b]) })).toBe(before);
  expect(designCost(d)).toBeGreaterThan(cost);
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

test('長い柱を一度に引いても、途中の点で梁とつながる', () => {
  const d = emptyDesign();
  addMember(d, 0, 3, 4, 3, 'wood'); // 先に梁
  addMember(d, 0, 0, 0, 6, 'wood'); // 6mの柱は高さ3mの点を通る
  expect(d.members).toHaveLength(3);
  expect(d.nodes).toHaveLength(4);
  expect(designCost(d)).toBe(10);
});

test('既存の部材の途中に端を置くと、その部材も分かれてつながる', () => {
  const d = emptyDesign();
  addMember(d, 0, 0, 0, 6, 'steel'); // 先に6mの柱
  addMember(d, 0, 3, 4, 3, 'wood'); // 梁の端が柱の途中
  expect(d.members).toHaveLength(3);
  expect(d.members.filter((m) => m.material === 'steel')).toHaveLength(2);
  expect(designCost(d)).toBe(28);
});

test('長い部材で上からなぞると、途中で分かれた部材の材料がまとめて置き換わる', () => {
  const d = emptyDesign();
  addMember(d, 0, 0, 0, 3, 'concrete');
  addMember(d, 0, 3, 0, 6, 'concrete');
  addMember(d, 0, 0, 0, 6, 'steel');
  expect(d.members).toHaveLength(2);
  expect(d.members.every((m) => m.material === 'steel')).toBe(true);
});

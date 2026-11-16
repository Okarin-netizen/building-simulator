import { clearAllRecords, loadAttempts, loadClassForm, loadLastStage, loadProgress, recordResult, saveClassForm, saveLastStage } from './progress';

function stubStorage(): Map<string, string> {
  const m = new Map<string, string>();
  const s = {
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
  (globalThis as { localStorage?: unknown }).localStorage = s;
  return m;
}

describe('今までの記録を消す', () => {
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('星・最後のステージ・作りかけなどを消し、クラスの準備と音の設定とほかのアプリの保存は残す', () => {
    const m = stubStorage();
    recordResult('1-1', 3);
    saveLastStage('1-2');
    m.set('saikou-tower-design-1-1-v1', '{}');
    m.set('saikou-tower-attempts-v1', '[{"at":"x"}]');
    m.set('saikou-tower-sound-v1', 'on');
    m.set('other-app', 'keep');
    saveClassForm({ url: 'x' });

    clearAllRecords();

    expect(loadProgress()).toEqual({});
    expect(loadLastStage()).toBeNull();
    expect(loadAttempts()).toEqual([]);
    expect(m.has('saikou-tower-design-1-1-v1')).toBe(false);
    expect(m.get('saikou-tower-sound-v1')).toBe('on');
    expect(m.get('other-app')).toBe('keep');
    expect(loadClassForm()).toEqual({ url: 'x' });
  });

  it('保存が使えない環境でもエラーにしない', () => {
    expect(() => clearAllRecords()).not.toThrow();
  });
});

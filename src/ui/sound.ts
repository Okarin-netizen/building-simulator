// 効果音。教室で30台が一度に鳴るとうるさいので、はじめは音なし。「音を出す」を選んだ人だけ鳴らす。
// 音のファイルは使わず、その場で短い音を作る（読みこみ待ちがなく、アプリも軽いまま）。

const SOUND_KEY = 'saikou-tower-sound-v1';

export function loadSoundOn(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) === 'on';
  } catch {
    return false;
  }
}

export function saveSoundOn(on: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    // 保存できなくても遊べるようにする
  }
}

let ac: AudioContext | null = null;
let enabled = false;

export function setSoundOn(on: boolean): void {
  enabled = on;
}

function audio(): AudioContext | null {
  if (!enabled) return null;
  try {
    ac ??= new AudioContext();
    if (ac.state === 'suspended') void ac.resume();
    return ac;
  } catch {
    return null;
  }
}

/** 短い雑音（バキッ・ドスン）。高い音ほど軽く、低い音ほど重く聞こえる */
function noise(a: AudioContext, seconds: number, freq: number, gain: number): void {
  const len = Math.round(a.sampleRate * seconds);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = freq;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(a.destination);
  src.start();
}

function tone(a: AudioContext, freq: number, at: number, seconds: number, gain = 0.15, type: OscillatorType = 'triangle'): void {
  const o = a.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = a.createGain();
  const t = a.currentTime + at;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + seconds);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + seconds + 0.05);
}

export const sound = {
  /** 部材を置いた */
  place(): void {
    const a = audio();
    if (a) tone(a, 520, 0, 0.08, 0.08, 'square');
  },
  /** 最初に部材がこわれた */
  crack(): void {
    const a = audio();
    if (a) noise(a, 0.18, 4000, 0.5);
  },
  /** 建物が倒れた */
  collapse(): void {
    const a = audio();
    if (a) noise(a, 0.7, 400, 0.9);
  },
  /** 星が1つ光った（n 番目ほど高い音） */
  star(n: number): void {
    const a = audio();
    if (a) tone(a, [660, 880, 1100][Math.min(2, n)], 0, 0.25, 0.12);
  },
  /** 予想が当たった */
  hit(): void {
    const a = audio();
    if (!a) return;
    tone(a, 784, 0, 0.12, 0.12);
    tone(a, 1047, 0.1, 0.2, 0.12);
  },
};

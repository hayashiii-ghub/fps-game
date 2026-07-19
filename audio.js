'use strict';
/* ============================================================
   手続き音響システム（Web Audio API で全音を合成）
   ============================================================ */
const AudioSys = {
  ctx: null, master: null, noiseBuf: null,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.75;
    this.master.connect(this.ctx.destination);

    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this._wind();
  },

  get ok() { return !!this.ctx && this.ctx.state === 'running'; },
  get t() { return this.ctx ? this.ctx.currentTime : 0; },

  _finite(...vals) {
    return vals.every(v => typeof v === 'number' && Number.isFinite(v));
  },

  _noise(dur, filterType, freq, gain, rate, pan) {
    const amp = Number.isFinite(gain) ? Math.max(gain, 1e-4) : 0.05;
    const t0 = this.t;
    if (!this._finite(dur, freq, amp, t0) || dur <= 0) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = Number.isFinite(rate) && rate > 0 ? rate : 1;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(amp, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f); f.connect(g);
    let out = g;
    if (pan !== undefined && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Number.isFinite(pan) ? Math.max(-1, Math.min(1, pan)) : 0;
      g.connect(p); out = p;
    }
    out.connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.05);
    return f;
  },

  _tone(type, f0, f1, dur, gain) {
    const amp = Number.isFinite(gain) ? Math.max(gain, 1e-4) : 0.05;
    const t0 = this.t;
    if (!this._finite(dur, f0, amp, t0) || dur <= 0) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 && Number.isFinite(f1)) {
      o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + dur);
    }
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(amp, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  },

  /* プレイヤー銃声：鋭いクラック + 低いサンプ */
  shot() {
    if (!this.ok) return;
    const f = this._noise(0.16, 'lowpass', 3200, 0.85, 0.9 + Math.random() * 0.25);
    if (f) f.frequency.exponentialRampToValueAtTime(280, this.t + 0.13);
    this._tone('triangle', 120, 48, 0.09, 0.5);
  },

  /* スナイパーのボルトコッキング（射撃後のダウンタイム用） */
  bolt() {
    if (!this.ok) return;
    // ハンドル上げ
    this._metalAt(0.14, 520, 0.15, 0.07);
    this._clickAt(0.18, 700, 0.1);
    // ボルト引く＋薬莢排出感
    this._scrapeAt(0.28, 0.22, 950, 0.14);
    this._metalAt(0.42, 1400, 0.1, 0.05);  // エジェクションの軽い金属音
    this._thudAt(0.48, 140, 0.1);
    // 押し込み
    this._scrapeAt(0.58, 0.2, 1100, 0.13);
    // チャンバーロック
    this._metalAt(0.78, 680, 0.22, 0.1);
    this._clickAt(0.86, 1550, 0.13);
  },

  /* 敵の銃声：距離で減衰・パン付き */
  enemyShot(dist, pan) {
    if (!this.ok) return;
    const d = Number.isFinite(dist) ? dist : 40;
    const g = Math.min(0.5, 13 / Math.max(d, 4));
    const f = this._noise(0.22, 'lowpass', 950, g, 0.7 + Math.random() * 0.2, pan);
    if (f) f.frequency.exponentialRampToValueAtTime(160, this.t + 0.2);
  },

  /* 弾が頭の近くを通過する音 */
  crack(pan) {
    if (!this.ok) return;
    this._noise(0.045, 'highpass', 2600, 0.3, 1.6, pan || 0);
  },

  step(run) {
    if (!this.ok) return;
    this._noise(0.055, 'lowpass', run ? 700 : 480, run ? 0.11 : 0.06, 0.6 + Math.random() * 0.3);
  },

  /* 敵の足音：距離減衰＋パン */
  enemyStep(dist, pan, run) {
    if (!this.ok) return;
    const d = Number.isFinite(dist) ? dist : 30;
    const g = Math.min(run ? 0.13 : 0.09, 5.2 / Math.max(d, 2.5));
    if (g < 0.012) return;
    this._noise(0.05, 'lowpass', run ? 620 : 430, g, 0.55 + Math.random() * 0.3, pan);
  },

  /* 敵のリロード：短い金属音を距離減衰 */
  enemyReload(dist, pan) {
    if (!this.ok) return;
    const d = Number.isFinite(dist) ? dist : 25;
    const scale = Math.min(1, 14 / Math.max(d, 4));
    if (scale < 0.08) return;
    const amp = 0.11 * scale;
    this._noise(0.06, 'highpass', 1400, amp * 0.7, 1.1, pan);
    this._noise(0.1, 'bandpass', 780, amp, 0.85, pan);
    setTimeout(() => {
      if (!this.ok) return;
      this._noise(0.07, 'lowpass', 520, amp * 0.85, 0.7, pan);
    }, 220);
  },

  land() {
    if (!this.ok) return;
    this._noise(0.12, 'lowpass', 350, 0.25, 0.5);
  },

  /* ヒットマーカー音。kill 時は重め */
  hitmark(kill) {
    if (!this.ok) return;
    this._tone('square', kill ? 620 : 1750, kill ? 300 : 1750, kill ? 0.09 : 0.03, 0.14);
    if (kill) this._noise(0.1, 'lowpass', 500, 0.2, 0.5);
  },

  headshot() {
    if (!this.ok) return;
    this._tone('square', 2400, 1800, 0.05, 0.13);
  },

  hurt() {
    if (!this.ok) return;
    this._noise(0.18, 'lowpass', 420, 0.45, 0.55);
    this._tone('sine', 95, 55, 0.16, 0.4);
  },

  _clickAt(delay, freq, gain) {
    const t0 = this.t + (Number.isFinite(delay) ? delay : 0);
    const amp = Number.isFinite(gain) ? gain : 0.16;
    if (!this._finite(t0, freq, amp)) return;
    const o = this.ctx.createOscillator();
    o.type = 'square'; o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(amp, 1e-4), t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.04);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + 0.07);
  },

  /** 金属ヒット（短いノイズ＋減衰トーン） */
  _metalAt(delay, freq, gain, dur) {
    const t0 = this.t + (Number.isFinite(delay) ? delay : 0);
    const d = Number.isFinite(dur) && dur > 0 ? dur : 0.08;
    const amp = Number.isFinite(gain) && gain > 0 ? gain : 0.18;
    if (!this._finite(t0, freq, amp, d)) return;
    // アタックのシャリ
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 1.4;
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'highpass'; nf.frequency.value = freq * 0.8;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t0);
    ng.gain.exponentialRampToValueAtTime(amp * 0.7, t0 + 0.004);
    ng.gain.exponentialRampToValueAtTime(0.001, t0 + d * 0.55);
    src.connect(nf); nf.connect(ng); ng.connect(this.master);
    src.start(t0); src.stop(t0 + d);
    // 金属の響き
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(freq * 0.55, 40), t0 + d);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.0001, t0);
    og.gain.exponentialRampToValueAtTime(amp, t0 + 0.003);
    og.gain.exponentialRampToValueAtTime(0.001, t0 + d);
    o.connect(og); og.connect(this.master);
    o.start(t0); o.stop(t0 + d + 0.02);
  },

  /** 金属が擦れるスクレイプ */
  _scrapeAt(delay, dur, freq, gain) {
    const t0 = this.t + (Number.isFinite(delay) ? delay : 0);
    const d = Number.isFinite(dur) && dur > 0.04 ? dur : 0.12;
    const amp = Number.isFinite(gain) && gain > 0 ? gain : 0.12;
    if (!this._finite(t0, freq, amp, d)) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.95 + Math.random() * 0.2;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(freq, t0);
    f.frequency.linearRampToValueAtTime(freq * 1.35, t0 + d);
    f.Q.value = 1.2;
    const g = this.ctx.createGain();
    const mid = Math.min(d * 0.7, d - 0.02);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(amp, t0 + Math.min(0.03, d * 0.25));
    g.gain.setValueAtTime(amp, t0 + mid);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + d);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + d + 0.02);
  },

  /** マガジンの鈍い衝突音 */
  _thudAt(delay, freq, gain) {
    const t0 = this.t + (Number.isFinite(delay) ? delay : 0);
    const amp = Number.isFinite(gain) && gain > 0 ? gain : 0.22;
    if (!this._finite(t0, freq, amp)) return;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(freq * 0.4, 30), t0 + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(amp, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + 0.16);
    // プラスチック感の短いノイズ
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'lowpass'; nf.frequency.value = 900;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t0);
    ng.gain.exponentialRampToValueAtTime(amp * 0.45, t0 + 0.006);
    ng.gain.exponentialRampToValueAtTime(0.001, t0 + 0.07);
    src.connect(nf); nf.connect(ng); ng.connect(this.master);
    src.start(t0); src.stop(t0 + 0.09);
  },

  reload(reloadDur) {
    if (!this.ok) return;
    // 武器のリロード尺に合わせてタイミングを伸縮（基準 2.1s）
    // ※ NaN は truthy なので Number.isFinite で見る
    const s = Number.isFinite(reloadDur)
      ? Math.max(0.55, Math.min(1.35, reloadDur / 2.1))
      : 1;
    // マガジンキャッチ解放
    this._metalAt(0.04 * s, 1350, 0.14, 0.06);
    this._clickAt(0.08 * s, 980, 0.1);
    // マガジン抜き
    this._scrapeAt(0.28 * s, 0.22 * s, 700, 0.1);
    this._thudAt(0.48 * s, 160, 0.16);
    // 新マガジン挿入
    this._scrapeAt(1.05 * s, 0.18 * s, 850, 0.11);
    this._thudAt(1.28 * s, 220, 0.24);
    this._metalAt(1.38 * s, 1100, 0.16, 0.07);
    // チャージハンドル／ボルト前進
    this._scrapeAt(1.72 * s, 0.14 * s, 1200, 0.13);
    this._metalAt(1.88 * s, 780, 0.2, 0.09);
    this._clickAt(1.95 * s, 1600, 0.12);
  },

  dry() {
    if (!this.ok) return;
    this._clickAt(0, 1700);
  },

  pickup() {
    if (!this.ok) return;
    this._tone('sine', 620, 620, 0.07, 0.14);
    setTimeout(() => this.ok && this._tone('sine', 880, 880, 0.09, 0.14), 80);
  },

  /* ウェーブ開始ホーン */
  wave() {
    if (!this.ok) return;
    this._tone('sawtooth', 98, 98, 0.7, 0.2);
    this._tone('sawtooth', 147, 147, 0.7, 0.14);
  },

  /* 遠くの爆発（環境音） */
  boom() {
    if (!this.ok) return;
    const f = this._noise(1.4, 'lowpass', 130, 0.16, 0.35, (Math.random() * 2 - 1) * 0.7);
    if (f) f.frequency.exponentialRampToValueAtTime(40, this.t + 1.2);
    this._tone('sine', 48, 30, 1.1, 0.12);
  },

  nadeThrow() {
    if (!this.ok) return;
    this._clickAt(0, 900);
    this._noise(0.08, 'highpass', 1800, 0.08, 1.2);
  },

  /* 近くの手榴弾爆発 */
  grenade() {
    if (!this.ok) return;
    const f = this._noise(0.9, 'lowpass', 420, 0.85, 0.45);
    if (f) f.frequency.exponentialRampToValueAtTime(55, this.t + 0.7);
    this._tone('sine', 70, 28, 0.55, 0.45);
    this._noise(0.35, 'highpass', 900, 0.25, 0.8);
  },

  /* 環境風ノイズ（ループ） */
  _wind() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 320; f.Q.value = 0.4;
    const g = this.ctx.createGain(); g.gain.value = 0.045;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.09;
    const lg = this.ctx.createGain(); lg.gain.value = 0.025;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(); lfo.start();
  },
};

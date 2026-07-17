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

  _noise(dur, filterType, freq, gain, rate, pan) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = rate || 1;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, this.t);
    g.gain.exponentialRampToValueAtTime(0.001, this.t + dur);
    src.connect(f); f.connect(g);
    let out = g;
    if (pan !== undefined && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p;
    }
    out.connect(this.master);
    src.start(this.t); src.stop(this.t + dur + 0.05);
    return f;
  },

  _tone(type, f0, f1, dur, gain) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, this.t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), this.t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, this.t);
    g.gain.exponentialRampToValueAtTime(0.001, this.t + dur);
    o.connect(g); g.connect(this.master);
    o.start(this.t); o.stop(this.t + dur + 0.05);
  },

  /* プレイヤー銃声：鋭いクラック + 低いサンプ */
  shot() {
    if (!this.ok) return;
    const f = this._noise(0.16, 'lowpass', 3200, 0.85, 0.9 + Math.random() * 0.25);
    f.frequency.exponentialRampToValueAtTime(280, this.t + 0.13);
    this._tone('triangle', 120, 48, 0.09, 0.5);
  },

  /* 敵の銃声：距離で減衰・パン付き */
  enemyShot(dist, pan) {
    if (!this.ok) return;
    const g = Math.min(0.5, 13 / Math.max(dist, 4));
    const f = this._noise(0.22, 'lowpass', 950, g, 0.7 + Math.random() * 0.2, pan || 0);
    f.frequency.exponentialRampToValueAtTime(160, this.t + 0.2);
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

  _clickAt(delay, freq) {
    const o = this.ctx.createOscillator();
    o.type = 'square'; o.frequency.value = freq;
    const g = this.ctx.createGain();
    const t0 = this.t + delay;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.045);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + 0.08);
  },

  reload() {
    if (!this.ok) return;
    this._clickAt(0.05, 1150);  // マガジン解放
    this._clickAt(0.5, 750);    // マガジン排出
    this._clickAt(1.35, 900);   // 装填
    this._clickAt(1.8, 1600);   // ボルト前進
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
    f.frequency.exponentialRampToValueAtTime(40, this.t + 1.2);
    this._tone('sine', 48, 30, 1.1, 0.12);
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

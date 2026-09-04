/**
 * slice: AudioSys の音量・ミュートは master.gain に即反映され、localStorage に残る
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'audio.js'), 'utf8');

function param(value = 0) {
  return {
    value,
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
    linearRampToValueAtTime() {},
  };
}

function node() {
  return {
    connect() { return this; },
    start() {},
    stop() {},
    buffer: null,
    loop: false,
    type: 'sine',
    playbackRate: param(1),
    frequency: param(440),
    Q: param(1),
    pan: param(0),
    gain: param(1),
  };
}

class FakeCtx {
  constructor() {
    this.state = 'running';
    this.sampleRate = 8000;
    this.currentTime = 0;
    this.destination = node();
  }
  createGain() { return node(); }
  createBuffer(ch, len) {
    const data = new Float32Array(len);
    return { getChannelData: () => data };
  }
  createBufferSource() { return node(); }
  createBiquadFilter() { return node(); }
  createOscillator() { return node(); }
  createStereoPanner() { return node(); }
  resume() { this.state = 'running'; return Promise.resolve(); }
}

function loadAudio(store = {}) {
  const localStorage = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
  };
  const sandbox = {
    console,
    Math,
    JSON,
    localStorage,
    window: { AudioContext: FakeCtx, webkitAudioContext: FakeCtx },
  };
  sandbox.window.localStorage = localStorage;
  sandbox.localStorage = localStorage;
  vm.createContext(sandbox);
  new vm.Script(SRC, { filename: 'audio.js' }).runInContext(sandbox);
  return { AudioSys: vm.runInContext('AudioSys', sandbox), store };
}

{
  const { AudioSys } = loadAudio();
  assert.equal(AudioSys.volume, 0.75);
  assert.equal(AudioSys.muted, false);
  AudioSys.init();
  assert.equal(AudioSys.master.gain.value, 0.75);
}

{
  const { AudioSys, store } = loadAudio();
  AudioSys.init();
  AudioSys.setVolume(0.4);
  assert.equal(AudioSys.volume, 0.4);
  assert.equal(AudioSys.master.gain.value, 0.4);
  assert.equal(store.kgfps_audio_vol, '0.4');
  AudioSys.setMuted(true);
  assert.equal(AudioSys.muted, true);
  assert.equal(AudioSys.master.gain.value, 0);
  assert.equal(store.kgfps_audio_mute, '1');
  AudioSys.setMuted(false);
  assert.equal(AudioSys.master.gain.value, 0.4);
}

{
  const { AudioSys } = loadAudio();
  AudioSys.setVolume(2);
  assert.equal(AudioSys.volume, 1);
  AudioSys.setVolume(-0.2);
  assert.equal(AudioSys.volume, 0);
  const prev = AudioSys.volume;
  AudioSys.setVolume(Number.NaN);
  assert.equal(AudioSys.volume, prev);
}

{
  const { AudioSys } = loadAudio({ kgfps_audio_vol: '0.2', kgfps_audio_mute: '1' });
  assert.equal(AudioSys.volume, 0.2);
  assert.equal(AudioSys.muted, true);
  AudioSys.init();
  assert.equal(AudioSys.master.gain.value, 0);
  AudioSys.toggleMute();
  assert.equal(AudioSys.muted, false);
  assert.equal(AudioSys.master.gain.value, 0.2);
}

{
  const { AudioSys } = loadAudio({ kgfps_audio_vol: 'nope', kgfps_audio_mute: '0' });
  assert.equal(AudioSys.volume, 0.75);
  assert.equal(AudioSys.muted, false);
}

{
  const { AudioSys } = loadAudio();
  AudioSys.setVolume(0.3);
  AudioSys.setMuted(true);
  AudioSys.init();
  assert.equal(AudioSys.master.gain.value, 0);
  AudioSys.setMuted(false);
  assert.equal(AudioSys.master.gain.value, 0.3);
}

console.log('ok audio-prefs');

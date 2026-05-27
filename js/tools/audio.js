// ============================================================
//  GODEYE — Audio System (Web Audio API, no external files)
// ============================================================
const AUDIO = (() => {
  let ctx = null;
  let ambientNodes = null;
  let enabled = false;

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  function createAmbient() {
    const c = getCtx();
    const master = c.createGain();
    master.gain.value = 0.08;
    master.connect(c.destination);

    // 55Hz drone
    const osc1 = c.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 55;
    const g1 = c.createGain(); g1.gain.value = 0.4;
    osc1.connect(g1); g1.connect(master);
    osc1.start();

    // 110Hz sub
    const osc2 = c.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 110;
    const g2 = c.createGain(); g2.gain.value = 0.2;
    osc2.connect(g2); g2.connect(master);
    osc2.start();

    // Brown noise
    const bufSize = c.sampleRate * 2;
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bufSize; i++) {
      const w = Math.random() * 2 - 1;
      data[i] = (last + 0.02 * w) / 1.02;
      last = data[i];
      data[i] *= 3.5;
    }
    const noise = c.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const gn = c.createGain(); gn.gain.value = 0.06;
    noise.connect(gn); gn.connect(master);
    noise.start();

    return { master, osc1, osc2, noise };
  }

  function stopAmbient() {
    if (!ambientNodes) return;
    try {
      ambientNodes.osc1.stop();
      ambientNodes.osc2.stop();
      ambientNodes.noise.stop();
      ambientNodes.master.disconnect();
    } catch(e) {}
    ambientNodes = null;
  }

  function shortTone(freq, duration, type = 'sine', vol = 0.15) {
    if (!enabled) return;
    const c = getCtx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + duration);
  }

  return {
    toggle() {
      enabled = !enabled;
      STATE.audioEnabled = enabled;
      if (enabled) {
        if (!ambientNodes) ambientNodes = createAmbient();
        if (ctx && ctx.state === 'suspended') ctx.resume();
      } else {
        stopAmbient();
      }
      document.getElementById('btn-audio').textContent = enabled ? '🔊' : '🔇';
      STATE.savePrefs();
    },

    aircraftPing()     { shortTone(880, 0.12, 'sine', 0.08); },
    conflictAlert()    {
      shortTone(660, 0.2, 'triangle', 0.15);
      setTimeout(() => shortTone(550, 0.2, 'triangle', 0.12), 220);
      setTimeout(() => shortTone(440, 0.3, 'triangle', 0.10), 440);
    },
    earthquakeRumble() {
      if (!enabled) return;
      const c = getCtx();
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(40, c.currentTime);
      osc.frequency.exponentialRampToValueAtTime(20, c.currentTime + 1.5);
      g.gain.setValueAtTime(0, c.currentTime);
      g.gain.linearRampToValueAtTime(0.3, c.currentTime + 0.1);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 1.5);
      osc.connect(g); g.connect(c.destination);
      osc.start(); osc.stop(c.currentTime + 1.5);
    },
    breakingNewsAlert() {
      shortTone(1047, 0.15, 'square', 0.1);
      setTimeout(() => shortTone(1319, 0.2, 'square', 0.1), 180);
    },
    isEnabled() { return enabled; },
  };
})();

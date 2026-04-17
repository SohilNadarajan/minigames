let ctx: AudioContext | null = null;
let unlockBound = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx =
    window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!ctx) ctx = new AudioCtx();
  return ctx;
}

function tryUnlock() {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") {
    void c.resume().catch(() => {
      // Ignore unlock errors; sound is best-effort.
    });
  }
}

function bindUnlockHandlers() {
  if (typeof window === "undefined" || unlockBound) return;
  unlockBound = true;
  const opts: AddEventListenerOptions = { passive: true };
  const onceUnlock = () => tryUnlock();
  window.addEventListener("pointerdown", onceUnlock, opts);
  window.addEventListener("keydown", onceUnlock, opts);
}

function withGainEnvelope(
  c: AudioContext,
  durationSec: number,
  shape: (gain: GainNode, now: number) => void
) {
  const gain = c.createGain();
  const now = c.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(0.0001, now);
  shape(gain, now);
  gain.connect(c.destination);
  return { gain, now, endAt: now + durationSec };
}

export function playClickSfx() {
  bindUnlockHandlers();
  const c = getCtx();
  if (!c) return;
  tryUnlock();
  if (c.state !== "running") return;

  const osc = c.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(1400, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(780, c.currentTime + 0.028);

  const { gain, now, endAt } = withGainEnvelope(c, 0.04, (g, n) => {
    g.gain.setValueAtTime(0.0001, n);
    g.gain.exponentialRampToValueAtTime(0.04, n + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, n + 0.04);
  });

  osc.connect(gain);
  osc.start(now);
  osc.stop(endAt);
}

export function playDingSfx() {
  bindUnlockHandlers();
  const c = getCtx();
  if (!c) return;
  tryUnlock();
  if (c.state !== "running") return;

  const osc = c.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(860, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1320, c.currentTime + 0.11);

  const { gain, now, endAt } = withGainEnvelope(c, 0.18, (g, n) => {
    g.gain.setValueAtTime(0.0001, n);
    g.gain.exponentialRampToValueAtTime(0.055, n + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, n + 0.18);
  });

  osc.connect(gain);
  osc.start(now);
  osc.stop(endAt);
}

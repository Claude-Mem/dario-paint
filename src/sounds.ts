// Tiny Mario Paint-ish blips made with WebAudio, so there are no sound files to ship.

let audioContext: AudioContext | null = null;
let soundIsOn = true;
try {
  soundIsOn = localStorage.getItem("skill-editor-sound") !== "off";
} catch {
  // Storage can be unavailable (private window); sound just defaults to on.
}

export function isSoundOn(): boolean {
  return soundIsOn;
}

export function setSoundOn(shouldPlaySound: boolean): void {
  soundIsOn = shouldPlaySound;
  try {
    localStorage.setItem("skill-editor-sound", shouldPlaySound ? "on" : "off");
  } catch {
    // Not remembering the choice is fine.
  }
}

function sharedAudioContext(): AudioContext {
  audioContext ??= new AudioContext();
  return audioContext;
}

function tone(startFrequency: number, endFrequency: number, durationSeconds: number, waveType: OscillatorType, volume: number, delaySeconds = 0): void {
  const context = sharedAudioContext();
  const startTime = context.currentTime + delaySeconds;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = waveType;
  oscillator.frequency.setValueAtTime(startFrequency, startTime);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, startTime + durationSeconds);
  gain.gain.setValueAtTime(volume, startTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSeconds);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + durationSeconds);
}

function noiseBurst(durationSeconds: number, volume: number, centreFrequency: number, delaySeconds = 0): void {
  const context = sharedAudioContext();
  const frameCount = Math.floor(context.sampleRate * durationSeconds);
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) samples[frameIndex] = (Math.random() * 2 - 1) * (1 - frameIndex / frameCount);
  const source = context.createBufferSource();
  source.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = centreFrequency;
  const gain = context.createGain();
  gain.gain.value = volume;
  source.connect(filter).connect(gain).connect(context.destination);
  source.start(context.currentTime + delaySeconds);
}

function whenSoundIsOn(playSound: () => void): () => void {
  return () => {
    if (soundIsOn) playSound();
  };
}

export const sounds = {
  stampThunk: whenSoundIsOn(() => {
    tone(190, 70, 0.09, "square", 0.07);
    noiseBurst(0.05, 0.05, 400);
  }),
  thinkingTick: whenSoundIsOn(() => tone(660, 660, 0.04, "triangle", 0.025)),
  poof: whenSoundIsOn(() => noiseBurst(0.35, 0.09, 900)),
  sparkle: whenSoundIsOn(() => [988, 1319, 1568, 1976].forEach((frequency, noteIndex) => tone(frequency, frequency, 0.09, "triangle", 0.05, noteIndex * 0.06))),
  erase: whenSoundIsOn(() => [0, 1, 2, 3].forEach((rubIndex) => noiseBurst(0.06, 0.06, 2600, rubIndex * 0.07))),
  happier: whenSoundIsOn(() => tone(392, 784, 0.18, "square", 0.05)),
  sadder: whenSoundIsOn(() => tone(392, 185, 0.32, "square", 0.05)),
  nothingToDo: whenSoundIsOn(() => tone(220, 220, 0.08, "square", 0.04)),
  woof: whenSoundIsOn(() => {
    tone(340, 220, 0.09, "square", 0.07);
    tone(340, 200, 0.1, "square", 0.07, 0.14);
  }),
  saved: whenSoundIsOn(() => [523, 659, 784, 1047].forEach((frequency, noteIndex) => tone(frequency, frequency, 0.09, "square", 0.04, noteIndex * 0.08))),
  oops: whenSoundIsOn(() => tone(200, 90, 0.4, "sawtooth", 0.05)),
};

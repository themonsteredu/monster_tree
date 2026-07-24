export type BlockWorldSfx =
  | "jump"
  | "coin"
  | "box"
  | "item"
  | "shoot"
  | "enemy"
  | "damage"
  | "portal"
  | "correct"
  | "wrong"
  | "clear"
  | "gameOver";

type AudioContextWithWebkit = typeof AudioContext & {
  webkitAudioContext?: typeof AudioContext;
};

type Note = number | null;

type StageSong = {
  bpm: number;
  lead: Note[];
  bass: Note[];
};

const SONGS: StageSong[] = [
  {
    bpm: 148,
    lead: [72, 76, 79, 76, 74, 72, 69, 67, 72, 74, 76, 79, 81, 79, 76, 74],
    bass: [48, null, 48, null, 50, null, 43, null, 48, null, 45, null, 41, null, 43, null],
  },
  {
    bpm: 126,
    lead: [64, 67, 71, 67, 62, 64, 67, null, 59, 62, 64, 67, 69, 67, 64, null],
    bass: [40, null, 43, null, 38, null, 40, null, 35, null, 38, null, 40, null, 43, null],
  },
  {
    bpm: 156,
    lead: [57, 60, 64, 65, 64, 60, 57, 53, 57, 60, 65, 67, 65, 64, 60, 57],
    bass: [33, null, 36, null, 29, null, 31, null, 33, null, 36, null, 29, null, 28, null],
  },
];

function midiToHz(note: number) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

export class BlockWorldAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private scheduler: number | null = null;
  private nextNoteAt = 0;
  private step = 0;
  private stageIndex = 0;
  private running = false;
  private muted = false;

  async start(stageIndex = 0) {
    this.stageIndex = stageIndex;
    const context = this.ensureContext();
    if (!context) return;
    if (context.state === "suspended") await context.resume();
    this.running = true;
    this.nextNoteAt = context.currentTime + 0.04;
    this.step = 0;
    this.startScheduler();
  }

  setStage(stageIndex: number) {
    this.stageIndex = Math.max(0, Math.min(SONGS.length - 1, stageIndex));
    this.step = 0;
    if (this.context) this.nextNoteAt = this.context.currentTime + 0.05;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(muted ? 0 : 0.72, now, 0.025);
  }

  getMuted() {
    return this.muted;
  }

  pauseMusic() {
    if (!this.context || !this.musicGain) return;
    this.musicGain.gain.setTargetAtTime(0.025, this.context.currentTime, 0.08);
  }

  resumeMusic() {
    if (!this.context || !this.musicGain) return;
    this.musicGain.gain.setTargetAtTime(0.26, this.context.currentTime, 0.08);
  }

  stop() {
    this.running = false;
    if (this.scheduler !== null && typeof window !== "undefined") {
      window.clearInterval(this.scheduler);
      this.scheduler = null;
    }
    if (this.context && this.musicGain) {
      this.musicGain.gain.setTargetAtTime(0.0001, this.context.currentTime, 0.04);
    }
  }

  dispose() {
    this.stop();
    const context = this.context;
    this.context = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    if (context && context.state !== "closed") void context.close();
  }

  playSfx(kind: BlockWorldSfx) {
    const context = this.ensureContext();
    if (!context || !this.sfxGain || this.muted) return;
    const now = context.currentTime;
    const note = (frequency: number, duration: number, offset = 0, type: OscillatorType = "square", volume = 0.16) => {
      this.tone(frequency, now + offset, duration, type, volume, this.sfxGain!);
    };

    switch (kind) {
      case "jump":
        this.sweep(180, 430, now, 0.12, "square", 0.1);
        break;
      case "coin":
        note(988, 0.055, 0, "square", 0.11);
        note(1319, 0.09, 0.055, "square", 0.1);
        break;
      case "box":
        note(220, 0.045, 0, "square", 0.12);
        note(440, 0.08, 0.04, "square", 0.12);
        break;
      case "item":
        [659, 784, 988, 1319].forEach((frequency, index) => note(frequency, 0.075, index * 0.055, "square", 0.1));
        break;
      case "shoot":
        this.sweep(760, 230, now, 0.09, "sawtooth", 0.075);
        break;
      case "enemy":
        note(180, 0.06, 0, "square", 0.13);
        note(120, 0.09, 0.055, "square", 0.12);
        break;
      case "damage":
        this.sweep(360, 75, now, 0.28, "sawtooth", 0.13);
        break;
      case "portal":
        [523, 659, 784, 1047].forEach((frequency, index) => note(frequency, 0.11, index * 0.07, "square", 0.11));
        break;
      case "correct":
        [659, 831, 988].forEach((frequency, index) => note(frequency, 0.11, index * 0.075, "square", 0.12));
        break;
      case "wrong":
        note(196, 0.12, 0, "square", 0.13);
        note(147, 0.18, 0.1, "square", 0.12);
        break;
      case "clear":
        [523, 659, 784, 1047, 1319].forEach((frequency, index) => note(frequency, 0.18, index * 0.1, index % 2 ? "triangle" : "square", 0.12));
        break;
      case "gameOver":
        [392, 330, 262, 196].forEach((frequency, index) => note(frequency, 0.2, index * 0.13, "square", 0.11));
        break;
    }
  }

  private ensureContext() {
    if (this.context) return this.context;
    if (typeof window === "undefined") return null;
    const AudioContextCtor = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as AudioContextWithWebkit | undefined;
    if (!AudioContextCtor) return null;

    const context = new AudioContextCtor();
    const master = context.createGain();
    const musicGain = context.createGain();
    const sfxGain = context.createGain();
    master.gain.value = this.muted ? 0 : 0.72;
    musicGain.gain.value = 0.26;
    sfxGain.gain.value = 0.72;
    musicGain.connect(master);
    sfxGain.connect(master);
    master.connect(context.destination);
    this.context = context;
    this.master = master;
    this.musicGain = musicGain;
    this.sfxGain = sfxGain;
    return context;
  }

  private startScheduler() {
    if (this.scheduler !== null || typeof window === "undefined") return;
    this.scheduler = window.setInterval(() => this.scheduleMusic(), 45);
    this.scheduleMusic();
  }

  private scheduleMusic() {
    const context = this.context;
    const musicGain = this.musicGain;
    if (!context || !musicGain || !this.running) return;
    const song = SONGS[this.stageIndex] ?? SONGS[0];
    const stepDuration = 60 / song.bpm / 2;

    while (this.nextNoteAt < context.currentTime + 0.18) {
      const index = this.step % song.lead.length;
      const lead = song.lead[index];
      const bass = song.bass[index % song.bass.length];
      if (lead !== null) this.tone(midiToHz(lead), this.nextNoteAt, stepDuration * 0.78, "square", 0.055, musicGain);
      if (bass !== null) this.tone(midiToHz(bass), this.nextNoteAt, stepDuration * 0.88, "triangle", 0.07, musicGain);
      if (index % 4 === 0) this.noiseTick(this.nextNoteAt, 0.03, musicGain);
      this.nextNoteAt += stepDuration;
      this.step += 1;
    }
  }

  private tone(
    frequency: number,
    start: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    destination: AudioNode,
  ) {
    const context = this.context;
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.025);
  }

  private sweep(
    from: number,
    to: number,
    start: number,
    duration: number,
    type: OscillatorType,
    volume: number,
  ) {
    const context = this.context;
    const destination = this.sfxGain;
    if (!context || !destination) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.025);
  }

  private noiseTick(start: number, duration: number, destination: AudioNode) {
    const context = this.context;
    if (!context) return;
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.setValueAtTime(0.018, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(gain);
    gain.connect(destination);
    source.start(start);
  }
}

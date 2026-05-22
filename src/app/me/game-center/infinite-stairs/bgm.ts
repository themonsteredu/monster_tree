// 무한의계단 BGM — Web Audio API 로 칩튠 스타일 루프 + 효과음 직접 생성.
// 외부 음원 파일 없음 → 라이선스/호스팅 불필요. 단점: 단순한 음색.
//
// 모바일 브라우저 정책상 AudioContext 는 사용자 제스처 이후에만 시작 가능.
// 따라서 start() 는 반드시 탭/클릭 이벤트 핸들러 안에서 호출돼야 한다.

const A_MINOR_BASS: (number | null)[] = [
  // 16 step / bar — 4 분음표 4개 (A E G E)
  45, null, null, null, 40, null, null, null,
  43, null, null, null, 40, null, null, null,
];

const A_MINOR_LEAD: (number | null)[] = [
  // 16 step — 8 분음표로 A 단조 펜타토닉 진행
  69, null, 72, null, 76, null, 72, null,
  74, null, 72, null, 76, null, 79, null,
];

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private running = false;
  private muted = false;
  private schedulerId: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private readonly bpm = 118;

  private ensure() {
    if (this.ctx) return;
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = 0.12;
    this.bgmGain.connect(this.master);
  }

  /** 사용자 제스처(탭 등) 안에서 호출. 이미 재생 중이면 무시. */
  startBgm() {
    this.ensure();
    if (!this.ctx || !this.bgmGain) return;
    if (this.ctx.state === "suspended") void this.ctx.resume();
    if (this.running) return;
    this.running = true;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.step = 0;
    this.tick();
  }

  stopBgm() {
    this.running = false;
    if (this.schedulerId !== null) {
      window.clearTimeout(this.schedulerId);
      this.schedulerId = null;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) {
      this.master.gain.setTargetAtTime(
        m ? 0 : 1,
        this.ctx?.currentTime ?? 0,
        0.05,
      );
    }
  }
  isMuted() {
    return this.muted;
  }

  dispose() {
    this.stopBgm();
    if (this.ctx) {
      try {
        void this.ctx.close();
      } catch {
        // ignore
      }
    }
    this.ctx = null;
    this.master = null;
    this.bgmGain = null;
  }

  // 효과음 — 정답 탭
  sfxStep() {
    this.beep(880, 0.08, "triangle", 0.18);
  }

  // 효과음 — 콤보 갱신 (높은 톤)
  sfxCombo(combo: number) {
    const base = 880 + Math.min(combo, 20) * 60;
    this.beep(base, 0.12, "square", 0.18);
    this.beep(base * 1.5, 0.12, "square", 0.1, 0.04);
  }

  // 효과음 — 피격 (목숨 -1)
  sfxHurt() {
    this.ensure();
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.28);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.22, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.34);
  }

  // 효과음 — 게임오버 (하강 톤)
  sfxGameOver() {
    this.ensure();
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.55);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.3, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.65);
  }

  private beep(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    delay = 0,
  ) {
    this.ensure();
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private playBgmNote(
    midi: number,
    time: number,
    dur: number,
    type: OscillatorType,
    gain: number,
  ) {
    if (!this.ctx || !this.bgmGain) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = midiToHz(midi);
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(gain, time + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(g).connect(this.bgmGain);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  // 스케줄러 — lookahead 방식으로 시퀀스를 부드럽게 재생.
  private tick = () => {
    if (!this.ctx || !this.running) return;
    const lookahead = 0.12;
    const stepDur = 60 / this.bpm / 4; // 16분음표 길이 (초)
    while (this.nextNoteTime < this.ctx.currentTime + lookahead) {
      const s = this.step % 16;
      const bass = A_MINOR_BASS[s];
      const lead = A_MINOR_LEAD[s];
      if (bass !== null && bass !== undefined) {
        this.playBgmNote(bass, this.nextNoteTime, 0.25, "sawtooth", 0.18);
      }
      if (lead !== null && lead !== undefined) {
        this.playBgmNote(lead, this.nextNoteTime, 0.18, "square", 0.09);
      }
      // 가벼운 하이햇 — 짝수 스텝마다 노이즈 클릭
      if (s % 2 === 0) {
        this.hihat(this.nextNoteTime);
      }
      this.nextNoteTime += stepDur;
      this.step = (this.step + 1) % 16;
    }
    this.schedulerId = window.setTimeout(this.tick, 30);
  };

  private hihat(time: number) {
    if (!this.ctx || !this.bgmGain) return;
    const dur = 0.04;
    const bufSize = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = 0.04;
    // hi-pass 흉내 — biquad 로 고역만 통과
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 6000;
    src.connect(hp).connect(g).connect(this.bgmGain);
    src.start(time);
    src.stop(time + dur);
  }
}

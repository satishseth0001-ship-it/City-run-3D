export class GameAudio {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private isFocusSuspended: boolean = false;
  private eventsBound: boolean = false;

  // Audio nodes for volume separation
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  // Background Music Sequencer State
  private isMusicPlaying: boolean = false;
  private nextNoteTime: number = 0.0;
  private currentStep: number = 0;
  private schedulerIntervalId: any = null;
  private tempo: number = 120; // 120 BPM
  private secondsPerStep: number = 60.0 / 120.0 / 2.0; // Eighth notes (0.25s)

  // Footstep control
  private footstepTimer: number = 0;
  private footstepInterval: number = 0.26; // Footstep speed

  // Single white noise buffer reused across sounds
  private noiseBuffer: AudioBuffer | null = null;

  // Ambience nodes
  private ambienceSource: AudioBufferSourceNode | null = null;

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !this.isFocusSuspended) {
        this.ctx.resume();
      }
      return;
    }

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();
    } catch (e) {
      console.error("Failed to initialize AudioContext", e);
      return;
    }

    // Initialize core gains - Set to high levels for maximum depth and presence
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 1.0, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.setValueAtTime(0.95, this.ctx.currentTime); // very high background music volume
    this.musicGain.connect(this.masterGain);

    this.ambienceGain = this.ctx.createGain();
    this.ambienceGain.gain.setValueAtTime(0.38, this.ctx.currentTime); // high city & traffic background ambience
    this.ambienceGain.connect(this.masterGain);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.setValueAtTime(0.90, this.ctx.currentTime); // high sfx gain for punchy game audio
    this.sfxGain.connect(this.masterGain);

    // Bootstrap general assets
    this.generateNoiseBuffer();
    
    // Bind focus events for pausing/resuming background audio
    this.bindFocusEvents();

    // Start continuous loops
    this.startAmbience();
    this.startMusicScheduler();
  }

  private generateNoiseBuffer() {
    if (!this.ctx || this.noiseBuffer) return;
    const bufferSize = this.ctx.sampleRate * 2; // 2 seconds
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const channelData = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      channelData[i] = Math.random() * 2 - 1;
    }
  }

  private getNoiseBuffer(): AudioBuffer {
    if (!this.noiseBuffer) {
      this.generateNoiseBuffer();
    }
    return this.noiseBuffer!;
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.ctx && this.masterGain) {
      const targetVolume = this.isMuted ? 0 : 1.0;
      // Fade nicely to prevent clicks/pop sounds
      this.masterGain.gain.linearRampToValueAtTime(targetVolume, this.ctx.currentTime + 0.08);
    }
    return this.isMuted;
  }

  getMuteState() {
    return this.isMuted;
  }

  private startAmbience() {
    if (!this.ctx || !this.ambienceGain) return;

    try {
      // 1. Urban Rumble Pinkish Noise Low-pass
      this.ambienceSource = this.ctx.createBufferSource();
      this.ambienceSource.buffer = this.getNoiseBuffer();
      this.ambienceSource.loop = true;

      const rumbleFilter = this.ctx.createBiquadFilter();
      rumbleFilter.type = 'lowpass';
      rumbleFilter.frequency.setValueAtTime(110, this.ctx.currentTime);

      this.ambienceSource.connect(rumbleFilter);
      rumbleFilter.connect(this.ambienceGain);
      this.ambienceSource.start();

      // 2. Dynamic Wind Sweep Filtered Noise LFO modulation
      const windSource = this.ctx.createBufferSource();
      windSource.buffer = this.getNoiseBuffer();
      windSource.loop = true;

      const windFilter = this.ctx.createBiquadFilter();
      windFilter.type = 'lowpass';
      windFilter.frequency.setValueAtTime(280, this.ctx.currentTime);
      windFilter.Q.setValueAtTime(1.5, this.ctx.currentTime);

      const windGain = this.ctx.createGain();
      windGain.gain.setValueAtTime(0.55, this.ctx.currentTime); // scale wind volume slightly lower than direct rumble but highly present

      // LFO for organic breathing filter sweeps
      const windLFO = this.ctx.createOscillator();
      const windLFOGain = this.ctx.createGain();
      windLFO.frequency.setValueAtTime(0.08, this.ctx.currentTime); // 12.5 seconds loop
      windLFOGain.gain.setValueAtTime(120, this.ctx.currentTime); // swing 120Hz up and down

      windLFO.connect(windLFOGain);
      windLFOGain.connect(windFilter.frequency);
      
      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(this.ambienceGain);

      windLFO.start();
      windSource.start();
    } catch (e) {
      console.warn("Could not start city ambience", e);
    }
  }

  // Sequencer scheduler logic
  private startMusicScheduler() {
    if (this.isMusicPlaying) return;
    this.isMusicPlaying = true;
    if (!this.ctx) return;
    this.nextNoteTime = this.ctx.currentTime;
    this.currentStep = 0;

    // Build the simple spatial delay feedback loop for the melody synth to run premiumly
    const delayNode = this.ctx.createDelay(1.0);
    delayNode.delayTime.setValueAtTime(0.375, this.ctx.currentTime); // Dotted eighth note (120 BPM)
    const feedbackGain = this.ctx.createGain();
    feedbackGain.gain.setValueAtTime(0.28, this.ctx.currentTime);

    // Connect feedback loop: melody -> delay -> feedback -> gain -> delay
    delayNode.connect(feedbackGain);
    feedbackGain.connect(delayNode);
    // Connect output to music gain
    delayNode.connect(this.musicGain!);

    // Hook up a helper method to play synth notes directed through the spatial delay
    const playDelayedSynth = (freq: number, time: number, duration: number, volume: number) => {
      if (!this.ctx || !this.musicGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, time);

      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(volume, time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

      osc.connect(gain);
      gain.connect(this.musicGain);
      gain.connect(delayNode); // ALSO feed into the lush dotted-eighth delay node!

      osc.start(time);
      osc.stop(time + duration);
    };

    const scheduler = () => {
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended' || this.isFocusSuspended) return;

      // Sync nextNoteTime to context time if we've been suspended/paused
      if (this.nextNoteTime < this.ctx.currentTime) {
        this.nextNoteTime = this.ctx.currentTime;
      }

      // Lookahead window: schedule notes 150ms in advance
      while (this.nextNoteTime < this.ctx.currentTime + 0.150) {
        this.scheduleStep(this.currentStep, this.nextNoteTime, playDelayedSynth);
        this.nextNoteTime += this.secondsPerStep;
        this.currentStep = (this.currentStep + 1) % 64; // 64 step loop
      }
    };

    this.schedulerIntervalId = setInterval(scheduler, 40); // check interval every 40ms
  }

  private scheduleStep(step: number, time: number, playDelayedSynth: Function) {
    if (!this.ctx || !this.musicGain) return;

    // 16 step bar subdivisions
    const bar = Math.floor(step / 16);
    const beat = step % 16;

    // --- CYBERPUNK DRIVING BASS LINE SCHEDULER ---
    // Galloping synthwave bass progression
    let bassFreq = 55.00; // Bar 0: A1 (Am)
    if (bar === 1) bassFreq = 43.65; // Bar 1: F1 (Fmaj)
    if (bar === 2) bassFreq = 32.70; // Bar 2: C1 (Cmaj)
    if (bar === 3) bassFreq = 49.00; // Bar 3: G1 (Gmaj)

    // Bass rhythm: Play eighth-note bassline on almost every step for a dynamic, driving feeling
    // Skip accent steps index 4 and 12 occasionally to build driving syncopations
    const playBassOnThisStep = beat !== 4 && beat !== 12;

    if (playBassOnThisStep) {
      const bassNode = this.ctx.createOscillator();
      const bassGain = this.ctx.createGain();
      const bassFilter = this.ctx.createBiquadFilter();

      bassNode.type = 'sawtooth';
      bassNode.frequency.setValueAtTime(bassFreq, time);

      bassFilter.type = 'lowpass';
      // Fast sweeping filter sweep
      bassFilter.frequency.setValueAtTime(240, time);
      bassFilter.frequency.exponentialRampToValueAtTime(85, time + 0.22);

      bassGain.gain.setValueAtTime(0.20, time);
      bassGain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

      bassNode.connect(bassFilter);
      bassFilter.connect(bassGain);
      bassGain.connect(this.musicGain);

      bassNode.start(time);
      bassNode.stop(time + 0.22);
    }

    // --- CYBERPUNK RETRO MELODY LEADER ---
    // A dreamy theme melody designed with elegant pauses to build flow
    let melFreq = 0;
    if (bar === 0) {
      if (beat === 0) melFreq = 329.63; // E4
      else if (beat === 3) melFreq = 440.00; // A4
      else if (beat === 6) melFreq = 493.88; // B4
      else if (beat === 8) melFreq = 523.25; // C5
      else if (beat === 11) melFreq = 493.88; // B4
      else if (beat === 14) melFreq = 440.00; // A4
    } else if (bar === 1) {
      if (beat === 0) melFreq = 261.63; // C4
      else if (beat === 3) melFreq = 349.23; // F4
      else if (beat === 6) melFreq = 392.00; // G4
      else if (beat === 8) melFreq = 440.00; // A4
      else if (beat === 11) melFreq = 392.00; // G4
      else if (beat === 14) melFreq = 349.23; // F4
    } else if (bar === 2) {
      if (beat === 0) melFreq = 329.63; // E4
      else if (beat === 3) melFreq = 392.00; // G4
      else if (beat === 6) melFreq = 440.00; // A4
      else if (beat === 8) melFreq = 493.88; // B4
      else if (beat === 11) melFreq = 440.00; // A4
      else if (beat === 14) melFreq = 392.00; // G4
    } else {
      if (beat === 0) melFreq = 293.66; // D4
      else if (beat === 3) melFreq = 392.00; // G4
      else if (beat === 6) melFreq = 440.00; // A4
      else if (beat === 8) melFreq = 493.88; // B4
      else if (beat === 11) melFreq = 440.00; // A4
      else if (beat === 14) melFreq = 392.00; // G4
    }

    if (melFreq > 0) {
      playDelayedSynth(melFreq, time, 0.40, 0.16); // Play notes clearly with maximum intensity and presence
    }
  }

  update(dt: number, isRunningOnGround: boolean) {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    if (isRunningOnGround) {
      this.footstepTimer += dt;
      if (this.footstepTimer >= this.footstepInterval) {
        this.playFootstep();
        this.footstepTimer = 0;
      }
    } else {
      // Clear timers quietly
      this.footstepTimer = 0;
    }
  }

  private playFootstep() {
    if (this.isMuted || !this.ctx || !this.sfxGain) return;

    try {
      // Short crunch on concrete white noise burst
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.getNoiseBuffer();

      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(320, this.ctx.currentTime);
      f.Q.setValueAtTime(6.0, this.ctx.currentTime);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.024, this.ctx.currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);

      noise.connect(f);
      f.connect(noiseGain);
      noiseGain.connect(this.sfxGain);

      // Deep heel impact thud
      const thudNode = this.ctx.createOscillator();
      const thudGain = this.ctx.createGain();

      thudNode.type = 'triangle';
      thudNode.frequency.setValueAtTime(120, this.ctx.currentTime);
      thudNode.frequency.exponentialRampToValueAtTime(32, this.ctx.currentTime + 0.038);

      thudGain.gain.setValueAtTime(0.032, this.ctx.currentTime);
      thudGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.038);

      thudNode.connect(thudGain);
      thudGain.connect(this.sfxGain);

      noise.start();
      noise.stop(this.ctx.currentTime + 0.04);
      thudNode.start();
      thudNode.stop(this.ctx.currentTime + 0.038);
    } catch(e) {}
  }

  playCoin() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    // Creating new audio nodes instantly for perfect simultaneity and no lag
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    // Arpeggiating ding pattern
    osc.frequency.setValueAtTime(1479.98, now); // F#6
    osc.frequency.setValueAtTime(1975.53, now + 0.06); // B6

    gain.gain.setValueAtTime(0.12, now); // Significantly increased for a highly satisfying, noticeable ding
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start();
    osc.stop(now + 0.28);
  }

  playJump() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const now = this.ctx.currentTime;

    // Jumping puff sound from shoes
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.getNoiseBuffer();
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(400, now);
    filter.Q.setValueAtTime(3, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.07, now); // Enhanced shoe jump puff sound loudness
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.sfxGain);

    // Primary ascending leap wave
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(360, now + 0.14);

    gain.gain.setValueAtTime(0.18, now); // Highly energetic, driving triangle wave jump sweep
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    noise.start();
    noise.stop(now + 0.12);
    osc.start();
    osc.stop(now + 0.16);
  }

  playSlide() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const now = this.ctx.currentTime;

    // Friction swoosh sound of clothing sliding against wind
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.getNoiseBuffer();

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(550, now);
    filter.frequency.exponentialRampToValueAtTime(250, now + 0.22);
    filter.Q.setValueAtTime(1.8, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.08, now); // Enhanced friction swoosh slide loudness
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.sfxGain);

    // Deep descending slide wave
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(75, now + 0.22);

    gain.gain.setValueAtTime(0.15, now); // Deep sweeping dive slide tone
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    noise.start();
    noise.stop(now + 0.24);
    osc.start();
    osc.stop(now + 0.24);
  }

  playCrash() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    // Destructive white noise burst and deep rumble
    const now = this.ctx.currentTime;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.getNoiseBuffer();

    const listFilter = this.ctx.createBiquadFilter();
    listFilter.type = 'lowpass';
    listFilter.frequency.setValueAtTime(350, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.24, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    noise.connect(listFilter);
    listFilter.connect(noiseGain);
    noiseGain.connect(this.sfxGain);

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(110, now);
    osc1.frequency.linearRampToValueAtTime(25, now + 0.42);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(95, now);
    osc2.frequency.linearRampToValueAtTime(15, now + 0.42);

    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.sfxGain);

    noise.start();
    noise.stop(now + 0.45);
    osc1.start();
    osc2.start();
    osc1.stop(now + 0.42);
    osc2.stop(now + 0.42);
  }

  playPowerUp() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const now = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, now); // C5
    osc1.frequency.exponentialRampToValueAtTime(1046.50, now + 0.35); // C6

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(659.25, now); // E5
    osc2.frequency.exponentialRampToValueAtTime(1318.51, now + 0.35); // E6

    gainNode.gain.setValueAtTime(0.18, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.40);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(this.sfxGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.40);
    osc2.stop(now + 0.40);
  }

  playShieldDeflect() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const noise = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const oscGain = this.ctx.createGain();
    const noiseGain = this.ctx.createGain();

    // Laser blast style pitch sweep
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.32);

    oscGain.gain.setValueAtTime(0.18, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(oscGain);
    oscGain.connect(this.sfxGain);

    // Friction swoosh
    noise.buffer = this.getNoiseBuffer();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(200, now + 0.28);
    filter.Q.setValueAtTime(4.0, now);

    noiseGain.gain.setValueAtTime(0.12, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.30);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.sfxGain);

    osc.start(now);
    noise.start(now);
    osc.stop(now + 0.35);
    noise.stop(now + 0.30);
  }

  suspendFromLostFocus() {
    if (!this.ctx || this.isFocusSuspended) return;
    this.isFocusSuspended = true;
    this.ctx.suspend().catch(e => console.error("Failed to suspend AudioContext on lost focus", e));
  }

  resumeFromRegainedFocus() {
    if (!this.ctx || !this.isFocusSuspended) return;
    this.isFocusSuspended = false;
    this.ctx.resume().catch(e => console.error("Failed to resume AudioContext on focus regain", e));
  }

  private bindFocusEvents() {
    if (this.eventsBound) return;
    this.eventsBound = true;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        this.suspendFromLostFocus();
      } else {
        this.resumeFromRegainedFocus();
      }
    };

    const handleBlur = () => {
      this.suspendFromLostFocus();
    };

    const handleFocus = () => {
      this.resumeFromRegainedFocus();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
  }
}

export const gameAudio = new GameAudio();

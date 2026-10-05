import {
  AudioAnalysisFrame,
  DEFAULT_PER_KEY_LIFT,
  EngineConfig,
  LipSyncCue,
  MotionPhase,
  VISEME_LIBRARY,
  VisemeCode,
} from '../types/studio';

/**
 * Deterministic Audio Signal Processing (DSP) Engine for 12-Phoneme Mouth Charts,
 * Per-Key Character Lifting, and Silent Auto-Drop.
 */

export function amplitudeToDb(rms: number): number {
  if (rms <= 0.00001) return -60;
  const db = 20 * Math.log10(rms);
  return Math.max(-60, Math.min(0, db));
}

export function resolveDeterministicViseme(
  db: number,
  deltaRms: number,
  zcr: number,
  centroid: number,
  prevViseme: VisemeCode,
  config: EngineConfig
): { viseme: VisemeCode; phase: MotionPhase; isDropped: boolean } {
  const { silenceThresholdDb, peakThresholdDb, risingSensitivity } = config;

  // 1. AUTO-DROP WHEN NO AUDIO IS PRESENT (যেখানে কোনো অডিও পাবে না সেখানে অটো ড্রপ হবে)
  if (db <= silenceThresholdDb) {
    return {
      viseme: VisemeCode.DROP,
      phase: MotionPhase.SILENCE,
      isDropped: true,
    };
  }

  const activeSpan = Math.max(6, peakThresholdDb - silenceThresholdDb);
  const relativeLevel = Math.max(0, Math.min(1.25, (db - silenceThresholdDb) / activeSpan));

  let phase: MotionPhase = MotionPhase.HOLD;
  if (db >= peakThresholdDb) {
    phase = MotionPhase.PEAK;
  } else if (deltaRms >= risingSensitivity) {
    phase = MotionPhase.RISING;
  } else if (deltaRms <= -risingSensitivity) {
    phase = MotionPhase.FALLING;
  }

  // 2. PEAK PHASE: Wide Open A,E,I or Vertical Oval O
  if (phase === MotionPhase.PEAK) {
    if (centroid < 0.36) {
      return { viseme: VisemeCode.O, phase, isDropped: false };
    }
    return { viseme: VisemeCode.AEI, phase, isDropped: false };
  }

  // 3. Onset / Closing Bilabial or Labiodental (B,M,P or F,V or N)
  if (relativeLevel < 0.24) {
    if (zcr > 0.44) {
      return { viseme: VisemeCode.FV, phase, isDropped: false };
    }
    if (centroid > 0.48) {
      return { viseme: VisemeCode.N, phase, isDropped: false };
    }
    return { viseme: VisemeCode.BMP, phase, isDropped: false };
  }

  // 4. High Zero-Crossing Rate -> Sibilants & Consonants (C,D,G,K,S,T or CH,J,SH or TH)
  if (zcr > 0.38 && relativeLevel < 0.78) {
    if (zcr > 0.56) {
      return { viseme: VisemeCode.CDGK, phase, isDropped: false };
    }
    if (centroid > 0.52) {
      return { viseme: VisemeCode.CHJSH, phase, isDropped: false };
    }
    return { viseme: VisemeCode.TH, phase, isDropped: false };
  }

  // 5. Upper-Mid Active Voice (U, Q/W, L, EE, A/E/I)
  if (relativeLevel >= 0.66) {
    if (centroid < 0.31) {
      return { viseme: VisemeCode.U, phase, isDropped: false };
    }
    if (centroid < 0.44) {
      return { viseme: VisemeCode.QW, phase, isDropped: false };
    }
    if (centroid > 0.62) {
      return { viseme: VisemeCode.EE, phase, isDropped: false };
    }
    return { viseme: VisemeCode.AEI, phase, isDropped: false };
  }

  // 6. Moderate Active Voice (0.24 .. 0.66)
  if (centroid < 0.30) {
    return { viseme: VisemeCode.U, phase, isDropped: false };
  }
  if (centroid < 0.40) {
    return { viseme: VisemeCode.QW, phase, isDropped: false };
  }
  if (centroid > 0.60) {
    return { viseme: VisemeCode.EE, phase, isDropped: false };
  }
  if (deltaRms > 0.015 && prevViseme !== VisemeCode.L) {
    return { viseme: VisemeCode.L, phase, isDropped: false };
  }
  if (deltaRms < -0.015) {
    return { viseme: VisemeCode.TH, phase, isDropped: false };
  }

  return { viseme: VisemeCode.CDGK, phase, isDropped: false };
}

/**
 * Helper to compute the target lift in pixels for a given Viseme key and audio envelope.
 * Respects per-key lifting (`config.perKeyLiftPx[viseme]`) scaled by `config.maxLiftPx`.
 */
export function computeKeyLiftPx(
  viseme: VisemeCode,
  isDropped: boolean,
  activeRatio: number,
  risingBoost: number,
  config: EngineConfig
): number {
  if (isDropped || viseme === VisemeCode.DROP || config.maxLiftPx <= 0) {
    return 0;
  }
  const perKeyBase =
    config.perKeyLiftPx?.[viseme] ??
    DEFAULT_PER_KEY_LIFT[viseme] ??
    VISEME_LIBRARY[viseme]?.defaultLiftPx ??
    12;

  const globalMultiplier = config.maxLiftPx / 26;
  const envelopeFactor = Math.max(0.55, Math.min(1.2, activeRatio * 0.85 + risingBoost + 0.25));
  return Math.max(0, Math.min(68, perKeyBase * globalMultiplier * envelopeFactor));
}

export function analyzeAudioBuffer(
  audioBuffer: AudioBuffer,
  config: EngineConfig
): { frames: AudioAnalysisFrame[]; cues: LipSyncCue[] } {
  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0);
  const duration = audioBuffer.duration;
  const totalFrames = Math.max(1, Math.ceil(duration * config.fps));
  const samplesPerFrame = Math.max(1, Math.floor(sampleRate / config.fps));

  const rawRms: number[] = new Array(totalFrames).fill(0);
  const rawZcr: number[] = new Array(totalFrames).fill(0);
  const rawCentroid: number[] = new Array(totalFrames).fill(0);

  let maxObservedRms = 0.001;

  for (let f = 0; f < totalFrames; f++) {
    const startSample = f * samplesPerFrame;
    const endSample = Math.min(channelData.length, startSample + samplesPerFrame);
    const count = endSample - startSample;
    if (count <= 0) continue;

    let sumSq = 0;
    let zeroCrossings = 0;
    let diffEnergy = 0;

    for (let i = startSample; i < endSample; i++) {
      const s = channelData[i];
      sumSq += s * s;
      if (i > startSample) {
        const prev = channelData[i - 1];
        if ((s >= 0 && prev < 0) || (s < 0 && prev >= 0)) {
          zeroCrossings++;
        }
        const diff = s - prev;
        diffEnergy += diff * diff;
      }
    }

    const rms = Math.sqrt(sumSq / count);
    rawRms[f] = rms;
    if (rms > maxObservedRms) maxObservedRms = rms;

    rawZcr[f] = Math.min(1, zeroCrossings / count / 0.28);
    if (sumSq > 0.000001) {
      rawCentroid[f] = Math.min(1, Math.max(0, Math.sqrt(diffEnergy / sumSq) / 1.15));
    } else {
      rawCentroid[f] = 0.4;
    }
  }

  const normFactor = maxObservedRms > 0.005 ? 0.95 / maxObservedRms : 1;
  const rawFrames: AudioAnalysisFrame[] = [];
  let prevViseme: VisemeCode = VisemeCode.DROP;

  for (let f = 0; f < totalFrames; f++) {
    const normRms = Math.min(1, rawRms[f] * normFactor);
    const prevRms = f > 0 ? Math.min(1, rawRms[f - 1] * normFactor) : 0;
    const nextRms = f < totalFrames - 1 ? Math.min(1, rawRms[f + 1] * normFactor) : normRms;

    // 3-tap spectral smoothing to prevent robotic frame-to-frame consonant jitter
    const prevZcr = f > 0 ? rawZcr[f - 1] : rawZcr[f];
    const nextZcr = f < totalFrames - 1 ? rawZcr[f + 1] : rawZcr[f];
    const smoothZcr = prevZcr * 0.22 + rawZcr[f] * 0.56 + nextZcr * 0.22;

    const prevCent = f > 0 ? rawCentroid[f - 1] : rawCentroid[f];
    const nextCent = f < totalFrames - 1 ? rawCentroid[f + 1] : rawCentroid[f];
    const smoothCentroid = prevCent * 0.22 + rawCentroid[f] * 0.56 + nextCent * 0.22;

    const envelopeRms = prevRms * 0.25 + normRms * 0.5 + nextRms * 0.25;
    const db = amplitudeToDb(envelopeRms);
    const deltaRms = normRms - prevRms;

    const { viseme, phase, isDropped } = resolveDeterministicViseme(
      db,
      deltaRms,
      smoothZcr,
      smoothCentroid,
      prevViseme,
      config
    );
    prevViseme = viseme;

    const activeRatio = isDropped
      ? 0
      : Math.min(
          1,
          (db - config.silenceThresholdDb) /
            Math.max(6, config.peakThresholdDb - config.silenceThresholdDb)
        );

    const risingBoost = !isDropped && deltaRms > 0 ? Math.min(0.35, deltaRms * 1.8) : 0;
    const targetLift = computeKeyLiftPx(viseme, isDropped, activeRatio, risingBoost, config);

    const headTiltDeg = isDropped
      ? 0
      : Number((Math.sin(f * 0.26) * activeRatio * 4.2).toFixed(2));
    const browLiftPx = isDropped ? 0 : Number((activeRatio * 9.5).toFixed(2));

    rawFrames.push({
      frame: f,
      time: Number((f / config.fps).toFixed(4)),
      rms: Number(envelopeRms.toFixed(4)),
      db: Number(db.toFixed(1)),
      deltaRms: Number(deltaRms.toFixed(4)),
      zcr: Number(smoothZcr.toFixed(3)),
      centroid: Number(smoothCentroid.toFixed(3)),
      phase,
      viseme,
      isDropped,
      liftY: Number(targetLift.toFixed(2)),
      squashStretch: 1.0,
      headTiltDeg,
      browLiftPx,
    });
  }

  // Smart Auto-Listing Co-articulation: bridge 1-frame micro-drops inside spoken words
  if (config.smartAutoListing !== false && rawFrames.length > 3) {
    for (let i = 1; i < rawFrames.length - 1; i++) {
      if (
        rawFrames[i].isDropped &&
        !rawFrames[i - 1].isDropped &&
        !rawFrames[i + 1].isDropped
      ) {
        rawFrames[i].isDropped = false;
        rawFrames[i].viseme = VisemeCode.BMP;
        rawFrames[i].phase = MotionPhase.HOLD;
        rawFrames[i].liftY = Number(
          ((rawFrames[i - 1].liftY + rawFrames[i + 1].liftY) * 0.38).toFixed(2)
        );
      }
    }
  }

  // Hold smoothing on active (non-dropped) frames so mouth chart shapes read cleanly without robotic flicker
  const holdMin = Math.max(
    config.smartAutoListing !== false ? 2 : 1,
    config.holdSmoothingFrames
  );
  if (holdMin > 1 && rawFrames.length > holdMin) {
    let runStart = 0;
    for (let i = 1; i < rawFrames.length; i++) {
      if (rawFrames[i].viseme !== rawFrames[runStart].viseme) {
        const runLength = i - runStart;
        if (
          runLength < holdMin &&
          runStart > 0 &&
          !rawFrames[runStart].isDropped &&
          !rawFrames[runStart - 1].isDropped
        ) {
          const replacement = rawFrames[runStart - 1].viseme;
          for (let k = runStart; k < i; k++) {
            rawFrames[k].viseme = replacement;
          }
        }
        runStart = i;
      }
    }
  }

  // Apply Smart Organic Lifting & Squash-Stretch Envelope (Eliminates robotic step jumps!)
  applySmartLiftingEnvelope(rawFrames, config);

  const cues = buildCuesFromFrames(rawFrames, config.fps);
  return { frames: rawFrames, cues };
}

/**
 * Multi-pass Zero-Phase Gaussian + Spring-Damper Envelope Smoother for `liftY` and `squashStretch`.
 * Ensures lifting rises organically with syllable energy and settles down like a feather (never snapping abruptly).
 */
export function applySmartLiftingEnvelope(
  frames: AudioAnalysisFrame[],
  config: EngineConfig
): void {
  const n = frames.length;
  if (n === 0) return;

  if (config.maxLiftPx <= 0 || config.layers.liftingLayer === false) {
    for (let i = 0; i < n; i++) {
      frames[i].liftY = 0;
      frames[i].squashStretch = 1.0;
    }
    return;
  }

  const curveMode = config.liftingCurveMode || 'smart-organic';
  const smoothnessPct = Math.max(0, Math.min(100, config.liftingSmoothness ?? 88));
  const smoothFactor = smoothnessPct / 100;

  // 1. Recompute raw target lift from final co-articulated viseme + audio RMS envelope
  const rawTargets = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const fr = frames[i];
    if (fr.isDropped || fr.viseme === VisemeCode.DROP) {
      rawTargets[i] = 0;
      continue;
    }
    const activeRatio = Math.max(
      0.15,
      Math.min(
        1,
        (fr.db - config.silenceThresholdDb) /
          Math.max(6, config.peakThresholdDb - config.silenceThresholdDb)
      )
    );
    const risingBoost = fr.deltaRms > 0 ? Math.min(0.32, fr.deltaRms * 1.6) : 0;
    rawTargets[i] = computeKeyLiftPx(
      fr.viseme,
      false,
      activeRatio,
      risingBoost,
      config
    );
  }

  // 2. Shape syllable runs with a subtle natural bell-arch so flat cues still breathe organically
  let segStart = 0;
  for (let i = 1; i <= n; i++) {
    const isEnd = i === n;
    const prevDropped = rawTargets[segStart] <= 0.01;
    const currDropped = !isEnd && rawTargets[i] <= 0.01;
    if (isEnd || currDropped !== prevDropped) {
      const segLen = i - segStart;
      if (!prevDropped && segLen >= 3 && curveMode !== 'classic-linear') {
        for (let k = segStart; k < i; k++) {
          const u = (k - segStart + 0.5) / segLen; // 0..1 across active speech phrase
          const arch = 0.72 + 0.36 * Math.sin(Math.PI * u);
          rawTargets[k] *= arch;
        }
      }
      segStart = i;
    }
  }

  // 3. Asymmetric Attack/Release Spring-Damper Pass (No instant drop-to-zero snapping!)
  const springFiltered = new Float32Array(n);
  let pos = 0;
  let vel = 0;

  const isSpringy = curveMode === 'spring-bounce';
  const isFeather = curveMode === 'feather-glide';
  const stiffness = isSpringy
    ? 0.34
    : isFeather
    ? 0.16
    : 0.24 - smoothFactor * 0.08;
  const damping = isSpringy
    ? 0.68
    : isFeather
    ? 0.84
    : 0.78 + smoothFactor * 0.06;

  for (let i = 0; i < n; i++) {
    const target = rawTargets[i];
    if (curveMode === 'classic-linear' && smoothFactor < 0.15) {
      springFiltered[i] = target;
      continue;
    }
    // Faster attack when rising on a vowel, softer cushioned glide when releasing
    const effectiveStiff =
      target > pos ? stiffness * 1.35 : stiffness * (0.72 - smoothFactor * 0.18);
    const force = (target - pos) * effectiveStiff;
    vel = vel * damping + force;
    pos += vel;
    if (pos < 0) {
      pos = 0;
      vel *= 0.3;
    }
    springFiltered[i] = pos;
  }

  // 4. Zero-Phase Forward-Backward 5-Tap Gaussian Spline Pass for silky C2 continuity
  const passes =
    curveMode === 'classic-linear'
      ? 0
      : Math.max(1, Math.round(1 + smoothFactor * 3));
  let smoothed = Float32Array.from(springFiltered);
  const temp = new Float32Array(n);

  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < n; i++) {
      const m2 = smoothed[Math.max(0, i - 2)];
      const m1 = smoothed[Math.max(0, i - 1)];
      const c0 = smoothed[i];
      const p1 = smoothed[Math.min(n - 1, i + 1)];
      const p2 = smoothed[Math.min(n - 1, i + 2)];
      temp[i] = m2 * 0.08 + m1 * 0.24 + c0 * 0.36 + p1 * 0.24 + p2 * 0.08;
    }
    smoothed.set(temp);
  }

  // 5. Write smooth liftY and velocity-coupled squash & stretch back to frames
  for (let i = 0; i < n; i++) {
    const liftVal = smoothed[i] < 0.08 ? 0 : smoothed[i];
    frames[i].liftY = Number(liftVal.toFixed(2));

    const prevLift = i > 0 ? smoothed[i - 1] : liftVal;
    const liftVelocity = liftVal - prevLift;
    const normLift = liftVal / Math.max(12, config.maxLiftPx);

    // Volume-preserving squash & stretch driven by smooth lift + velocity (anticipation & cushion)
    const stretchDelta =
      (normLift * 0.09 + liftVelocity * 0.018) * config.squashIntensity;
    frames[i].squashStretch = Math.max(
      0.92,
      Math.min(1.16, Number((1.0 + stretchDelta).toFixed(4)))
    );
  }
}

export function buildCuesFromFrames(frames: AudioAnalysisFrame[], fps: number): LipSyncCue[] {
  if (frames.length === 0) return [];

  const cues: LipSyncCue[] = [];
  let startIdx = 0;

  for (let i = 1; i <= frames.length; i++) {
    const isEnd = i === frames.length;
    if (isEnd || frames[i].viseme !== frames[startIdx].viseme) {
      const slice = frames.slice(startIdx, i);
      let peakDb = -60;
      let sumRms = 0;
      let maxLift = 0;
      let dominantPhase = slice[0].phase;

      for (const fr of slice) {
        if (fr.db > peakDb) peakDb = fr.db;
        sumRms += fr.rms;
        if (fr.liftY > maxLift) {
          maxLift = fr.liftY;
          dominantPhase = fr.phase;
        }
      }

      const viseme = slice[0].viseme;
      const isDropped = viseme === VisemeCode.DROP;

      cues.push({
        id: `cue-${startIdx}-${i - 1}`,
        startFrame: startIdx,
        endFrame: i - 1,
        startTime: Number((startIdx / fps).toFixed(3)),
        endTime: Number((i / fps).toFixed(3)),
        viseme,
        phase: isDropped ? MotionPhase.SILENCE : dominantPhase,
        peakDb: Number(peakDb.toFixed(1)),
        avgRms: Number((sumRms / slice.length).toFixed(3)),
        liftPx: isDropped ? 0 : Number(maxLift.toFixed(1)),
        isDropped,
      });

      startIdx = i;
    }
  }

  return cues;
}

export function applyCuesToFrames(
  frames: AudioAnalysisFrame[],
  cues: LipSyncCue[],
  config: EngineConfig
): AudioAnalysisFrame[] {
  const updated = frames.map((f) => ({ ...f }));
  const globalMultiplier = config.maxLiftPx / 26;

  for (const cue of cues) {
    const startF = Math.max(0, Math.min(updated.length - 1, cue.startFrame));
    const endF = Math.max(startF, Math.min(updated.length - 1, cue.endFrame));
    const isDropped = cue.viseme === VisemeCode.DROP;
    const keyBaseLift =
      config.perKeyLiftPx?.[cue.viseme] ??
      DEFAULT_PER_KEY_LIFT[cue.viseme] ??
      VISEME_LIBRARY[cue.viseme]?.defaultLiftPx ??
      12;

    for (let f = startF; f <= endF; f++) {
      updated[f].viseme = cue.viseme;
      updated[f].isDropped = isDropped;
      updated[f].phase = isDropped ? MotionPhase.SILENCE : cue.phase;
      if (isDropped || config.maxLiftPx <= 0) {
        updated[f].liftY = 0;
      } else if (cue.locked && cue.liftPx !== undefined) {
        updated[f].liftY = cue.liftPx;
      } else {
        updated[f].liftY = Number((keyBaseLift * globalMultiplier).toFixed(1));
      }
    }
  }

  // Smooth the resulting frame lifting curve so manual cue edits also transition smoothly!
  applySmartLiftingEnvelope(updated, config);

  return updated;
}

export type StudioSoundPresetId = 'bangla-dialogue' | 'energetic-story' | 'dramatic-scene';
export type StudioSoundFxId = 'cartoon-boing' | 'happy-laugh' | 'surprised-gasp' | 'robo-chatter';

interface SyllableSpec {
  start: number;
  end: number;
  f0: number;
  f1: number;
  f2: number;
  amp: number;
  sibilant?: boolean;
}

function synthesizeSyllablesToBuffer(
  ctx: BaseAudioContext,
  durationSeconds: number,
  syllables: SyllableSpec[]
): AudioBuffer {
  const sampleRate = ctx.sampleRate || 44100;
  const totalSamples = Math.floor(durationSeconds * sampleRate);
  const buffer = ctx.createBuffer(1, totalSamples, sampleRate);
  const data = buffer.getChannelData(0);

  for (const syl of syllables) {
    const startSample = Math.floor(syl.start * sampleRate);
    const endSample = Math.min(totalSamples, Math.floor(syl.end * sampleRate));
    const len = endSample - startSample;
    if (len <= 0) continue;

    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const progress = i / len;

      let env = 1.0;
      if (progress < 0.14) env = progress / 0.14;
      else if (progress > 0.78) env = (1 - progress) / 0.22;
      env = Math.pow(Math.max(0, env), 1.2) * syl.amp;

      const pitch = syl.f0 + Math.sin(2 * Math.PI * 5.5 * t) * 3.5;
      const fundamental = Math.sin(2 * Math.PI * pitch * t);
      const formant1 = Math.sin(2 * Math.PI * syl.f1 * t) * 0.55;
      const formant2 = Math.sin(2 * Math.PI * syl.f2 * t) * 0.28;
      const consonantNoise = syl.sibilant
        ? Math.sin(i * 12.9898 + 78.233) * Math.cos(i * 43.123) * 0.45
        : Math.sin(i * 9.123) * 0.04;

      const sample = (fundamental * 0.5 + formant1 + formant2 + consonantNoise) * env * 0.55;
      data[startSample + i] = Math.max(-0.98, Math.min(0.98, sample));
    }
  }

  return buffer;
}

/**
 * Generates a realistic studio voiceover AudioBuffer with distinct silent drops
 * and clear vowel/consonant peaks to showcase all 12 Mouth Chart expressions & Auto-Drop.
 */
export function createDemoSpeechAudioBuffer(ctx: BaseAudioContext): AudioBuffer {
  return createStudioSoundPresetBuffer(ctx, 'bangla-dialogue');
}

export function createStudioSoundPresetBuffer(
  ctx: BaseAudioContext,
  presetId: StudioSoundPresetId
): AudioBuffer {
  if (presetId === 'energetic-story') {
    return synthesizeSyllablesToBuffer(ctx, 6.5, [
      { start: 0.2, end: 0.42, f0: 185, f1: 420, f2: 2150, amp: 0.58, sibilant: true },
      { start: 0.44, end: 0.78, f0: 210, f1: 860, f2: 1480, amp: 0.98 },
      { start: 0.82, end: 1.08, f0: 192, f1: 350, f2: 2250, amp: 0.76 },
      { start: 1.12, end: 1.44, f0: 205, f1: 540, f2: 920, amp: 0.94 },
      // Silent drop 1.44 - 2.05
      { start: 2.05, end: 2.32, f0: 178, f1: 480, f2: 1750, amp: 0.64 },
      { start: 2.35, end: 2.75, f0: 220, f1: 890, f2: 1420, amp: 1.0 },
      { start: 2.8, end: 3.12, f0: 195, f1: 320, f2: 880, amp: 0.68 },
      { start: 3.16, end: 3.45, f0: 165, f1: 410, f2: 2300, amp: 0.48, sibilant: true },
      // Silent drop 3.45 - 4.10
      { start: 4.1, end: 4.48, f0: 212, f1: 840, f2: 1520, amp: 0.96 },
      { start: 4.52, end: 4.88, f0: 198, f1: 560, f2: 910, amp: 0.92 },
      { start: 4.92, end: 5.25, f0: 175, f1: 380, f2: 2050, amp: 0.72 },
      { start: 5.3, end: 5.65, f0: 218, f1: 870, f2: 1400, amp: 0.99 },
      { start: 5.68, end: 5.95, f0: 150, f1: 360, f2: 980, amp: 0.36 },
    ]);
  }

  if (presetId === 'dramatic-scene') {
    return synthesizeSyllablesToBuffer(ctx, 7.0, [
      { start: 0.4, end: 0.85, f0: 118, f1: 520, f2: 890, amp: 0.92 },
      { start: 0.9, end: 1.35, f0: 124, f1: 780, f2: 1320, amp: 0.96 },
      { start: 1.4, end: 1.72, f0: 112, f1: 360, f2: 940, amp: 0.45 },
      // Dramatic pause 1.72 - 2.85
      { start: 2.85, end: 3.22, f0: 128, f1: 440, f2: 2180, amp: 0.56, sibilant: true },
      { start: 3.26, end: 3.85, f0: 138, f1: 850, f2: 1380, amp: 1.0 },
      { start: 3.9, end: 4.35, f0: 122, f1: 310, f2: 850, amp: 0.66 },
      // Dramatic pause 4.35 - 5.20
      { start: 5.2, end: 5.75, f0: 134, f1: 560, f2: 920, amp: 0.95 },
      { start: 5.8, end: 6.32, f0: 142, f1: 860, f2: 1420, amp: 0.98 },
      { start: 6.36, end: 6.65, f0: 108, f1: 380, f2: 1020, amp: 0.35 },
    ]);
  }

  // Default: 'bangla-dialogue' (8.0s)
  return synthesizeSyllablesToBuffer(ctx, 8.0, [
    { start: 0.3, end: 0.46, f0: 145, f1: 380, f2: 950, amp: 0.35 },
    { start: 0.48, end: 0.64, f0: 155, f1: 420, f2: 2250, amp: 0.5, sibilant: true },
    { start: 0.66, end: 0.98, f0: 172, f1: 820, f2: 1420, amp: 0.96 },
    { start: 1.0, end: 1.24, f0: 158, f1: 520, f2: 1980, amp: 0.68 },
    { start: 1.28, end: 1.52, f0: 162, f1: 310, f2: 860, amp: 0.62 },
    { start: 1.55, end: 1.88, f0: 180, f1: 540, f2: 920, amp: 0.98 },
    { start: 1.9, end: 2.18, f0: 142, f1: 480, f2: 1650, amp: 0.44, sibilant: true },
    // Silent Drop 2.18 - 2.95
    { start: 2.95, end: 3.2, f0: 160, f1: 540, f2: 1850, amp: 0.65 },
    { start: 3.24, end: 3.6, f0: 184, f1: 860, f2: 1380, amp: 0.97 },
    { start: 3.64, end: 3.92, f0: 150, f1: 340, f2: 900, amp: 0.56 },
    { start: 3.96, end: 4.32, f0: 174, f1: 790, f2: 1500, amp: 0.9 },
    { start: 4.35, end: 4.62, f0: 148, f1: 410, f2: 2300, amp: 0.46, sibilant: true },
    { start: 4.66, end: 5.08, f0: 180, f1: 520, f2: 880, amp: 0.95 },
    { start: 5.1, end: 5.38, f0: 138, f1: 450, f2: 1150, amp: 0.34 },
    // Silent Drop 5.38 - 6.10
    { start: 6.1, end: 6.4, f0: 165, f1: 350, f2: 2050, amp: 0.72 },
    { start: 6.44, end: 6.72, f0: 158, f1: 510, f2: 2200, amp: 0.6, sibilant: true },
    { start: 6.76, end: 7.18, f0: 188, f1: 880, f2: 1400, amp: 1.0 },
    { start: 7.22, end: 7.52, f0: 145, f1: 340, f2: 920, amp: 0.48 },
  ]);
}

export function createStudioSoundFxBuffer(
  ctx: BaseAudioContext,
  sfxId: StudioSoundFxId
): AudioBuffer {
  if (sfxId === 'happy-laugh') {
    return synthesizeSyllablesToBuffer(ctx, 4.2, [
      { start: 0.2, end: 0.45, f0: 220, f1: 880, f2: 1450, amp: 0.98 },
      { start: 0.55, end: 0.8, f0: 210, f1: 860, f2: 1420, amp: 0.95 },
      { start: 0.9, end: 1.18, f0: 230, f1: 900, f2: 1500, amp: 1.0 },
      { start: 1.28, end: 1.52, f0: 195, f1: 520, f2: 1950, amp: 0.78 },
      // Pause
      { start: 1.95, end: 2.22, f0: 225, f1: 890, f2: 1460, amp: 0.96 },
      { start: 2.32, end: 2.6, f0: 238, f1: 910, f2: 1520, amp: 1.0 },
      { start: 2.7, end: 3.05, f0: 205, f1: 540, f2: 920, amp: 0.92 },
      { start: 3.12, end: 3.45, f0: 175, f1: 360, f2: 2100, amp: 0.68 },
    ]);
  }

  if (sfxId === 'surprised-gasp') {
    return synthesizeSyllablesToBuffer(ctx, 4.0, [
      { start: 0.25, end: 0.48, f0: 190, f1: 420, f2: 2300, amp: 0.52, sibilant: true },
      { start: 0.52, end: 1.15, f0: 240, f1: 540, f2: 880, amp: 1.0 }, // Big O!
      // Pause
      { start: 1.65, end: 2.25, f0: 255, f1: 890, f2: 1450, amp: 1.0 }, // Big A,E,I!
      { start: 2.3, end: 2.75, f0: 210, f1: 350, f2: 2180, amp: 0.82 }, // EE!
      { start: 2.8, end: 3.25, f0: 185, f1: 320, f2: 860, amp: 0.65 }, // U
    ]);
  }

  if (sfxId === 'robo-chatter') {
    return synthesizeSyllablesToBuffer(ctx, 4.5, [
      { start: 0.2, end: 0.4, f0: 130, f1: 450, f2: 2400, amp: 0.62, sibilant: true },
      { start: 0.45, end: 0.72, f0: 130, f1: 850, f2: 1400, amp: 0.95 },
      { start: 0.78, end: 1.02, f0: 130, f1: 320, f2: 880, amp: 0.72 },
      { start: 1.08, end: 1.38, f0: 130, f1: 540, f2: 910, amp: 0.94 },
      // Pause
      { start: 1.85, end: 2.15, f0: 130, f1: 380, f2: 2250, amp: 0.78, sibilant: true },
      { start: 2.2, end: 2.6, f0: 130, f1: 880, f2: 1440, amp: 0.99 },
      { start: 2.66, end: 2.98, f0: 130, f1: 350, f2: 2100, amp: 0.74 },
      { start: 3.04, end: 3.45, f0: 130, f1: 520, f2: 890, amp: 0.92 },
    ]);
  }

  // Default: 'cartoon-boing'
  return synthesizeSyllablesToBuffer(ctx, 4.0, [
    { start: 0.2, end: 0.45, f0: 165, f1: 380, f2: 960, amp: 0.42 }, // B,M,P
    { start: 0.48, end: 0.95, f0: 215, f1: 550, f2: 910, amp: 0.98 }, // O! Boing
    { start: 1.0, end: 1.35, f0: 235, f1: 360, f2: 2150, amp: 0.8 }, // EE!
    // Pause
    { start: 1.85, end: 2.4, f0: 228, f1: 890, f2: 1420, amp: 1.0 }, // A,E,I! Wow!
    { start: 2.45, end: 2.85, f0: 185, f1: 320, f2: 880, amp: 0.7 }, // U
    { start: 2.9, end: 3.2, f0: 150, f1: 380, f2: 1020, amp: 0.36 }, // B,M,P
  ]);
}

/**
 * Encodes an AudioBuffer into a downloadable 16-bit PCM WAV Blob for "Extract Audio" download.
 */
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numOfChan = 1;
  const sampleRate = buffer.sampleRate;
  const samples = buffer.getChannelData(0);
  const length = samples.length * 2 + 44;
  const out = new ArrayBuffer(length);
  const view = new DataView(out);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, length - 8, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numOfChan, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([out], { type: 'audio/wav' });
}

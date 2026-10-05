import { ArrayBufferTarget, Muxer } from 'mp4-muxer';

export interface Mp4ExportOptions {
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  audioBuffer: AudioBuffer | null;
  isMuted?: boolean;
  renderFrameAt: (
    frameIndex: number,
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number
  ) => Promise<void> | void;
  onProgress: (percent: number) => void;
  shouldCancel?: () => boolean;
}

export interface Mp4ExportResult {
  blob: Blob;
  url: string;
  filename: string;
  formatLabel: string;
}

async function findSupportedH264Config(width: number, height: number, fps: number) {
  if (typeof VideoEncoder === 'undefined') return null;

  const evenW = width % 2 === 0 ? width : width - 1;
  const evenH = height % 2 === 0 ? height : height - 1;

  const candidates = [
    'avc1.420028', // Baseline Level 4.0 (1080p universal mobile & CapCut/KineMaster)
    'avc1.42E028', // Constrained Baseline Level 4.0
    'avc1.4d0028', // Main Level 4.0
    'avc1.640028', // High Level 4.0
    'avc1.42001f', // Baseline Level 3.1 (720p)
    'avc1.42E01E',
  ];

  for (const codec of candidates) {
    try {
      const cfg: VideoEncoderConfig = {
        codec,
        width: evenW,
        height: evenH,
        bitrate: evenW >= 1920 ? 6_000_000 : 3_500_000,
        framerate: fps,
      };
      const support = await VideoEncoder.isConfigSupported(cfg);
      if (support.supported) {
        return support.config || cfg;
      }
    } catch {
      // Try next profile
    }
  }
  return null;
}

async function findSupportedAudioEncoderConfig(
  sampleRate: number,
  numberOfChannels: number
): Promise<{ muxCodec: 'aac' | 'opus'; config: AudioEncoderConfig } | null> {
  if (typeof AudioEncoder === 'undefined') return null;

  const aacCandidates: AudioEncoderConfig[] = [
    {
      codec: 'mp4a.40.2',
      sampleRate,
      numberOfChannels,
      bitrate: 128_000,
    },
    {
      codec: 'mp4a.40.2',
      sampleRate: 44100,
      numberOfChannels: 1,
      bitrate: 96_000,
    },
    {
      codec: 'mp4a.40.2',
      sampleRate: 48000,
      numberOfChannels: 1,
      bitrate: 96_000,
    },
  ];

  for (const cfg of aacCandidates) {
    try {
      const support = await AudioEncoder.isConfigSupported(cfg);
      if (support.supported) {
        return { muxCodec: 'aac', config: support.config || cfg };
      }
    } catch {
      // Ignore
    }
  }

  // Fallback to Opus inside MP4 if AAC encoder is unavailable on the host OS
  try {
    const opusCfg: AudioEncoderConfig = {
      codec: 'opus',
      sampleRate: 48000,
      numberOfChannels: Math.min(2, numberOfChannels),
      bitrate: 128_000,
    };
    const support = await AudioEncoder.isConfigSupported(opusCfg);
    if (support.supported) {
      return { muxCodec: 'opus', config: support.config || opusCfg };
    }
  } catch {
    // Ignore
  }

  return null;
}

function resampleChannelData(
  input: Float32Array,
  fromRate: number,
  toRate: number
): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const outLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const srcIdx = i * ratio;
    const i0 = Math.floor(srcIdx);
    const i1 = Math.min(input.length - 1, i0 + 1);
    const frac = srcIdx - i0;
    output[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return output;
}

/**
 * Encodes a genuine, seekable ISO BMFF .MP4 (H.264/AVC + Audio) file with fastStart moov header
 * so it imports cleanly into CapCut, InShot, KineMaster, Premiere Pro, and Mobile Gallery.
 */
export async function exportStandardMp4Video(
  options: Mp4ExportOptions
): Promise<Mp4ExportResult | null> {
  const evenW = options.width % 2 === 0 ? options.width : options.width - 1;
  const evenH = options.height % 2 === 0 ? options.height : options.height - 1;

  const videoConfig = await findSupportedH264Config(evenW, evenH, options.fps);
  if (!videoConfig || typeof VideoFrame === 'undefined') {
    return null;
  }

  const audioBuf = options.isMuted ? null : options.audioBuffer;
  const audioSupport = audioBuf
    ? await findSupportedAudioEncoderConfig(
        audioBuf.sampleRate,
        Math.min(2, audioBuf.numberOfChannels)
      )
    : null;

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: {
      codec: 'avc',
      width: evenW,
      height: evenH,
      frameRate: options.fps,
    },
    ...(audioSupport
      ? {
          audio: {
            codec: audioSupport.muxCodec,
            sampleRate: audioSupport.config.sampleRate,
            numberOfChannels: audioSupport.config.numberOfChannels,
          },
        }
      : {}),
    fastStart: 'in-memory',
  });

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta);
    },
    error: (err) => {
      console.error('VideoEncoder error:', err);
    },
  });
  videoEncoder.configure(videoConfig);

  let audioEncoder: AudioEncoder | null = null;
  if (audioSupport && audioBuf && typeof AudioData !== 'undefined') {
    try {
      audioEncoder = new AudioEncoder({
        output: (chunk, meta) => {
          muxer.addAudioChunk(chunk, meta);
        },
        error: (err) => {
          console.warn('AudioEncoder warning:', err);
        },
      });
      audioEncoder.configure(audioSupport.config);

      const channels = audioSupport.config.numberOfChannels;
      const targetSr = audioSupport.config.sampleRate;
      const resampledChannels: Float32Array[] = [];
      for (let ch = 0; ch < channels; ch++) {
        const raw = audioBuf.getChannelData(
          Math.min(ch, audioBuf.numberOfChannels - 1)
        );
        resampledChannels.push(
          resampleChannelData(raw, audioBuf.sampleRate, targetSr)
        );
      }

      const totalSamples = resampledChannels[0]?.length || 0;
      const chunkFrames = 4096;

      for (let offset = 0; offset < totalSamples; offset += chunkFrames) {
        const count = Math.min(chunkFrames, totalSamples - offset);
        const planar = new Float32Array(count * channels);
        for (let ch = 0; ch < channels; ch++) {
          planar.set(
            resampledChannels[ch].subarray(offset, offset + count),
            ch * count
          );
        }
        const timestampUs = Math.round((offset / targetSr) * 1_000_000);
        const audioData = new AudioData({
          format: 'f32-planar',
          sampleRate: targetSr,
          numberOfFrames: count,
          numberOfChannels: channels,
          timestamp: timestampUs,
          data: planar,
        });
        audioEncoder.encode(audioData);
        audioData.close();
      }
      await audioEncoder.flush();
    } catch {
      audioEncoder = null;
    }
  }

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = evenW;
  exportCanvas.height = evenH;
  const exportCtx = exportCanvas.getContext('2d');
  if (!exportCtx) return null;

  const frameDurationUs = Math.round((1 / options.fps) * 1_000_000);

  for (let i = 0; i < options.totalFrames; i++) {
    if (options.shouldCancel?.()) {
      try {
        videoEncoder.close();
      } catch {
        // Ignore
      }
      throw new Error('EXPORT_CANCELLED');
    }

    await options.renderFrameAt(i, exportCtx, evenW, evenH);

    const timestampUs = Math.round((i / options.fps) * 1_000_000);
    const vf = new VideoFrame(exportCanvas, {
      timestamp: timestampUs,
      duration: frameDurationUs,
    });

    videoEncoder.encode(vf, { keyFrame: i % 24 === 0 });
    vf.close();

    const pct = Math.min(
      98,
      Math.max(1, Math.round(((i + 1) / Math.max(1, options.totalFrames)) * 98))
    );
    options.onProgress(pct);

    if (i % 3 === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  await videoEncoder.flush();
  videoEncoder.close();
  if (audioEncoder && audioEncoder.state !== 'closed') {
    audioEncoder.close();
  }

  muxer.finalize();
  options.onProgress(100);

  const mp4Blob = new Blob([target.buffer], { type: 'video/mp4' });
  const url = URL.createObjectURL(mp4Blob);
  const filename = `toonsync-studio-${Date.now()}.mp4`;

  return {
    blob: mp4Blob,
    url,
    filename,
    formatLabel: 'MP4 (H.264 / AVC1 · CapCut & Gallery Ready)',
  };
}

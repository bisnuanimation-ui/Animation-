import React, { useRef, useState } from 'react';
import {
  AudioAnalysisFrame,
  EngineConfig,
  LipSyncCue,
  MOUTH_CHART_12_ORDER,
  MotionPhase,
  VISEME_LIBRARY,
  VisemeCode,
} from '../types/studio';
import {
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

interface TimelinePanelProps {
  frames: AudioAnalysisFrame[];
  cues: LipSyncCue[];
  currentFrameIndex: number;
  isPlaying: boolean;
  config: EngineConfig;
  selectedCueId: string | null;
  onSeekFrame: (frameIndex: number) => void;
  onTogglePlay: () => void;
  onSelectCue: (cueId: string | null) => void;
  onUpdateCue: (cueId: string, patch: Partial<LipSyncCue>) => void;
  onReanalyzeAuto: () => void;
}

export const TimelinePanel: React.FC<TimelinePanelProps> = ({
  frames,
  cues,
  currentFrameIndex,
  isPlaying,
  config,
  selectedCueId,
  onSeekFrame,
  onTogglePlay,
  onSelectCue,
  onUpdateCue,
  onReanalyzeAuto,
}) => {
  const [zoomPxPerFrame, setZoomPxPerFrame] = useState<number>(6);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);

  const totalFrames = Math.max(1, frames.length);
  const timelineWidth = Math.max(820, totalFrames * zoomPxPerFrame);
  const currentFrame = frames[currentFrameIndex] || frames[0];
  const selectedCue = cues.find((c) => c.id === selectedCueId) || null;

  const handleTimelinePointer = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / timelineWidth));
    const targetFrame = Math.min(totalFrames - 1, Math.floor(ratio * totalFrames));
    onSeekFrame(targetFrame);
  };

  const silenceYPercent = Math.max(
    5,
    Math.min(95, 100 - ((config.silenceThresholdDb + 60) / 60) * 100)
  );
  const peakYPercent = Math.max(
    5,
    Math.min(95, 100 - ((config.peakThresholdDb + 60) / 60) * 100)
  );

  const formatTimecode = (frameIdx: number) => {
    const sec = frameIdx / config.fps;
    const mins = Math.floor(sec / 60);
    const remSec = Math.floor(sec % 60);
    const remFrames = frameIdx % config.fps;
    return `${String(mins).padStart(2, '0')}:${String(remSec).padStart(2, '0')}:${String(
      remFrames
    ).padStart(2, '0')}`;
  };

  return (
    <section
      aria-label="Audio Peak & Mouth Chart Auto-Listing Timeline"
      className="bg-[#0F1522] border-t border-slate-800/90 flex flex-col select-none"
    >
      {/* Transport & Live Frame Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-b border-slate-800/80 bg-[#0B0F17]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSeekFrame(0)}
            title="প্রথম ফ্রেমে যান (First Frame)"
            className="p-1.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onSeekFrame(Math.max(0, currentFrameIndex - 1))}
            title="১ ফ্রেম পিছনে (Prev Frame)"
            className="p-1.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onTogglePlay}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors whitespace-nowrap cursor-pointer"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isPlaying ? 'থামান (Pause)' : 'চালান (Play Sync)'}</span>
          </button>
          <button
            type="button"
            onClick={() => onSeekFrame(Math.min(totalFrames - 1, currentFrameIndex + 1))}
            title="১ ফ্রেম সামনে (Next Frame)"
            className="p-1.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          <div className="ml-2 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 font-mono text-xs text-slate-200 tabular-nums">
            <span>{formatTimecode(currentFrameIndex)}</span>
            <span className="mx-1.5 text-slate-600">·</span>
            <span className="text-amber-400">
              F {String(currentFrameIndex).padStart(4, '0')} / {totalFrames}
            </span>
          </div>
        </div>

        {/* Center: Live Audio Peak vs Auto-Drop Indicator */}
        {currentFrame && (
          <div className="flex items-center gap-2.5 text-xs font-mono tabular-nums text-slate-300">
            <span>
              অডিও পিক: <strong className="text-white">{currentFrame.db.toFixed(1)} dB</strong>
            </span>
            <span className="text-slate-600">·</span>
            <span>
              মাউথ চার্ট:{' '}
              <strong
                className={
                  currentFrame.isDropped
                    ? 'text-slate-400'
                    : currentFrame.phase === MotionPhase.PEAK
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }
              >
                {currentFrame.isDropped
                  ? 'অডিও নেই → মাউথ ড্রপ (স্কিপ)'
                  : `[ ${VISEME_LIBRARY[currentFrame.viseme].shortCode} ] · অটো লিস্টিং`}
              </strong>
            </span>
            <span className="text-slate-600">·</span>
            <span>
              লিফট: <strong className="text-amber-300">+{currentFrame.liftY.toFixed(1)} px</strong>
            </span>
          </div>
        )}

        {/* Right: Auto Re-Sync & Timeline Zoom */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReanalyzeAuto}
            className="px-2.5 py-1 rounded border border-slate-700 hover:border-slate-500 text-xs text-slate-300 hover:text-white transition-colors whitespace-nowrap cursor-pointer"
          >
            অটো লিস্টিং রিসেট
          </button>
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5">
            <button
              type="button"
              onClick={() => setZoomPxPerFrame((z) => Math.max(3, z - 1.5))}
              title="Zoom Out Timeline"
              className="p-1 text-slate-400 hover:text-white cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono text-slate-400 px-1 tabular-nums">
              {zoomPxPerFrame.toFixed(0)}px/f
            </span>
            <button
              type="button"
              onClick={() => setZoomPxPerFrame((z) => Math.min(18, z + 1.5))}
              title="Zoom In Timeline"
              className="p-1 text-slate-400 hover:text-white cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Selected Cue Override Bar */}
      {selectedCue && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-slate-900/95 border-b border-slate-800 text-xs">
          <div className="flex items-center gap-2 font-mono tabular-nums text-slate-300">
            <span className="text-amber-400 font-semibold">
              ফ্রেম {selectedCue.startFrame}–{selectedCue.endFrame} ({selectedCue.startTime.toFixed(2)}s–
              {selectedCue.endTime.toFixed(2)}s)
            </span>
            <span className="text-slate-600">·</span>
            <span>
              {selectedCue.isDropped ? 'অডিও নেই (Auto-Dropped)' : `পিক: ${selectedCue.peakDb} dB`}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-400">মাউথ চার্ট শেপ:</span>
            <button
              type="button"
              onClick={() =>
                onUpdateCue(selectedCue.id, {
                  viseme: VisemeCode.DROP,
                  isDropped: true,
                  liftPx: 0,
                  locked: true,
                })
              }
              className={`px-2 py-0.5 rounded font-mono text-[11px] font-semibold transition-colors cursor-pointer ${
                selectedCue.viseme === VisemeCode.DROP
                  ? 'bg-rose-500 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              DROP (অডিও নেই)
            </button>
            {MOUTH_CHART_12_ORDER.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() =>
                  onUpdateCue(selectedCue.id, {
                    viseme: code,
                    isDropped: false,
                    locked: true,
                    liftPx:
                      code === VisemeCode.AEI || code === VisemeCode.O
                        ? config.maxLiftPx
                        : Math.max(8, selectedCue.liftPx),
                  })
                }
                className={`px-2 py-0.5 rounded font-mono text-[11px] font-semibold transition-colors cursor-pointer ${
                  selectedCue.viseme === code
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {VISEME_LIBRARY[code].shortCode}
              </button>
            ))}

            <button
              type="button"
              onClick={() => onSelectCue(null)}
              className="text-slate-400 hover:text-white ml-2 cursor-pointer"
            >
              বন্ধ করুন
            </button>
          </div>
        </div>
      )}

      {/* Multi-Track Timeline Area */}
      <div className="flex w-full overflow-hidden">
        <div className="w-52 shrink-0 bg-[#0B0F17] border-r border-slate-800 flex flex-col text-xs">
          <div className="h-6 border-b border-slate-800/80 px-3 flex items-center text-[11px] font-mono text-slate-400">
            FRAME / SEC RULER
          </div>
          <div className="h-14 border-b border-slate-800/80 px-3 flex flex-col justify-center">
            <span className="font-semibold text-slate-200">01. ভয়েস ও অডিও পিক ট্র্যাক</span>
            <span className="text-[11px] text-slate-400">অডিও না থাকলে অটো ড্রপ (Drop)</span>
          </div>
          <div className="h-10 border-b border-slate-800/80 px-3 flex flex-col justify-center">
            <span className="font-semibold text-slate-200">02. ক্যারেক্টার লিফটিং গ্রাফ</span>
            <span className="text-[11px] text-slate-400">Auto Peak Lift (0–{config.maxLiftPx}px)</span>
          </div>
          <div className="h-11 px-3 flex flex-col justify-center">
            <span className="font-semibold text-slate-200">03. মাউথ চার্ট অটো-লিস্টিং</span>
            <span className="text-[11px] text-slate-400">Active Mouths (Silent = Dropped)</span>
          </div>
        </div>

        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-x-auto overflow-y-hidden relative bg-[#0D131F]"
        >
          <div
            style={{ width: `${timelineWidth}px` }}
            className="relative flex flex-col"
            onMouseDown={(e) => {
              setIsScrubbing(true);
              handleTimelinePointer(e);
            }}
            onMouseMove={(e) => {
              if (isScrubbing) handleTimelinePointer(e);
            }}
            onMouseUp={() => setIsScrubbing(false)}
            onMouseLeave={() => setIsScrubbing(false)}
          >
            {/* 0. Ruler */}
            <div className="h-6 border-b border-slate-800/80 relative flex items-center bg-[#0B0F17] cursor-ew-resize">
              {Array.from({ length: Math.ceil(totalFrames / config.fps) + 1 }).map((_, secIdx) => {
                const f = secIdx * config.fps;
                const leftPx = f * zoomPxPerFrame;
                if (leftPx > timelineWidth) return null;
                return (
                  <div
                    key={secIdx}
                    style={{ left: `${leftPx}px` }}
                    className="absolute top-0 bottom-0 border-l border-slate-700/80 pl-1.5 flex items-center text-[10px] font-mono text-slate-400 tabular-nums pointer-events-none"
                  >
                    {secIdx}s (F{f})
                  </div>
                );
              })}
            </div>

            {/* 1. Audio Peak Waveform Track */}
            <div className="h-14 border-b border-slate-800/80 relative overflow-hidden cursor-ew-resize">
              <div
                style={{ top: `${peakYPercent}%` }}
                className="absolute left-0 right-0 border-t border-dashed border-amber-500/60 pointer-events-none z-10"
              >
                <span className="bg-slate-950/80 text-amber-400 text-[10px] font-mono px-1 ml-1">
                  PEAK ({config.peakThresholdDb}dB)
                </span>
              </div>

              <div
                style={{ top: `${silenceYPercent}%` }}
                className="absolute left-0 right-0 border-t border-dashed border-rose-400/50 pointer-events-none z-10"
              >
                <span className="bg-slate-950/80 text-rose-300 text-[10px] font-mono px-1 ml-28">
                  AUTO-DROP GATE ({config.silenceThresholdDb}dB)
                </span>
              </div>

              <div className="absolute inset-0 flex items-end">
                {frames.map((fr) => {
                  const heightPercent = fr.isDropped
                    ? 6
                    : Math.max(8, ((fr.db + 60) / 60) * 100);
                  let barColor = 'bg-slate-800/40';
                  if (!fr.isDropped) {
                    if (fr.phase === MotionPhase.PEAK) barColor = 'bg-amber-400';
                    else if (fr.phase === MotionPhase.RISING) barColor = 'bg-emerald-400';
                    else if (fr.phase === MotionPhase.HOLD) barColor = 'bg-sky-400';
                    else barColor = 'bg-teal-500/80';
                  }

                  return (
                    <div
                      key={fr.frame}
                      style={{
                        width: `${zoomPxPerFrame}px`,
                        height: `${heightPercent}%`,
                      }}
                      className={`${barColor} shrink-0 border-r border-slate-950/30`}
                    />
                  );
                })}
              </div>
            </div>

            {/* 2. Character Lift Curve Track */}
            <div className="h-10 border-b border-slate-800/80 relative flex items-end bg-[#0B101B] cursor-ew-resize">
              {frames.map((fr) => {
                const liftRatio =
                  config.maxLiftPx > 0 ? Math.min(1, fr.liftY / config.maxLiftPx) : 0;
                const hPct = Math.round(liftRatio * 90);
                return (
                  <div
                    key={fr.frame}
                    style={{
                      width: `${zoomPxPerFrame}px`,
                      height: `${Math.max(2, hPct)}%`,
                    }}
                    className={`shrink-0 ${
                      fr.liftY > 0.5 ? 'bg-amber-500/75' : 'bg-slate-800/25'
                    }`}
                  />
                );
              })}
            </div>

            {/* 3. Mouth Chart Auto-Listing Track (Silent intervals are visually dropped/empty!) */}
            <div className="h-11 relative bg-[#090D16]">
              {cues.map((cue) => {
                const leftPx = cue.startFrame * zoomPxPerFrame;
                const widthPx = Math.max(
                  zoomPxPerFrame,
                  (cue.endFrame - cue.startFrame + 1) * zoomPxPerFrame
                );
                const meta = VISEME_LIBRARY[cue.viseme];
                const isSelected = cue.id === selectedCueId;

                // When cue.isDropped is true (no audio), render a quiet dashed "DROP / NO AUDIO" gap
                if (cue.isDropped) {
                  return (
                    <button
                      key={cue.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectCue(cue.id);
                        onSeekFrame(cue.startFrame);
                      }}
                      style={{
                        left: `${leftPx}px`,
                        width: `${widthPx}px`,
                      }}
                      title={`Frames ${cue.startFrame}-${cue.endFrame}: অডিও নেই — অটোমেটিক মাউথ ড্রপ (কোনো কিউ নেই)`}
                      className={`absolute top-2 bottom-2 rounded border border-dashed border-slate-800/90 bg-slate-950/40 px-1.5 overflow-hidden flex items-center justify-center cursor-pointer ${
                        isSelected ? 'ring-1 ring-rose-400 z-20' : 'hover:border-slate-700'
                      }`}
                    >
                      {widthPx >= 48 && (
                        <span className="font-mono text-[9px] text-slate-500 truncate">
                          DROP (অডিও নেই)
                        </span>
                      )}
                    </button>
                  );
                }

                // Active Mouth Chart Cue Block
                return (
                  <button
                    key={cue.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectCue(cue.id);
                      onSeekFrame(cue.startFrame);
                    }}
                    style={{
                      left: `${leftPx}px`,
                      width: `${widthPx}px`,
                      backgroundColor: `${meta.color}28`,
                      borderColor: isSelected ? '#F8FAFC' : meta.color,
                    }}
                    title={`Frame ${cue.startFrame}-${cue.endFrame}: Mouth Chart [${meta.shortCode}] (${meta.nameBn}) | Lift +${cue.liftPx}px`}
                    className={`absolute top-1.5 bottom-1.5 rounded border text-left px-1.5 overflow-hidden flex items-center justify-between transition-transform cursor-pointer ${
                      isSelected ? 'ring-1 ring-white z-20' : 'hover:brightness-125'
                    }`}
                  >
                    <span
                      style={{ color: meta.color }}
                      className="font-mono font-bold text-[11px] leading-none truncate"
                    >
                      {meta.shortCode}
                    </span>
                    {widthPx >= 48 && cue.liftPx > 0 && (
                      <span className="font-mono text-[9px] text-slate-300 truncate ml-1 tabular-nums">
                        +{Math.round(cue.liftPx)}px
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Playhead */}
            <div
              style={{ left: `${currentFrameIndex * zoomPxPerFrame}px` }}
              className="absolute top-0 bottom-0 w-0.5 bg-amber-400 pointer-events-none z-30"
            >
              <div className="w-3 h-3 -ml-[5px] bg-amber-400 rotate-45 rounded-xs" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

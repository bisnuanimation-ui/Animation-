import React, { useEffect, useRef } from 'react';
import {
  CustomSpriteMap,
  MOUTH_CHART_12_ORDER,
  MouthChartStyleId,
  VISEME_LIBRARY,
  VisemeCode,
} from '../types/studio';
import {
  LoadedSpriteImages,
  renderMouthChartThumbnail,
} from '../engine/canvasRenderer';
import { Grid, Scissors } from 'lucide-react';

interface MouthChartBoardProps {
  activeViseme: VisemeCode;
  isCurrentFrameDropped: boolean;
  chartStyle: MouthChartStyleId;
  customSprites: CustomSpriteMap;
  loadedSprites: LoadedSpriteImages;
  onSelectChartStyle: (style: MouthChartStyleId) => void;
  onClickMouthShape: (viseme: VisemeCode) => void;
  onUploadChartSheetToSlice: (file: File) => void;
}

const SingleMouthCellCanvas: React.FC<{
  viseme: VisemeCode;
  chartStyle: MouthChartStyleId;
  loadedSprites: LoadedSpriteImages;
  customSpriteUrl?: string;
}> = ({ viseme, chartStyle, loadedSprites, customSpriteUrl }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    renderMouthChartThumbnail(canvasRef.current, viseme, chartStyle, loadedSprites);
  }, [viseme, chartStyle, loadedSprites, customSpriteUrl]);

  return (
    <canvas
      ref={canvasRef}
      width={88}
      height={54}
      className="w-full h-11 rounded-xs object-contain pointer-events-none"
    />
  );
};

export const MouthChartBoard: React.FC<MouthChartBoardProps> = ({
  activeViseme,
  isCurrentFrameDropped,
  chartStyle,
  customSprites,
  loadedSprites,
  onSelectChartStyle,
  onClickMouthShape,
  onUploadChartSheetToSlice,
}) => {
  return (
    <div className="bg-[#0B0F17] border-t border-slate-800/90 px-4 py-2.5 flex flex-col gap-2">
      {/* Top Row: Chart Style Switcher + Auto-Drop Status + Upload Chart Sheet Slicer */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <Grid className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-semibold text-white">
            লাইভ মাউথ চার্ট বোর্ড (১২টি ফোনিম ও অটো-ড্রপ চার্ট):
          </span>

          {/* 3 Built-in Reference Chart Styles */}
          <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded border border-slate-800">
            {(
              [
                { id: 'studio-12', label: '12-Phoneme Chart' },
                { id: 'cartoon-34', label: '3/4 Cartoon Sync' },
                { id: 'manga-bw', label: 'Manga B&W Chart' },
              ] as const
            ).map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => onSelectChartStyle(st.id)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  chartStyle === st.id
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Auto-Slice Uploaded Mouth Chart Sheet + Silent Drop Status */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onClickMouthShape(VisemeCode.DROP)}
            title="যেখানে কোনো অডিও নেই সেখানে অটোমেটিক মাউথ ড্রপ (Neutral Rest) হবে"
            className={`px-2.5 py-1 rounded border font-mono text-[11px] transition-colors whitespace-nowrap cursor-pointer ${
              isCurrentFrameDropped || activeViseme === VisemeCode.DROP
                ? 'bg-rose-500/20 border-rose-400 text-rose-200 font-semibold'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {isCurrentFrameDropped
              ? '● NO AUDIO: মাউথ ড্রপ (স্কিপ)'
              : '○ অডিও চলমান (Auto-Listing Active)'}
          </button>

          <label className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-medium text-amber-300 cursor-pointer transition-colors whitespace-nowrap">
            <Scissors className="w-3 h-3" />
            <span>মাউথ চার্ট শিট আপলোড (Auto-Slice 4×3)</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUploadChartSheetToSlice(f);
              }}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* 12-Mouth Chart Visual Grid (Matches the 12-Mouth Phoneme Charts uploaded by the user) */}
      <div className="grid grid-cols-4 sm:grid-cols-6 xl:grid-cols-12 gap-1.5">
        {MOUTH_CHART_12_ORDER.map((code) => {
          const meta = VISEME_LIBRARY[code];
          const isActive = !isCurrentFrameDropped && activeViseme === code;
          return (
            <button
              key={code}
              type="button"
              onClick={() => onClickMouthShape(code)}
              title={`${meta.nameBn} — ক্লিক করলে বর্তমান কি-ফ্রেমে এই মুখের শেপটি সেট হবে`}
              className={`group flex flex-col items-center p-1 rounded border transition-transform cursor-pointer ${
                isActive
                  ? 'bg-amber-500/20 border-amber-400 ring-1 ring-amber-400 -translate-y-0.5'
                  : 'bg-slate-900/90 border-slate-800 hover:border-slate-600'
              }`}
            >
              <SingleMouthCellCanvas
                viseme={code}
                chartStyle={chartStyle}
                loadedSprites={loadedSprites}
                customSpriteUrl={customSprites[code]}
              />
              <span
                className={`mt-1 font-mono text-[10px] font-bold leading-none truncate max-w-full ${
                  isActive ? 'text-amber-300' : 'text-slate-300 group-hover:text-white'
                }`}
              >
                {meta.shortCode}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

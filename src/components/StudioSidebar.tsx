import React from 'react';
import {
  CharacterPresetId,
  EngineConfig,
  MouthAnchorConfig,
  MouthChartStyleId,
  MotionPhase,
} from '../types/studio';
import {
  FileArchive,
  Film,
  ImagePlus,
  Mic,
  Scissors,
  Sparkles,
  Square,
  UserCheck,
  Volume2,
} from 'lucide-react';

interface StudioSidebarProps {
  config: EngineConfig;
  customCharacterUrl?: string;
  mediaSourceTitle: string;
  hasUploadedVideo: boolean;
  isRecordingMic: boolean;
  totalDurationSec: number;
  activeCuesCount: number;
  droppedCuesCount: number;
  phaseBreakdown: Record<MotionPhase, number>;
  onUploadCustomCharacter: (file: File) => void;
  onUploadMediaFile: (file: File) => void;
  onUploadZipOrListing: (file: File) => void;
  onUploadChartSheetToSlice: (file: File) => void;
  onLoadDemoSpeech: () => void;
  onToggleMicRecording: () => void;
  onUpdateConfig: (patch: Partial<EngineConfig>) => void;
  onUpdateMouthAnchor: (patch: Partial<MouthAnchorConfig>) => void;
}

const CHARACTER_PRESETS: Array<{
  id: CharacterPresetId;
  titleBn: string;
  subtitle: string;
}> = [
  {
    id: 'custom-character',
    titleBn: 'নিজের ক্যারেক্টার (Uploaded Character)',
    subtitle: 'আপনার আপলোড করা যেকোনো ২ডি ক্যারেক্টারে মাউথ চার্ট বসান',
  },
  {
    id: 'arjun-2d',
    titleBn: 'অর্জুন (Built-in Studio Rig)',
    subtitle: '১২টি মাউথ চার্ট এক্সপ্রেশন ও বডি লিফটিং',
  },
  {
    id: 'mina-toon',
    titleBn: 'মিনা (Expressive 2D Toon)',
    subtitle: 'অ্যানিমে/কার্টুন মাউথ চার্ট ও স্কোয়াশ-স্ট্রেচ',
  },
  {
    id: 'mouth-only-overlay',
    titleBn: 'শুধু মাউথ চার্ট (Mouth-Only)',
    subtitle: 'ভিডিও বা ব্যাকগ্রাউন্ডের উপর শুধু মুখের চার্ট বসানোর জন্য',
  },
];

const CHART_STYLES: Array<{
  id: MouthChartStyleId;
  titleBn: string;
  desc: string;
}> = [
  {
    id: 'studio-12',
    titleBn: 'চার্ট ১: 12-Phoneme Studio (A,E,I / B,M,P / O / L)',
    desc: 'দাঁত, গোলাপি জিহ্বা ও গালের দাগসহ ১২টি স্ট্যান্ডার্ড মুখের চার্ট',
  },
  {
    id: 'cartoon-34',
    titleBn: 'চার্ট ২: Cartoon Lip Sync (3/4 Side & Chin)',
    desc: '৩/৪ সাইড অ্যাঙ্গেল কার্টুন মুখ ও থুতনির দাগ (Ah, Ee, Oh, WO)',
  },
  {
    id: 'manga-bw',
    titleBn: 'চার্ট ৩: Anime / Manga B&W Ink Chart',
    desc: 'সাদা-কালো লাইন আর্ট ও দাঁতের মাঙ্গা এক্সপ্রেশন চার্ট',
  },
];

export const StudioSidebar: React.FC<StudioSidebarProps> = ({
  config,
  customCharacterUrl,
  mediaSourceTitle,
  hasUploadedVideo,
  isRecordingMic,
  totalDurationSec,
  activeCuesCount,
  droppedCuesCount,
  phaseBreakdown,
  onUploadCustomCharacter,
  onUploadMediaFile,
  onUploadZipOrListing,
  onUploadChartSheetToSlice,
  onLoadDemoSpeech,
  onToggleMicRecording,
  onUpdateConfig,
  onUpdateMouthAnchor,
}) => {
  return (
    <aside className="w-full lg:w-[295px] shrink-0 bg-[#0F1522] border-r border-slate-800/90 flex flex-col h-full overflow-y-auto p-4 space-y-4">
      {/* 01. Upload Your Own 2D Character Section */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-white">
            01. নিজের ২ডি ক্যারেক্টার আপলোড করুন
          </h2>
          <UserCheck className="w-3.5 h-3.5 text-amber-400" />
        </div>

        <label className="flex flex-col items-center justify-center p-3 rounded-lg border border-dashed border-amber-500/60 hover:border-amber-400 bg-amber-500/10 hover:bg-amber-500/15 cursor-pointer transition-colors text-center">
          {customCharacterUrl ? (
            <div className="flex items-center gap-2.5 w-full text-left">
              <img
                src={customCharacterUrl}
                alt="Uploaded 2D Character"
                referrerPolicy="no-referrer"
                className="w-11 h-11 rounded object-contain bg-slate-900 border border-amber-400/60 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-amber-300 truncate">
                  ✓ কাস্টম ক্যারেক্টার সক্রিয়
                </div>
                <div className="text-[11px] text-slate-300">
                  অন্য ক্যারেক্টার দিতে এখানে ক্লিক করুন
                </div>
              </div>
            </div>
          ) : (
            <>
              <ImagePlus className="w-5 h-5 text-amber-400 mb-1" />
              <span className="text-xs font-semibold text-white">
                আপনার ২ডি ক্যারেক্টারের ছবি দিন (.PNG / .JPG)
              </span>
              <span className="text-[11px] text-slate-300 mt-0.5">
                যেকোনো কার্টুন ক্যারেক্টার আপলোড করে মুখে লিপ-সিঙ্ক বসান
              </span>
            </>
          )}
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadCustomCharacter(f);
            }}
            className="hidden"
          />
        </label>

        {/* Quick Mouth Fit Controls on Character Face */}
        <div className="p-2.5 rounded bg-slate-900/90 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-300 font-medium">মুখের চার্ট সাইজ (Mouth Size)</span>
            <span className="font-mono text-amber-300 tabular-nums">
              {Math.round(config.mouthAnchor.scale * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0.35}
            max={2.4}
            step={0.05}
            value={config.mouthAnchor.scale}
            onChange={(e) => onUpdateMouthAnchor({ scale: Number(e.target.value) })}
            className="w-full accent-amber-500 cursor-pointer"
          />

          <div className="flex items-center justify-between text-[11px] pt-1">
            <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={config.mouthAnchor.skinMaskEnabled}
                onChange={(e) => onUpdateMouthAnchor({ skinMaskEnabled: e.target.checked })}
                className="accent-amber-500"
              />
              <span>আগের আঁকা মুখ ঢাকুন (Skin Patch)</span>
            </label>
            {config.mouthAnchor.skinMaskEnabled && (
              <input
                type="color"
                value={config.mouthAnchor.skinMaskColor}
                onChange={(e) => onUpdateMouthAnchor({ skinMaskColor: e.target.value })}
                title="ক্যারেক্টারের মুখের স্কিন কালার সিলেক্ট করুন"
                className="w-6 h-5 rounded border border-slate-700 bg-transparent cursor-pointer"
              />
            )}
          </div>
        </div>
      </div>

      {/* 02. Voice / Audio / Video & Chart Sheet Input */}
      <div className="space-y-2 pt-3 border-t border-slate-800/80">
        <h2 className="text-xs font-semibold text-slate-200">
          02. ভয়েস (অডিও/ভিডিও) ও চার্ট শিট ইনপুট
        </h2>

        <label className="flex items-center justify-center gap-2 p-2.5 rounded-lg border border-dashed border-sky-500/50 hover:border-sky-400 bg-sky-500/5 hover:bg-sky-500/10 cursor-pointer transition-colors">
          <Film className="w-4 h-4 text-sky-400 shrink-0" />
          <div className="text-left min-w-0">
            <div className="text-xs font-semibold text-white truncate">
              ভয়েস অডিও বা ভিডিও আপলোড করুন
            </div>
            <div className="text-[10px] text-slate-400 truncate">
              অডিও পিক অনুযায়ী অটো-লিস্টিং ও লিফটিং হবে
            </div>
          </div>
          <input
            type="file"
            accept="video/*,audio/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadMediaFile(f);
            }}
            className="hidden"
          />
        </label>

        <div className="grid grid-cols-2 gap-1.5">
          <label className="flex items-center justify-center gap-1 py-1.5 px-2 rounded border border-slate-700 hover:border-amber-400 bg-slate-900/90 text-[11px] font-medium text-amber-300 cursor-pointer transition-colors">
            <Scissors className="w-3 h-3 shrink-0" />
            <span className="truncate">চার্ট শিট স্লাইস</span>
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

          <label className="flex items-center justify-center gap-1 py-1.5 px-2 rounded border border-slate-700 hover:border-emerald-400 bg-slate-900/90 text-[11px] font-medium text-emerald-300 cursor-pointer transition-colors">
            <FileArchive className="w-3 h-3 shrink-0" />
            <span className="truncate">ZIP / লিস্টিং</span>
            <input
              type="file"
              accept=".zip,.json,.tsv,.csv,.dat"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUploadZipOrListing(f);
              }}
              className="hidden"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={onLoadDemoSpeech}
            className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded bg-slate-800/90 hover:bg-slate-700 text-xs text-slate-200 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Volume2 className="w-3.5 h-3.5 text-sky-400" />
            <span>ডেমো ভয়েস</span>
          </button>

          <button
            type="button"
            onClick={onToggleMicRecording}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              isRecordingMic
                ? 'bg-rose-600 text-white animate-pulse'
                : 'bg-slate-800/90 hover:bg-slate-700 text-slate-200'
            }`}
          >
            {isRecordingMic ? (
              <>
                <Square className="w-3.5 h-3.5" />
                <span>থামান (Stop)</span>
              </>
            ) : (
              <>
                <Mic className="w-3.5 h-3.5 text-rose-400" />
                <span>মাইক ভয়েস</span>
              </>
            )}
          </button>
        </div>

        <div className="pt-0.5 text-[11px] text-slate-400 font-mono tabular-nums truncate">
          <span>{mediaSourceTitle}</span>
          <span className="mx-1">·</span>
          <span>{totalDurationSec.toFixed(1)}s</span>
          <span className="mx-1">·</span>
          <span>{activeCuesCount} Active</span>
        </div>
      </div>

      {/* 03. Character Mode Selector */}
      <div className="space-y-1.5 pt-3 border-t border-slate-800/80">
        <h2 className="text-xs font-semibold text-slate-200">
          03. ক্যারেক্টার সিলেকশন (Custom বা স্টুডিও)
        </h2>

        <div className="space-y-1.5">
          {CHARACTER_PRESETS.map((preset) => {
            const active = config.characterPreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onUpdateConfig({ characterPreset: preset.id })}
                className={`w-full p-2 rounded border text-left transition-colors cursor-pointer ${
                  active
                    ? 'bg-amber-500/15 border-amber-500/80 text-white'
                    : 'bg-slate-900/70 border-slate-800/90 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="text-xs font-semibold flex items-center justify-between">
                  <span>{preset.titleBn}</span>
                  {active && <span className="text-[10px] font-mono text-amber-400">ON</span>}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                  {preset.subtitle}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 04. Mouth Chart Style Selector */}
      <div className="space-y-1.5 pt-3 border-t border-slate-800/80">
        <h2 className="text-xs font-semibold text-slate-200">
          04. মুখের এক্সপ্রেশন চার্ট স্টাইল
        </h2>
        <div className="space-y-1.5">
          {CHART_STYLES.map((st) => {
            const active = config.mouthChartStyle === st.id;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => onUpdateConfig({ mouthChartStyle: st.id })}
                className={`w-full p-2 rounded border text-left transition-colors cursor-pointer ${
                  active
                    ? 'bg-sky-500/15 border-sky-400/80 text-white'
                    : 'bg-slate-900/70 border-slate-800/90 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="text-xs font-semibold">{st.titleBn}</div>
                <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">{st.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 05. Voice Active vs Silent Auto-Drop Breakdown */}
      <div className="space-y-1.5 pt-3 border-t border-slate-800/80">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-slate-200">
            05. ভয়েস লিস্টিং বনাম মাউথ ড্রপ
          </h2>
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
        </div>
        <div className="divide-y divide-slate-800/80 border border-slate-800 rounded bg-[#0B0F17] text-xs font-mono tabular-nums">
          <div className="px-2.5 py-1.5 flex items-center justify-between">
            <span className="text-rose-300">অডিও নেই → মাউথ ড্রপ</span>
            <span className="text-slate-200">
              {phaseBreakdown[MotionPhase.SILENCE] || 0}f ({droppedCuesCount} gaps)
            </span>
          </div>
          <div className="px-2.5 py-1.5 flex items-center justify-between">
            <span className="text-emerald-400">সক্রিয় মাউথ অটো-লিস্টিং</span>
            <span className="text-emerald-300">{activeCuesCount} Cues</span>
          </div>
        </div>
        {hasUploadedVideo && (
          <div className="text-[11px] text-emerald-400">
            ✓ ভিডিওর ভয়েস অনুযায়ী ১২টি মাউথ চার্ট অটো-লিস্টিং সক্রিয়।
          </div>
        )}
      </div>
    </aside>
  );
};

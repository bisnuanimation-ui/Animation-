import React, { useEffect, useState } from 'react';
import {
  CustomSpriteMap,
  DEFAULT_PER_KEY_LIFT,
  EngineConfig,
  LipSyncCue,
  LipstickStyleConfig,
  MOUTH_CHART_12_ORDER,
  MouthAnchorConfig,
  MouthChartStyleId,
  VISEME_LIBRARY,
  VisemeCode,
  ZipAssetEntry,
} from '../types/studio';
import {
  LoadedSpriteImages,
  renderMouthChartThumbnail,
} from '../engine/canvasRenderer';
import {
  formatListingCode,
  parseListingText,
} from '../engine/zipListingParser';
import {
  Check,
  Code2,
  Download,
  FileArchive,
  Grid,
  RotateCcw,
  Scissors,
  Sliders,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';

interface SettingsLogicModalProps {
  isOpen: boolean;
  initialSection?: 'mouth-charts' | 'auto-listing' | 'dsp-logic';
  config: EngineConfig;
  cues: LipSyncCue[];
  zipEntries: ZipAssetEntry[];
  customSprites: CustomSpriteMap;
  loadedSprites: LoadedSpriteImages;
  activeViseme: VisemeCode;
  onClose: () => void;
  onUpdateConfig: (patch: Partial<EngineConfig>) => void;
  onUpdateMouthAnchor: (patch: Partial<MouthAnchorConfig>) => void;
  onUpdatePerKeyLift: (viseme: VisemeCode, liftPx: number) => void;
  onResetPerKeyLift: () => void;
  onUpdateLipstickStyle: (patch: Partial<LipstickStyleConfig>) => void;
  onApplyImportedCues: (cues: LipSyncCue[], configPartial?: Partial<EngineConfig> | null) => void;
  onUpdateSingleCue: (cueId: string, patch: Partial<LipSyncCue>) => void;
  onSeekFrame: (frame: number) => void;
  onAssignSprite: (
    target: VisemeCode | 'head' | 'body' | 'eyes' | 'customCharacter',
    blobUrl: string | undefined
  ) => void;
  onUploadZipOrListingFile: (file: File) => void;
  onUploadChartSheetToSlice: (file: File, cols: number, rows: number) => void;
  onExportZipPackage: () => void;
}

export const LIPSTICK_PRESETS: Array<{
  id: LipstickStyleConfig['presetId'];
  label: string;
  color: string;
  gloss: boolean;
}> = [
  { id: 'classic-ink', label: 'Classic Ink', color: '#231924', gloss: false },
  { id: 'ruby-red', label: 'Ruby Red', color: '#E11D48', gloss: true },
  { id: 'coral-pink', label: 'Coral Pink', color: '#FB7185', gloss: true },
  { id: 'berry-plum', label: 'Berry Plum', color: '#9333EA', gloss: true },
  { id: 'matte-nude', label: 'Matte Nude', color: '#C27D6A', gloss: false },
  { id: 'custom', label: 'Custom', color: '#F43F5E', gloss: true },
];

const MouthThumbCanvas: React.FC<{
  viseme: VisemeCode;
  chartStyle: MouthChartStyleId;
  loadedSprites: LoadedSpriteImages;
  lipstickStyle: LipstickStyleConfig;
  customUrl?: string;
}> = ({ viseme, chartStyle, loadedSprites, lipstickStyle, customUrl }) => {
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    renderMouthChartThumbnail(
      ref.current,
      viseme,
      chartStyle,
      loadedSprites,
      lipstickStyle
    );
  }, [viseme, chartStyle, loadedSprites, lipstickStyle, customUrl]);

  return (
    <canvas
      ref={ref}
      width={96}
      height={58}
      className="w-full h-12 rounded-md object-contain bg-[#F3EFEA] border border-stone-200"
    />
  );
};

export const SettingsLogicModal: React.FC<SettingsLogicModalProps> = ({
  isOpen,
  initialSection = 'mouth-charts',
  config,
  cues,
  zipEntries,
  customSprites,
  loadedSprites,
  activeViseme,
  onClose,
  onUpdateConfig,
  onUpdateMouthAnchor,
  onUpdatePerKeyLift,
  onResetPerKeyLift,
  onUpdateLipstickStyle,
  onApplyImportedCues,
  onUpdateSingleCue,
  onSeekFrame,
  onAssignSprite,
  onUploadZipOrListingFile,
  onUploadChartSheetToSlice,
  onExportZipPackage,
}) => {
  const [section, setSection] = useState<'mouth-charts' | 'auto-listing' | 'dsp-logic'>(
    initialSection
  );
  const [listingFormat, setListingFormat] = useState<'json' | 'tsv' | 'moho' | 'js-code'>('json');
  const [editorText, setEditorText] = useState<string>('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [sliceGrid, setSliceGrid] = useState<{ cols: number; rows: number }>({ cols: 4, rows: 3 });

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    setEditorText(formatListingCode(cues, config, listingFormat));
  }, [cues, config, listingFormat]);

  if (!isOpen) return null;

  const activeVoiceCues = cues.filter((c) => !c.isDropped);
  const droppedCount = cues.filter((c) => c.isDropped).length;

  const handleApplyCode = () => {
    const { cues: parsedCues, configPartial } = parseListingText(editorText, config.fps);
    if (parsedCues.length > 0) {
      onApplyImportedCues(parsedCues, configPartial);
      setFeedback(`${parsedCues.length}টি কিউ কোড থেকে আপডেট হয়েছে`);
      setTimeout(() => setFeedback(null), 3000);
    } else if (configPartial) {
      onUpdateConfig(configPartial);
      setFeedback('ইঞ্জিন লজিক আপডেট হয়েছে');
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white text-zinc-900 rounded-2xl shadow-2xl border border-stone-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-[#FAF9F5]">
          <div>
            <h2 className="text-base font-bold text-zinc-900">
              লিপ-সিঙ্ক কাস্টমাইজেশন, প্রতিটা কি-এর লিফটিং ও অটো-লিস্টিং (Studio Engine)
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              প্রতিটা মাউথ শেপ (Key)-এর জন্য আলাদা লিফটিং, কাস্টম মুখ, লিপস্টিক স্টাইল এবং কোড লিস্টিং এখানে নিয়ন্ত্রণ করুন
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-stone-200/70 text-zinc-600 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section Tabs */}
        <div className="px-6 py-2.5 bg-[#F4F3EE] border-b border-stone-200 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSection('mouth-charts')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              section === 'mouth-charts'
                ? 'bg-[#84CC16] text-zinc-950 shadow-xs'
                : 'bg-white text-zinc-600 hover:text-zinc-900 border border-stone-200'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span>মাউথ শেপ, লিপস্টিক ও প্রতিটা কি-এর লিফটিং</span>
          </button>

          <button
            type="button"
            onClick={() => setSection('auto-listing')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              section === 'auto-listing'
                ? 'bg-[#84CC16] text-zinc-950 shadow-xs'
                : 'bg-white text-zinc-600 hover:text-zinc-900 border border-stone-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>অটো-লিস্টিং শিট ও কোড ({activeVoiceCues.length} Cues)</span>
          </button>

          <button
            type="button"
            onClick={() => setSection('dsp-logic')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              section === 'dsp-logic'
                ? 'bg-[#84CC16] text-zinc-950 shadow-xs'
                : 'bg-white text-zinc-600 hover:text-zinc-900 border border-stone-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>ক্যারেক্টার প্লেসমেন্ট ও অডিও পিক লজিক</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* SECTION 1: 12-PHONEME MOUTH CHARTS, LIPSTICK STYLES & PER-KEY LIFTING */}
          {section === 'mouth-charts' && (
            <div className="space-y-6">
              {/* 3 Built-In Reference Chart Styles */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {(
                  [
                    {
                      id: 'studio-12',
                      title: '12-Phoneme Studio Chart',
                      sub: 'A,E,I · L · Q,W · TH · N · B,M,P · O · U',
                    },
                    {
                      id: 'cartoon-34',
                      title: '3/4 Cartoon Lip-Sync',
                      sub: 'সাইড অ্যাঙ্গেল কার্টুন মুখ ও থুতনির দাগ',
                    },
                    {
                      id: 'manga-bw',
                      title: 'Anime / Manga B&W Chart',
                      sub: 'সাদা-কালো লাইন আর্ট ও দাঁতের এক্সপ্রেশন',
                    },
                  ] as const
                ).map((st) => {
                  const isActive = config.mouthChartStyle === st.id;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => onUpdateConfig({ mouthChartStyle: st.id })}
                      className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                        isActive
                          ? 'bg-[#84CC16]/15 border-[#65A30D] ring-1 ring-[#65A30D]'
                          : 'bg-[#FAF9F5] border-stone-200 hover:border-stone-300'
                      }`}
                    >
                      <div className="text-xs font-bold text-zinc-900 flex items-center justify-between">
                        <span>{st.title}</span>
                        {isActive && (
                          <span className="text-[10px] font-mono text-[#4D7C0F]">ACTIVE</span>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-1">{st.sub}</div>
                    </button>
                  );
                })}
              </div>

              {/* Lipstick Style & Mouth Color Customizer */}
              <div className="p-4 rounded-xl bg-[#FAF9F5] border border-stone-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-rose-500" />
                    <span>লিপস্টিক স্টাইল ও ঠোঁটের রঙ (Lipstick Styles & Lip Design)</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {LIPSTICK_PRESETS.map((preset) => {
                      const active = config.lipstickStyle.presetId === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() =>
                            onUpdateLipstickStyle({
                              presetId: preset.id,
                              lipColor: preset.color,
                              lipGloss: preset.gloss,
                            })
                          }
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border flex items-center gap-1.5 cursor-pointer transition-all ${
                            active
                              ? 'bg-zinc-900 text-white border-zinc-900 shadow-2xs'
                              : 'bg-white text-zinc-700 border-stone-200 hover:border-stone-300'
                          }`}
                        >
                          <span
                            style={{ backgroundColor: preset.color }}
                            className="w-2.5 h-2.5 rounded-full border border-white/50"
                          />
                          <span>{preset.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-stone-200/70 text-xs">
                  <label className="flex items-center justify-between gap-2 bg-white px-3 py-2 rounded-lg border border-stone-200">
                    <span className="text-zinc-600 font-medium">Lip Color</span>
                    <input
                      type="color"
                      value={config.lipstickStyle.lipColor}
                      onChange={(e) =>
                        onUpdateLipstickStyle({
                          presetId: 'custom',
                          lipColor: e.target.value,
                        })
                      }
                      className="w-7 h-6 rounded cursor-pointer border border-stone-200"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-2 bg-white px-3 py-2 rounded-lg border border-stone-200">
                    <span className="text-zinc-600 font-medium">Teeth / Tongue</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="color"
                        value={config.lipstickStyle.teethColor}
                        onChange={(e) =>
                          onUpdateLipstickStyle({ teethColor: e.target.value })
                        }
                        title="দাঁতের রঙ"
                        className="w-6 h-6 rounded cursor-pointer border border-stone-200"
                      />
                      <input
                        type="color"
                        value={config.lipstickStyle.tongueColor}
                        onChange={(e) =>
                          onUpdateLipstickStyle({ tongueColor: e.target.value })
                        }
                        title="জিহ্বার রঙ"
                        className="w-6 h-6 rounded cursor-pointer border border-stone-200"
                      />
                    </div>
                  </label>

                  <div className="flex flex-col justify-center bg-white px-3 py-1.5 rounded-lg border border-stone-200">
                    <div className="flex justify-between text-[11px] text-zinc-600">
                      <span>Lip Thickness</span>
                      <span className="font-mono font-bold">
                        {config.lipstickStyle.lipThickness.toFixed(1)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.8}
                      max={2.4}
                      step={0.1}
                      value={config.lipstickStyle.lipThickness}
                      onChange={(e) =>
                        onUpdateLipstickStyle({
                          lipThickness: Number(e.target.value),
                        })
                      }
                      className="w-full accent-rose-500 h-1 mt-1 cursor-pointer"
                    />
                  </div>

                  <label className="flex items-center justify-between gap-2 bg-white px-3 py-2 rounded-lg border border-stone-200 cursor-pointer">
                    <span className="text-zinc-700 font-medium">Lip Gloss Shine</span>
                    <input
                      type="checkbox"
                      checked={config.lipstickStyle.lipGloss}
                      onChange={(e) =>
                        onUpdateLipstickStyle({ lipGloss: e.target.checked })
                      }
                      className="accent-rose-500 w-4 h-4"
                    />
                  </label>
                </div>
              </div>

              {/* Single Mouth Chart Sheet Slicer & ZIP Upload */}
              <div className="p-4 rounded-xl bg-[#F4F3EE] border border-stone-200 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                    <Scissors className="w-4 h-4 text-[#65A30D]" />
                    <span>নিজের মাউথ চার্ট শিট ইমেজ বা ZIP ফাইল দিন</span>
                  </div>
                  <p className="text-xs text-zinc-600">
                    এক পেজে থাকা সব মুখের চার্ট ইমেজ আপলোড করলে তা অটোমেটিক ১২টি মুখে ভাগ হয়ে বসে যাবে, অথবা নিচে প্রতিটা কি-এর জন্য আলাদা মুখ ও লিফটিং সেট করুন।
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      { cols: 4, rows: 3, label: '4×3 (12)' },
                      { cols: 3, rows: 3, label: '3×3 (9)' },
                      { cols: 2, rows: 5, label: '2×5 (10)' },
                    ] as const
                  ).map((g) => (
                    <button
                      key={g.label}
                      type="button"
                      onClick={() => setSliceGrid({ cols: g.cols, rows: g.rows })}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-mono border cursor-pointer ${
                        sliceGrid.cols === g.cols && sliceGrid.rows === g.rows
                          ? 'bg-zinc-900 text-white border-zinc-900'
                          : 'bg-white text-zinc-600 border-stone-300'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}

                  <label className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#84CC16] hover:bg-[#65A30D] text-zinc-950 font-semibold text-xs cursor-pointer transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    <span>চার্ট ইমেজ স্লাইস করুন</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onUploadChartSheetToSlice(f, sliceGrid.cols, sliceGrid.rows);
                      }}
                      className="hidden"
                    />
                  </label>

                  <label className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-xs cursor-pointer transition-colors">
                    <FileArchive className="w-3.5 h-3.5" />
                    <span>ZIP আপলোড</span>
                    <input
                      type="file"
                      accept=".zip,.json,.tsv,.csv,.dat"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onUploadZipOrListingFile(f);
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Header for Per-Key Lifting & Custom Mouth Sprites */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-zinc-900">
                    প্রতিটা কি (Key)-এর নিজস্ব মাউথ শেপ এবং আলাদা লিফটিং (Per-Key Lifting & Sprite)
                  </h3>
                  <p className="text-[11px] text-zinc-500">
                    প্রতিটি ফোনিম কি-তে নিজের মুখের ছবি আপলোড করতে পারবেন এবং সেই কি-তে ক্যারেক্টার কতটুকু লিফটিং করবে তা নির্ধারণ করতে পারবেন
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onResetPerKeyLift}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-xs font-semibold text-zinc-700 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>লিফটিং রিসেট</span>
                </button>
              </div>

              {/* 12 Mouth Chart Visual Grid with Individual Sprite Override + Per-Key Lifting Slider */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {MOUTH_CHART_12_ORDER.map((code) => {
                  const meta = VISEME_LIBRARY[code];
                  const isActive = activeViseme === code;
                  const keyLift =
                    config.perKeyLiftPx?.[code] ??
                    DEFAULT_PER_KEY_LIFT[code] ??
                    meta.defaultLiftPx;
                  const hasCustomSprite = Boolean(customSprites[code]);

                  return (
                    <div
                      key={code}
                      className={`p-3 rounded-xl border flex flex-col justify-between gap-2.5 transition-all ${
                        isActive
                          ? 'bg-[#84CC16]/15 border-[#65A30D] ring-1 ring-[#65A30D]'
                          : 'bg-[#FAF9F5] border-stone-200'
                      }`}
                    >
                      <MouthThumbCanvas
                        viseme={code}
                        chartStyle={config.mouthChartStyle}
                        loadedSprites={loadedSprites}
                        lipstickStyle={config.lipstickStyle}
                        customUrl={customSprites[code]}
                      />

                      <div className="flex items-center justify-between gap-1">
                        <div className="min-w-0">
                          <div className="font-mono text-xs font-bold text-zinc-900 flex items-center gap-1">
                            <span>{meta.shortCode}</span>
                            {hasCustomSprite && (
                              <span className="px-1 py-0.2 rounded bg-emerald-100 text-emerald-800 text-[9px]">
                                Custom
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-zinc-500 truncate">
                            {meta.nameBn}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <label className="px-2 py-1 rounded bg-stone-200/90 hover:bg-[#84CC16] hover:text-zinc-950 text-[10px] font-semibold text-zinc-800 cursor-pointer whitespace-nowrap transition-colors">
                            <span>মুখ দিন</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) onAssignSprite(code, URL.createObjectURL(f));
                              }}
                              className="hidden"
                            />
                          </label>
                          {hasCustomSprite && (
                            <button
                              type="button"
                              onClick={() => onAssignSprite(code, undefined)}
                              title="কাস্টম মুখ মুছে ডিফল্ট ব্যবহার করুন"
                              className="px-1.5 py-1 rounded bg-rose-100 hover:bg-rose-200 text-rose-700 text-[10px] font-bold cursor-pointer"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Per-Key Lifting Slider ("প্রতিটা কি এর জন্য লিফটিং") */}
                      <div className="pt-1.5 border-t border-stone-200/80 space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-zinc-600 font-medium">কি লিফটিং (Lift)</span>
                          <span className="font-mono font-bold text-[#4D7C0F]">
                            +{keyLift}px
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={60}
                          step={1}
                          value={keyLift}
                          onChange={(e) =>
                            onUpdatePerKeyLift(code, Number(e.target.value))
                          }
                          className="w-full accent-[#65A30D] h-1 bg-stone-300 rounded-lg cursor-pointer"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* SECTION 2: AUTO-LISTING TABLE & CODE EDITOR */}
          {section === 'auto-listing' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-[#F4F3EE] p-3.5 rounded-xl border border-stone-200">
                <div className="text-xs text-zinc-700">
                  <strong>অটো-ড্রপ ও অটো-লিস্টিং লজিক:</strong> যেখানে কোনো অডিও নেই (
                  <span className="font-mono">{droppedCount}টি গ্যাপ</span>) সেখানে মাউথ ড্রপ হয়েছে এবং সক্রিয় ভয়েস অংশে{' '}
                  <span className="font-mono font-bold text-[#4D7C0F]">
                    {activeVoiceCues.length}টি মাউথ চার্ট কিউ
                  </span>{' '}
                  তৈরি হয়েছে।
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.autoDropSilentCues}
                      onChange={(e) =>
                        onUpdateConfig({ autoDropSilentCues: e.target.checked })
                      }
                      className="accent-[#65A30D]"
                    />
                    <span>নীরব অংশ অটো-ড্রপ রাখুন</span>
                  </label>

                  <button
                    type="button"
                    onClick={onExportZipPackage}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>ZIP লিস্টিং ডাউনলোড</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Left: Visual Auto-Listing Cue Table with Per-Cue Viseme & Lift Override */}
                <div className="border border-stone-200 rounded-xl overflow-hidden bg-white flex flex-col h-[360px]">
                  <div className="px-3.5 py-2.5 bg-[#FAF9F5] border-b border-stone-200 text-xs font-bold text-zinc-800 flex items-center justify-between">
                    <span>অটো-লিস্টিং এক্সপোজার শিট (Cue & Lift Override)</span>
                    <span className="font-mono text-[11px] text-zinc-500">
                      Click row to jump
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto divide-y divide-stone-100 text-xs">
                    {(config.autoDropSilentCues ? activeVoiceCues : cues).map((cue) => (
                      <div
                        key={cue.id}
                        onClick={() => onSeekFrame(cue.startFrame)}
                        className="px-3.5 py-2 flex items-center justify-between gap-2 hover:bg-stone-50 cursor-pointer"
                      >
                        <div className="font-mono text-zinc-700 tabular-nums shrink-0">
                          F{cue.startFrame}–{cue.endFrame}{' '}
                          <span className="text-zinc-400">({cue.startTime.toFixed(2)}s)</span>
                        </div>
                        <select
                          value={cue.viseme}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const nextCode = e.target.value as VisemeCode;
                            const nextLift =
                              nextCode === VisemeCode.DROP
                                ? 0
                                : config.perKeyLiftPx?.[nextCode] ?? cue.liftPx;
                            onUpdateSingleCue(cue.id, {
                              viseme: nextCode,
                              isDropped: nextCode === VisemeCode.DROP,
                              liftPx: nextLift,
                              locked: true,
                            });
                          }}
                          className="px-2 py-1 rounded border border-stone-200 bg-[#FAF9F5] font-mono text-xs font-semibold text-zinc-900"
                        >
                          <option value={VisemeCode.DROP}>DROP (অডিও নেই)</option>
                          {MOUTH_CHART_12_ORDER.map((c) => (
                            <option key={c} value={c}>
                              {VISEME_LIBRARY[c].shortCode} — {VISEME_LIBRARY[c].nameBn}
                            </option>
                          ))}
                        </select>
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 shrink-0"
                        >
                          <input
                            type="number"
                            min={0}
                            max={65}
                            disabled={cue.isDropped}
                            value={cue.isDropped ? 0 : Math.round(cue.liftPx)}
                            onChange={(e) =>
                              onUpdateSingleCue(cue.id, {
                                liftPx: Math.max(0, Number(e.target.value)),
                                locked: true,
                              })
                            }
                            className="w-12 px-1.5 py-0.5 rounded border border-stone-200 font-mono text-[11px] text-right text-[#4D7C0F] font-bold bg-[#FAF9F5]"
                          />
                          <span className="font-mono text-[10px] text-zinc-400">px</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right: Direct Code Listing Editor */}
                <div className="border border-stone-200 rounded-xl overflow-hidden bg-white flex flex-col h-[360px]">
                  <div className="px-3 py-2 bg-[#FAF9F5] border-b border-stone-200 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      {(
                        [
                          { id: 'json', label: 'JSON' },
                          { id: 'tsv', label: 'TSV' },
                          { id: 'moho', label: 'Moho .dat' },
                          { id: 'js-code', label: 'JS Logic' },
                        ] as const
                      ).map((fmt) => (
                        <button
                          key={fmt.id}
                          type="button"
                          onClick={() => setListingFormat(fmt.id)}
                          className={`px-2.5 py-1 rounded text-xs font-mono font-medium cursor-pointer ${
                            listingFormat === fmt.id
                              ? 'bg-zinc-900 text-white'
                              : 'text-zinc-600 hover:bg-stone-200/60'
                          }`}
                        >
                          {fmt.label}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={handleApplyCode}
                      className="px-3 py-1 rounded bg-[#84CC16] hover:bg-[#65A30D] text-zinc-950 font-semibold text-xs cursor-pointer"
                    >
                      কোড অ্যাপ্লাই করুন
                    </button>
                  </div>

                  <textarea
                    value={editorText}
                    onChange={(e) => setEditorText(e.target.value)}
                    spellCheck={false}
                    className="flex-1 w-full p-3 font-mono text-xs bg-zinc-950 text-zinc-100 focus:outline-none resize-none"
                  />

                  {feedback && (
                    <div className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-medium flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" />
                      <span>{feedback}</span>
                    </div>
                  )}
                </div>
              </div>

              {zipEntries.length > 0 && (
                <div className="text-xs text-zinc-600 font-mono">
                  ZIP থেকে লোড করা ফাইল: {zipEntries.map((z) => z.filename).join(', ')}
                </div>
              )}
            </div>
          )}

          {/* SECTION 3: CHARACTER PLACEMENT, MOUTH ANCHOR & DSP THRESHOLD LOGIC */}
          {section === 'dsp-logic' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-4 rounded-xl bg-[#FAF9F5] border border-stone-200 space-y-4">
                <h3 className="text-xs font-bold text-zinc-900">
                  ০১. ক্যারেক্টার প্লেসমেন্ট ও স্কেল নিয়ন্ত্রণ (Character Placement)
                </h3>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-700">ক্যারেক্টার সাইজ (Character Scale)</span>
                    <span className="font-mono font-semibold text-zinc-900">
                      {Math.round(config.characterTransform.scale * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.35}
                    max={2.2}
                    step={0.05}
                    value={config.characterTransform.scale}
                    onChange={(e) =>
                      onUpdateConfig({
                        characterTransform: {
                          ...config.characterTransform,
                          scale: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full accent-[#65A30D] cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-700">Position X</span>
                      <span className="font-mono font-semibold text-zinc-900">
                        {Math.round(config.characterTransform.x * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.1}
                      max={0.9}
                      step={0.01}
                      value={config.characterTransform.x}
                      onChange={(e) =>
                        onUpdateConfig({
                          characterTransform: {
                            ...config.characterTransform,
                            x: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full accent-[#65A30D] cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-700">Position Y</span>
                      <span className="font-mono font-semibold text-zinc-900">
                        {Math.round(config.characterTransform.y * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.2}
                      max={0.9}
                      step={0.01}
                      value={config.characterTransform.y}
                      onChange={(e) =>
                        onUpdateConfig({
                          characterTransform: {
                            ...config.characterTransform,
                            y: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full accent-[#65A30D] cursor-pointer"
                    />
                  </div>
                </div>

                <hr className="border-stone-200" />

                <h3 className="text-xs font-bold text-zinc-900">
                  ০২. অডিও পিক ও মাউথ অটো-ড্রপ সেনসিটিভিটি
                </h3>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-700">অডিও না থাকার গেট (Auto-Drop Gate)</span>
                    <span className="font-mono font-semibold text-zinc-900">
                      {config.silenceThresholdDb} dB
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-56}
                    max={-20}
                    step={1}
                    value={config.silenceThresholdDb}
                    onChange={(e) =>
                      onUpdateConfig({ silenceThresholdDb: Number(e.target.value) })
                    }
                    className="w-full accent-[#65A30D] cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-700">সর্বোচ্চ ভয়েস পিক (Peak A,E,I / O)</span>
                    <span className="font-mono font-semibold text-zinc-900">
                      {config.peakThresholdDb} dB
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-28}
                    max={-3}
                    step={1}
                    value={config.peakThresholdDb}
                    onChange={(e) =>
                      onUpdateConfig({ peakThresholdDb: Number(e.target.value) })
                    }
                    className="w-full accent-[#65A30D] cursor-pointer"
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#FAF9F5] border border-stone-200 space-y-4">
                <h3 className="text-xs font-bold text-zinc-900">
                  ০৩. ক্যারেক্টারের মুখে মাউথ চার্ট বসানো ও স্কিন মাস্ক
                </h3>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-700">মুখের সাইজ (Mouth Size)</span>
                    <span className="font-mono font-semibold text-zinc-900">
                      {Math.round(config.mouthAnchor.scale * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.35}
                    max={2.4}
                    step={0.05}
                    value={config.mouthAnchor.scale}
                    onChange={(e) =>
                      onUpdateMouthAnchor({ scale: Number(e.target.value) })
                    }
                    className="w-full accent-[#65A30D] cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-700">মুখের কোণ (Mouth Rotation)</span>
                    <span className="font-mono font-semibold text-zinc-900">
                      {config.mouthAnchor.rotationDeg}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-30}
                    max={30}
                    step={1}
                    value={config.mouthAnchor.rotationDeg}
                    onChange={(e) =>
                      onUpdateMouthAnchor({ rotationDeg: Number(e.target.value) })
                    }
                    className="w-full accent-[#65A30D] cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-700">Mouth Offset X</span>
                      <span className="font-mono font-semibold text-zinc-900">
                        {config.mouthAnchor.offsetX}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      step={1}
                      value={config.mouthAnchor.offsetX}
                      onChange={(e) =>
                        onUpdateMouthAnchor({ offsetX: Number(e.target.value) })
                      }
                      className="w-full accent-[#65A30D] cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-700">Mouth Offset Y</span>
                      <span className="font-mono font-semibold text-zinc-900">
                        {config.mouthAnchor.offsetY}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      step={1}
                      value={config.mouthAnchor.offsetY}
                      onChange={(e) =>
                        onUpdateMouthAnchor({ offsetY: Number(e.target.value) })
                      }
                      className="w-full accent-[#65A30D] cursor-pointer"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-zinc-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.mouthAnchor.skinMaskEnabled}
                      onChange={(e) =>
                        onUpdateMouthAnchor({ skinMaskEnabled: e.target.checked })
                      }
                      className="accent-[#65A30D]"
                    />
                    <span>কাস্টম ক্যারেক্টারের আগের আঁকা মুখ ঢাকুন (Skin Mask)</span>
                  </label>
                  <input
                    type="color"
                    value={config.mouthAnchor.skinMaskColor}
                    onChange={(e) =>
                      onUpdateMouthAnchor({ skinMaskColor: e.target.value })
                    }
                    className="w-7 h-6 rounded border border-stone-300 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

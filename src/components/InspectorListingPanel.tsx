import React, { useEffect, useState } from 'react';
import {
  CustomSpriteMap,
  EngineConfig,
  LipSyncCue,
  MOUTH_CHART_12_ORDER,
  VISEME_LIBRARY,
  VisemeCode,
  ZipAssetEntry,
} from '../types/studio';
import {
  formatListingCode,
  parseListingText,
} from '../engine/zipListingParser';
import {
  Check,
  Code2,
  Download,
  FileArchive,
  FolderOpen,
  Scissors,
  Sliders,
  Upload,
} from 'lucide-react';

interface InspectorListingPanelProps {
  config: EngineConfig;
  cues: LipSyncCue[];
  zipEntries: ZipAssetEntry[];
  customSprites: CustomSpriteMap;
  activeTab: 'dsp' | 'listing' | 'zip-sprites';
  onTabChange: (tab: 'dsp' | 'listing' | 'zip-sprites') => void;
  onUpdateConfig: (patch: Partial<EngineConfig>) => void;
  onApplyImportedCues: (cues: LipSyncCue[], configPartial?: Partial<EngineConfig> | null) => void;
  onUpdateSingleCue: (cueId: string, patch: Partial<LipSyncCue>) => void;
  onSeekFrame: (frame: number) => void;
  onAssignSprite: (target: VisemeCode | 'head' | 'body' | 'eyes', blobUrl: string | undefined) => void;
  onUploadZipOrListingFile: (file: File) => void;
  onUploadChartSheetToSlice: (file: File, cols: number, rows: number) => void;
  onExportZipPackage: () => void;
}

export const InspectorListingPanel: React.FC<InspectorListingPanelProps> = ({
  config,
  cues,
  zipEntries,
  customSprites,
  activeTab,
  onTabChange,
  onUpdateConfig,
  onApplyImportedCues,
  onUpdateSingleCue,
  onSeekFrame,
  onAssignSprite,
  onUploadZipOrListingFile,
  onUploadChartSheetToSlice,
  onExportZipPackage,
}) => {
  const [listingSubMode, setListingSubMode] = useState<'sheet' | 'code'>('sheet');
  const [listingFormat, setListingFormat] = useState<'json' | 'tsv' | 'moho' | 'js-code'>('json');
  const [editorText, setEditorText] = useState<string>('');
  const [applyFeedback, setApplyFeedback] = useState<string | null>(null);
  const [sliceGrid, setSliceGrid] = useState<{ cols: number; rows: number }>({ cols: 4, rows: 3 });

  useEffect(() => {
    setEditorText(formatListingCode(cues, config, listingFormat));
  }, [cues, config, listingFormat]);

  const handleApplyCodeChanges = () => {
    const { cues: parsedCues, configPartial } = parseListingText(editorText, config.fps);
    if (parsedCues.length > 0) {
      onApplyImportedCues(parsedCues, configPartial);
      setApplyFeedback(`${parsedCues.length}টি মাউথ চার্ট কিউ কোড থেকে আপডেট হয়েছে`);
      setTimeout(() => setApplyFeedback(null), 3000);
    } else if (configPartial) {
      onUpdateConfig(configPartial);
      setApplyFeedback('ইঞ্জিন কনফিগ কোড আপডেট হয়েছে');
      setTimeout(() => setApplyFeedback(null), 3000);
    } else {
      setApplyFeedback('JSON, TSV অথবা Moho ফরম্যাটে বৈধ লিস্টিং দিন');
      setTimeout(() => setApplyFeedback(null), 3000);
    }
  };

  const handleSingleSpriteUpload = (
    target: VisemeCode | 'head' | 'body' | 'eyes',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    onAssignSprite(target, url);
  };

  // Filter active vs dropped cues for the Auto-Listing Sheet
  const activeVoiceCues = cues.filter((c) => !c.isDropped);
  const droppedSilentCuesCount = cues.filter((c) => c.isDropped).length;
  const displayedSheetCues = config.autoDropSilentCues ? activeVoiceCues : cues;

  return (
    <aside className="w-full lg:w-[400px] xl:w-[430px] shrink-0 bg-[#0F1522] border-l border-slate-800/90 flex flex-col h-full overflow-hidden">
      {/* Segmented Inspector Tabs */}
      <div className="p-2.5 bg-[#0B0F17] border-b border-slate-800/80 flex items-center gap-1">
        <button
          type="button"
          onClick={() => onTabChange('listing')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'listing'
              ? 'bg-slate-800 text-white shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Code2 className="w-3.5 h-3.5 text-amber-400" />
          <span>অটো লিস্টিং ও কোড</span>
        </button>
        <button
          type="button"
          onClick={() => onTabChange('dsp')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'dsp'
              ? 'bg-slate-800 text-white shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="w-3.5 h-3.5 text-sky-400" />
          <span>পিক ও অটো-ড্রপ</span>
        </button>
        <button
          type="button"
          onClick={() => onTabChange('zip-sprites')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'zip-sprites'
              ? 'bg-slate-800 text-white shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileArchive className="w-3.5 h-3.5 text-emerald-400" />
          <span>চার্ট শিট ও ZIP</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* TAB 1: AUTO-LISTING SHEET & DIRECT CODE EDITOR */}
        {activeTab === 'listing' && (
          <div className="space-y-3.5 flex flex-col h-full">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  মাউথ চার্ট অটো-লিস্টিং (Auto-Listing)
                </h2>
                <p className="text-[11px] text-slate-400">
                  অডিও না থাকলে অটো ড্রপ ({droppedSilentCuesCount}টি গ্যাপ বাদ দেওয়া হয়েছে) · সক্রিয় কিউ: {activeVoiceCues.length}টি
                </p>
              </div>

              <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded border border-slate-800">
                <button
                  type="button"
                  onClick={() => setListingSubMode('sheet')}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                    listingSubMode === 'sheet'
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  চার্ট শিট
                </button>
                <button
                  type="button"
                  onClick={() => setListingSubMode('code')}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                    listingSubMode === 'code'
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  কোড এডিটর
                </button>
              </div>
            </div>

            {/* Auto-Drop Silent Gaps Toggle */}
            <label className="flex items-center justify-between p-2.5 rounded bg-slate-900/90 border border-slate-800 text-xs cursor-pointer">
              <span className="text-slate-200 font-medium">
                অডিও না থাকলে লিস্টিং থেকে অটো-ড্রপ (Skip No-Audio)
              </span>
              <input
                type="checkbox"
                checked={config.autoDropSilentCues}
                onChange={(e) => onUpdateConfig({ autoDropSilentCues: e.target.checked })}
                className="accent-amber-500"
              />
            </label>

            {listingSubMode === 'sheet' ? (
              /* Interactive Visual Auto-Listing Exposure Table */
              <div className="flex-1 flex flex-col min-h-[280px] border border-slate-800 rounded bg-[#080B11] overflow-hidden">
                <div className="grid grid-cols-12 px-3 py-2 bg-slate-900/90 border-b border-slate-800 text-[11px] font-mono text-slate-400">
                  <div className="col-span-3">FRAMES</div>
                  <div className="col-span-3">TIME (s)</div>
                  <div className="col-span-4">MOUTH CHART</div>
                  <div className="col-span-2 text-right">LIFT</div>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-slate-800/70">
                  {displayedSheetCues.map((cue) => {
                    const meta = VISEME_LIBRARY[cue.viseme];
                    return (
                      <div
                        key={cue.id}
                        onClick={() => onSeekFrame(cue.startFrame)}
                        className="grid grid-cols-12 items-center px-3 py-1.5 text-xs hover:bg-slate-900/80 transition-colors cursor-pointer"
                      >
                        <div className="col-span-3 font-mono text-slate-200 tabular-nums">
                          F{cue.startFrame}–{cue.endFrame}
                        </div>
                        <div className="col-span-3 font-mono text-[11px] text-slate-400 tabular-nums">
                          {cue.startTime.toFixed(2)}s
                        </div>
                        <div className="col-span-4">
                          <select
                            value={cue.viseme}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const newCode = e.target.value as VisemeCode;
                              onUpdateSingleCue(cue.id, {
                                viseme: newCode,
                                isDropped: newCode === VisemeCode.DROP,
                                liftPx: newCode === VisemeCode.DROP ? 0 : cue.liftPx,
                                locked: true,
                              });
                            }}
                            style={{ color: meta.color }}
                            className="bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 font-mono text-xs font-semibold w-full cursor-pointer"
                          >
                            <option value={VisemeCode.DROP}>DROP (অডিও নেই)</option>
                            {MOUTH_CHART_12_ORDER.map((c) => (
                              <option key={c} value={c}>
                                {VISEME_LIBRARY[c].shortCode} ({VISEME_LIBRARY[c].nameBn.split(' ')[0]})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-2 text-right font-mono text-[11px] text-amber-300 tabular-nums">
                          {cue.isDropped ? 'DROP' : `+${Math.round(cue.liftPx)}px`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Direct Code Editor Mode */
              <div className="flex-1 flex flex-col space-y-2.5 min-h-[280px]">
                <div className="flex items-center gap-1 bg-slate-900 p-1 rounded border border-slate-800">
                  {(
                    [
                      { id: 'json', label: 'JSON Listing' },
                      { id: 'tsv', label: 'TSV Cues' },
                      { id: 'moho', label: 'Moho .dat' },
                      { id: 'js-code', label: 'JS Code' },
                    ] as const
                  ).map((fmt) => (
                    <button
                      key={fmt.id}
                      type="button"
                      onClick={() => setListingFormat(fmt.id)}
                      className={`flex-1 py-1 px-2 rounded text-xs font-mono font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        listingFormat === fmt.id
                          ? 'bg-amber-500 text-slate-950 font-semibold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {fmt.label}
                    </button>
                  ))}
                </div>

                <textarea
                  value={editorText}
                  onChange={(e) => setEditorText(e.target.value)}
                  spellCheck={false}
                  aria-label="Lip-sync listing code editor"
                  className="w-full flex-1 min-h-[230px] p-3 rounded bg-[#080B11] border border-slate-800 focus:border-amber-500 focus:outline-none font-mono text-xs text-slate-200 leading-relaxed resize-y"
                />

                {applyFeedback && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                    <Check className="w-4 h-4" />
                    <span>{applyFeedback}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleApplyCodeChanges}
                  className="w-full py-2 px-3 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors cursor-pointer"
                >
                  কোড অ্যাপ্লাই করুন (Apply Code Changes)
                </button>
              </div>
            )}

            {/* Bottom Actions: Upload Listing/ZIP or Export ZIP */}
            <div className="flex items-center gap-2 pt-1">
              <label className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded border border-dashed border-slate-700 hover:border-amber-500 bg-slate-900/60 text-xs text-slate-200 cursor-pointer transition-colors whitespace-nowrap">
                <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                <span>ZIP / লিস্টিং ফাইল ইমপোর্ট</span>
                <input
                  type="file"
                  accept=".zip,.json,.tsv,.csv,.dat,.txt"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onUploadZipOrListingFile(f);
                  }}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={onExportZipPackage}
                className="flex items-center gap-1.5 py-2 px-3 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-amber-400" />
                <span>ZIP ডাউনলোড</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: DSP AUDIO PEAK & SILENCE AUTO-DROP RULES */}
        {activeTab === 'dsp' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-white">
                অডিও পিক ও মাউথ অটো-ড্রপ কন্ট্রোল
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                যেখানে কোনো অডিও থাকবে না সেখানে মাউথ ড্রপ হবে এবং যেখানে ভয়েস চলবে সেখানে ১২টি মাউথ চার্ট শেপ অটোমেটিক বসবে।
              </p>
            </div>

            {/* Auto-Drop Gate Slider */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="text-slate-300 font-medium">
                  অডিও না থাকার গেট (No-Audio Auto-Drop Gate)
                </label>
                <span className="font-mono text-rose-400 tabular-nums">
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
                className="w-full accent-rose-400 cursor-pointer"
              />
              <p className="text-[11px] text-slate-400">
                ভয়েস এই dB-এর নিচে নামলে সেখানে কোনো মাউথ অ্যানিমেশন লাগবে না (অটো ড্রপ হবে)।
              </p>
            </div>

            {/* Peak Threshold Slider */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="text-slate-300 font-medium">
                  সর্বোচ্চ অডিও পিক (Peak A,E,I / O Threshold)
                </label>
                <span className="font-mono text-amber-400 tabular-nums">
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
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>

            {/* Max Vertical Character Lifting Slider */}
            <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
              <div className="flex items-center justify-between text-xs">
                <label className="text-slate-300 font-medium">
                  ক্যারেক্টার লিফটিং উচ্চতা (Voice Peak Lift)
                </label>
                <span className="font-mono text-amber-300 tabular-nums">
                  +{config.maxLiftPx} px
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={60}
                step={1}
                value={config.maxLiftPx}
                onChange={(e) =>
                  onUpdateConfig({ maxLiftPx: Number(e.target.value) })
                }
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            {/* Squash & Stretch & Hold Smoothing */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800/80">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">Squash/Stretch</span>
                  <span className="font-mono text-slate-200 tabular-nums">
                    {Math.round(config.squashIntensity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1.5}
                  step={0.1}
                  value={config.squashIntensity}
                  onChange={(e) =>
                    onUpdateConfig({ squashIntensity: Number(e.target.value) })
                  }
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">হোল্ড স্মুথিং</span>
                  <span className="font-mono text-slate-200 tabular-nums">
                    {config.holdSmoothingFrames} ফ্রেম
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={6}
                  step={1}
                  value={config.holdSmoothingFrames}
                  onChange={(e) =>
                    onUpdateConfig({ holdSmoothingFrames: Number(e.target.value) })
                  }
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Video-to-2D Cartoon Filter & Character Scale */}
            <div className="pt-3 border-t border-slate-800/80 space-y-3">
              <h3 className="text-xs font-semibold text-white">
                আপলোড করা ভিডিও ২ডি শেডার ও ক্যারেক্টার সাইজ
              </h3>
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    { id: 'none', label: 'অরিজিনাল ভিডিও' },
                    { id: 'cel-shade', label: '2D Cel-Shaded' },
                    { id: 'rotoscope-2d', label: '2D Rotoscope' },
                    { id: 'ink-outline', label: 'Ink Line Art' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onUpdateConfig({ videoCartoonFilter: item.id })}
                    className={`py-1.5 px-2.5 rounded text-xs font-medium border text-left transition-colors whitespace-nowrap cursor-pointer ${
                      config.videoCartoonFilter === item.id
                        ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">ক্যারেক্টার সাইজ (Scale)</span>
                  <span className="font-mono text-slate-200 tabular-nums">
                    {(config.characterTransform.scale * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.35}
                  max={2.0}
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
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: MOUTH CHART SHEET SLICER & ZIP SPRITE MAPPER */}
        {activeTab === 'zip-sprites' && (
          <div className="space-y-4">
            {/* Automatic Mouth Chart Sheet Grid Slicer */}
            <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                  <Scissors className="w-3.5 h-3.5" />
                  একক মাউথ চার্ট শিট স্লাইসার (Auto-Slice Sheet)
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                আপনার পাঠানো ছবির মতো এক পেজে থাকা সব মুখের চার্ট ইমেজ (.jpg/.png) আপলোড করলে তা অটোমেটিক কেটে ১২টি ভিসেমে বসে যাবে:
              </p>

              <div className="flex items-center gap-1.5">
                {(
                  [
                    { cols: 4, rows: 3, label: '4×3 (12 Mouths)' },
                    { cols: 3, rows: 3, label: '3×3 (9 Mouths)' },
                    { cols: 2, rows: 5, label: '2×5 (10 Mouths)' },
                  ] as const
                ).map((g) => (
                  <button
                    key={g.label}
                    type="button"
                    onClick={() => setSliceGrid({ cols: g.cols, rows: g.rows })}
                    className={`flex-1 py-1 px-1.5 rounded text-[11px] font-mono border cursor-pointer ${
                      sliceGrid.cols === g.cols && sliceGrid.rows === g.rows
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-semibold'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>

              <label className="flex items-center justify-center gap-1.5 py-2 px-3 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs cursor-pointer transition-colors">
                <Upload className="w-3.5 h-3.5" />
                <span>মাউথ চার্ট ইমেজ শিট আপলোড করুন (.jpg/.png)</span>
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
            </div>

            {/* ZIP Archive Dropzone */}
            <label className="flex flex-col items-center justify-center p-3.5 rounded-lg border border-dashed border-emerald-500/50 hover:border-emerald-400 bg-emerald-500/5 cursor-pointer transition-colors text-center">
              <FileArchive className="w-4 h-4 text-emerald-400 mb-1" />
              <span className="text-xs font-semibold text-white">
                অথবা ZIP ফোল্ডার আপলোড করুন (.zip)
              </span>
              <span className="text-[11px] text-slate-400">
                আলাদা মাউথ স্প্রাইট বা লিস্টিং ফাইলসহ জিপ
              </span>
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

            {zipEntries.length > 0 && (
              <div className="p-2.5 rounded bg-slate-900 border border-slate-800 space-y-1.5">
                <div className="text-xs font-semibold text-emerald-400">
                  জিপ থেকে লোড হওয়া ফাইল ({zipEntries.length}টি)
                </div>
                <div className="max-h-24 overflow-y-auto divide-y divide-slate-800/70 text-[11px] font-mono">
                  {zipEntries.map((entry, idx) => (
                    <div key={idx} className="py-1 flex items-center justify-between gap-2">
                      <span className="text-slate-300 truncate">{entry.filename}</span>
                      <span className="text-amber-400 shrink-0">
                        {entry.assignedTarget || entry.type}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 12 Mouth Chart Shapes Individual Custom Sprite Assignment */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>১২টি মাউথ চার্ট শেপ (Phonemes)</span>
                {Object.keys(customSprites).length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      MOUTH_CHART_12_ORDER.forEach((c) => onAssignSprite(c, undefined));
                      onAssignSprite(VisemeCode.DROP, undefined);
                    }}
                    className="text-[11px] text-rose-400 hover:underline cursor-pointer"
                  >
                    সব কাস্টম স্প্রাইট রিসেট
                  </button>
                )}
              </div>

              <div className="divide-y divide-slate-800/80 border border-slate-800 rounded bg-[#0B0F17]">
                {[VisemeCode.DROP, ...MOUTH_CHART_12_ORDER].map((code) => {
                  const meta = VISEME_LIBRARY[code];
                  const customUrl = customSprites[code];
                  return (
                    <div
                      key={code}
                      className="p-2 flex items-center justify-between gap-2 hover:bg-slate-900/60"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          style={{
                            backgroundColor: `${meta.color}22`,
                            color: meta.color,
                            borderColor: meta.color,
                          }}
                          className="px-1.5 py-0.5 rounded border font-mono font-bold text-[10px] shrink-0"
                        >
                          {meta.shortCode}
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-slate-200 truncate">
                            {meta.nameBn}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {customUrl ? (
                          <>
                            <img
                              src={customUrl}
                              alt={meta.shortCode}
                              referrerPolicy="no-referrer"
                              className="w-8 h-6 rounded object-contain bg-slate-100 border border-amber-500"
                            />
                            <button
                              type="button"
                              onClick={() => onAssignSprite(code, undefined)}
                              className="text-[10px] text-rose-400 hover:underline cursor-pointer"
                            >
                              ✕
                            </button>
                          </>
                        ) : (
                          <label className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-200 cursor-pointer whitespace-nowrap">
                            <span>+ ইমেজ</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleSingleSpriteUpload(code, e)}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

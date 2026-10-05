import React, { useRef, useState } from 'react';
import {
  CharacterOverlayElement,
  EngineConfig,
  EXPORT_RESOLUTIONS,
  MouthAnchorConfig,
  SelectedCanvasLayer,
  VisemeCode,
} from '../types/studio';
import { RotateCw, Trash2 } from 'lucide-react';

interface InteractiveStageOverlayProps {
  config: EngineConfig;
  isPlaying?: boolean;
  selectedLayer: SelectedCanvasLayer;
  selectedOverlayId: string | null;
  characterOverlays: CharacterOverlayElement[];
  activeViseme: VisemeCode;
  onSelectLayer: (layer: SelectedCanvasLayer, overlayId?: string | null) => void;
  onUpdateConfig: (updater: (prev: EngineConfig) => EngineConfig) => void;
  onUpdateMouthAnchor: (patch: Partial<MouthAnchorConfig>) => void;
  onUpdatePerKeyLift: (viseme: VisemeCode, liftPx: number) => void;
  onUploadMainCharacter: (file: File) => void;
  onAddOverlayCharacter: (file: File) => void;
  onUpdateOverlay: (id: string, patch: Partial<CharacterOverlayElement>) => void;
  onDeleteOverlay: (id: string) => void;
  hasImportedMainCharacter?: boolean;
  onDeleteMainCharacter?: () => void;
  onCaptureTrackerTemplate: () => void;
}

type DragAction = 'move' | 'scale' | 'rotate' | null;

export const InteractiveStageOverlay: React.FC<InteractiveStageOverlayProps> = ({
  config,
  isPlaying = false,
  selectedLayer,
  selectedOverlayId,
  characterOverlays,
  onSelectLayer,
  onUpdateConfig,
  onUpdateMouthAnchor,
  onUpdateOverlay,
  onDeleteOverlay,
  hasImportedMainCharacter,
  onDeleteMainCharacter,
  onCaptureTrackerTemplate,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragAction, setDragAction] = useState<DragAction>(null);

  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    activeLayer: SelectedCanvasLayer;
    activeOverlayId: string | null;
    startX: number;
    startY: number;
    startScale: number;
    startRotation: number;
    centerScreenX: number;
    centerScreenY: number;
  } | null>(null);

  const resSpec =
    EXPORT_RESOLUTIONS[config.exportResolution] ||
    EXPORT_RESOLUTIONS['youtube-1080p'];
  const stageW = resSpec.width;
  const stageH = resSpec.height;

  const selectedOverlay =
    characterOverlays.find((o) => o.id === selectedOverlayId) || null;

  // Compute normalized 0..1 stage coordinates for independent Mouth/Lip Segment, Character, and Overlays
  const getMouthStageCoords = () => {
    const totalX =
      config.mouthAnchor.offsetX + (config.mouthAnchor.lipSegmentOffsetX || 0);
    const totalY =
      config.mouthAnchor.offsetY + (config.mouthAnchor.lipSegmentOffsetY || 0);
    const normX = 0.5 + totalX / 1280;
    const normY = 0.64 + (3 + totalY) / 720;
    return {
      normX,
      normY,
      boxW: Math.max(42, Math.min(220, 82 * config.mouthAnchor.scale)),
      boxH: Math.max(32, Math.min(165, 58 * config.mouthAnchor.scale)),
      rotation: config.mouthAnchor.rotationDeg || 0,
      scale: config.mouthAnchor.scale,
    };
  };

  const getTrackerStageCoords = () => {
    const tx = config.mouthTracker.trackAnchorX ?? config.mouthAnchor.offsetX;
    const ty = config.mouthTracker.trackAnchorY ?? config.mouthAnchor.offsetY;
    return {
      normX: 0.5 + tx / 1280,
      normY: 0.64 + (3 + ty) / 720,
      boxW: 44,
      boxH: 44,
      rotation: 0,
      scale: 1,
    };
  };

  const getLayerMetrics = (
    layer: SelectedCanvasLayer,
    ov: CharacterOverlayElement | null
  ) => {
    if (layer === 'mouth' || layer === 'lip-segment') {
      return getMouthStageCoords();
    }
    if (layer === 'tracker') {
      return getTrackerStageCoords();
    }
    if (layer === 'overlay' && ov) {
      return {
        normX: ov.x,
        normY: ov.y,
        boxW: Math.max(64, Math.min(340, 150 * ov.scale)),
        boxH: Math.max(64, Math.min(340, 150 * ov.scale)),
        rotation: ov.rotationDeg || 0,
        scale: ov.scale,
      };
    }
    if (layer === 'character') {
      return {
        normX: config.characterTransform.x,
        normY: config.characterTransform.y,
        boxW: Math.max(100, Math.min(380, 195 * config.characterTransform.scale)),
        boxH: Math.max(120, Math.min(420, 235 * config.characterTransform.scale)),
        rotation: config.characterTransform.rotationDeg || 0,
        scale: config.characterTransform.scale,
      };
    }
    return null;
  };

  const activeBox = getLayerMetrics(selectedLayer, selectedOverlay);

  // Direct hit-test on pointer down so ALL layers (Mouth/Lip, Overlays, Character, Background)
  // are directly selectable and movable anywhere on the preview screen!
  const hitTestStageLayer = (
    normX: number,
    normY: number,
    rect: DOMRect
  ): { layer: SelectedCanvasLayer; overlayId: string | null } => {
    // If user explicitly chose 'tracker' or 'lip-segment' from the bottom panel, allow dragging it anywhere
    if (selectedLayer === 'tracker') {
      return { layer: 'tracker', overlayId: null };
    }
    if (selectedLayer === 'lip-segment') {
      return { layer: 'lip-segment', overlayId: null };
    }

    const px = normX * rect.width;
    const py = normY * rect.height;

    // 1. Check Mouth / Lip Segment first (topmost interactive facial element)
    if (config.layers.mouthLayer) {
      const m = getMouthStageCoords();
      const mx = m.normX * rect.width;
      const my = m.normY * rect.height;
      const halfW = Math.max(28, m.boxW * 0.55);
      const halfH = Math.max(22, m.boxH * 0.55);
      if (Math.abs(px - mx) <= halfW && Math.abs(py - my) <= halfH) {
        return { layer: 'mouth', overlayId: null };
      }
    }

    // 2. Check Character Overlays (in reverse order so topmost overlay is picked first)
    if (config.layers.overlayLayer !== false && characterOverlays.length > 0) {
      for (let i = characterOverlays.length - 1; i >= 0; i--) {
        const ov = characterOverlays[i];
        if (!ov.visible) continue;
        const ox = ov.x * rect.width;
        const oy = ov.y * rect.height;
        const halfW = Math.max(36, 75 * ov.scale);
        const halfH = Math.max(36, 75 * ov.scale);
        if (Math.abs(px - ox) <= halfW && Math.abs(py - oy) <= halfH) {
          return { layer: 'overlay', overlayId: ov.id };
        }
      }
    }

    // 3. Check Main Character Layer
    if (config.layers.characterLayer) {
      const cx = config.characterTransform.x * rect.width;
      const cy = config.characterTransform.y * rect.height;
      const halfW = Math.max(58, 105 * config.characterTransform.scale);
      const halfH = Math.max(70, 125 * config.characterTransform.scale);
      if (Math.abs(px - cx) <= halfW && Math.abs(py - cy) <= halfH) {
        return { layer: 'character', overlayId: null };
      }
    }

    // 4. If user clicked outside on background:
    // If background layer is selected in bottom panel, move background; otherwise deselect bounding box
    if (selectedLayer === 'background') {
      return { layer: 'background', overlayId: null };
    }
    return { layer: 'none', overlayId: null };
  };

  const beginPointerTransform = (
    e: React.PointerEvent,
    action: DragAction,
    forcedLayer?: SelectedCanvasLayer,
    forcedOverlayId?: string | null
  ) => {
    e.stopPropagation();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    const normClickX = (e.clientX - rect.left) / Math.max(1, rect.width);
    const normClickY = (e.clientY - rect.top) / Math.max(1, rect.height);

    let targetLayer = forcedLayer ?? selectedLayer;
    let targetOvId =
      forcedOverlayId !== undefined ? forcedOverlayId : selectedOverlayId;

    if (!forcedLayer && action === 'move') {
      const hit = hitTestStageLayer(normClickX, normClickY, rect);
      targetLayer = hit.layer;
      targetOvId = hit.overlayId;
      onSelectLayer(targetLayer, targetOvId);
      if (targetLayer === 'none') {
        return;
      }
    }

    const targetOv =
      characterOverlays.find((o) => o.id === targetOvId) || null;
    const metrics = getLayerMetrics(targetLayer, targetOv);

    const centerScreenX =
      rect.left + (metrics ? metrics.normX : 0.5) * rect.width;
    const centerScreenY =
      rect.top + (metrics ? metrics.normY : 0.5) * rect.height;

    let startX = 0;
    let startY = 0;
    let startScale = 1;
    let startRotation = 0;

    if (targetLayer === 'mouth') {
      startX = config.mouthAnchor.offsetX;
      startY = config.mouthAnchor.offsetY;
      startScale = config.mouthAnchor.scale;
      startRotation = config.mouthAnchor.rotationDeg;
    } else if (targetLayer === 'lip-segment') {
      startX = config.mouthAnchor.lipSegmentOffsetX || 0;
      startY = config.mouthAnchor.lipSegmentOffsetY || 0;
      startScale = config.mouthAnchor.scale;
      startRotation = config.mouthAnchor.rotationDeg;
    } else if (targetLayer === 'tracker') {
      startX = config.mouthTracker.trackAnchorX ?? config.mouthAnchor.offsetX;
      startY = config.mouthTracker.trackAnchorY ?? config.mouthAnchor.offsetY;
      startScale = 1;
      startRotation = 0;
    } else if (targetLayer === 'overlay' && targetOv) {
      startX = targetOv.x;
      startY = targetOv.y;
      startScale = targetOv.scale;
      startRotation = targetOv.rotationDeg;
    } else if (targetLayer === 'character') {
      startX = config.characterTransform.x;
      startY = config.characterTransform.y;
      startScale = config.characterTransform.scale;
      startRotation = config.characterTransform.rotationDeg || 0;
    } else if (targetLayer === 'background') {
      startX = config.background.offsetX || 0;
      startY = config.background.offsetY || 0;
      startScale = config.background.scale || 1;
      startRotation = 0;
    }

    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      activeLayer: targetLayer,
      activeOverlayId: targetOvId,
      startX,
      startY,
      startScale,
      startRotation,
      centerScreenX,
      centerScreenY,
    };

    setDragAction(action);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragAction || !dragStartRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const {
      clientX,
      clientY,
      activeLayer,
      activeOverlayId,
      startX,
      startY,
      startScale,
      startRotation,
      centerScreenX,
      centerScreenY,
    } = dragStartRef.current;

    const dxNorm = (e.clientX - clientX) / Math.max(1, rect.width);
    const dyNorm = (e.clientY - clientY) / Math.max(1, rect.height);

    if (dragAction === 'move') {
      if (activeLayer === 'mouth') {
        // Full independent freedom anywhere on the character or stage (-960 to +960 px)
        const newOx = Math.round(startX + dxNorm * 1280);
        const newOy = Math.round(startY + dyNorm * 720);
        onUpdateMouthAnchor({
          offsetX: Math.max(-960, Math.min(960, newOx)),
          offsetY: Math.max(-960, Math.min(960, newOy)),
        });
      } else if (activeLayer === 'lip-segment') {
        // Independent Lip Segment repositioning anywhere on the character
        const newLx = Math.round(startX + dxNorm * 1280);
        const newLy = Math.round(startY + dyNorm * 720);
        onUpdateMouthAnchor({
          lipSegmentOffsetX: Math.max(-960, Math.min(960, newLx)),
          lipSegmentOffsetY: Math.max(-960, Math.min(960, newLy)),
        });
      } else if (activeLayer === 'tracker') {
        // Independent Mouth Tracking sensor repositioning anywhere on the character
        const newTx = Math.round(startX + dxNorm * 1280);
        const newTy = Math.round(startY + dyNorm * 720);
        onUpdateConfig((prev) => ({
          ...prev,
          mouthTracker: {
            ...prev.mouthTracker,
            trackAnchorX: Math.max(-960, Math.min(960, newTx)),
            trackAnchorY: Math.max(-960, Math.min(960, newTy)),
          },
        }));
      } else if (activeLayer === 'overlay' && activeOverlayId) {
        onUpdateOverlay(activeOverlayId, {
          x: Math.max(0.02, Math.min(0.98, startX + dxNorm)),
          y: Math.max(0.02, Math.min(0.98, startY + dyNorm)),
        });
      } else if (activeLayer === 'character') {
        onUpdateConfig((prev) => ({
          ...prev,
          characterTransform: {
            ...prev.characterTransform,
            x: Math.max(0.02, Math.min(0.98, startX + dxNorm)),
            y: Math.max(0.02, Math.min(0.98, startY + dyNorm)),
          },
        }));
      } else if (activeLayer === 'background') {
        onUpdateConfig((prev) => ({
          ...prev,
          background: {
            ...prev.background,
            offsetX: Math.round(startX + dxNorm * stageW),
            offsetY: Math.round(startY + dyNorm * stageH),
          },
        }));
      }
    } else if (dragAction === 'scale') {
      const startDist = Math.max(
        20,
        Math.hypot(clientX - centerScreenX, clientY - centerScreenY)
      );
      const currDist = Math.max(
        10,
        Math.hypot(e.clientX - centerScreenX, e.clientY - centerScreenY)
      );
      const ratio = currDist / startDist;
      const nextScale = Number((startScale * ratio).toFixed(2));

      if (activeLayer === 'mouth' || activeLayer === 'lip-segment') {
        onUpdateMouthAnchor({
          scale: Math.max(0.25, Math.min(3.5, nextScale)),
        });
      } else if (activeLayer === 'overlay' && activeOverlayId) {
        onUpdateOverlay(activeOverlayId, {
          scale: Math.max(0.15, Math.min(3.5, nextScale)),
        });
      } else if (activeLayer === 'character') {
        onUpdateConfig((prev) => ({
          ...prev,
          characterTransform: {
            ...prev.characterTransform,
            scale: Math.max(0.2, Math.min(3.2, nextScale)),
          },
        }));
      }
    } else if (dragAction === 'rotate') {
      const startAngle = Math.atan2(
        clientY - centerScreenY,
        clientX - centerScreenX
      );
      const currAngle = Math.atan2(
        e.clientY - centerScreenY,
        e.clientX - centerScreenX
      );
      const deltaDeg = ((currAngle - startAngle) * 180) / Math.PI;
      let nextRot = Math.round(startRotation + deltaDeg);
      if (nextRot > 180) nextRot -= 360;
      if (nextRot < -180) nextRot += 360;

      if (activeLayer === 'mouth' || activeLayer === 'lip-segment') {
        onUpdateMouthAnchor({ rotationDeg: nextRot });
      } else if (activeLayer === 'overlay' && activeOverlayId) {
        onUpdateOverlay(activeOverlayId, { rotationDeg: nextRot });
      } else if (activeLayer === 'character') {
        onUpdateConfig((prev) => ({
          ...prev,
          characterTransform: {
            ...prev.characterTransform,
            rotationDeg: nextRot,
          },
        }));
      }
    }
  };

  const handlePointerUp = () => {
    if (
      dragAction === 'move' &&
      dragStartRef.current?.activeLayer === 'tracker'
    ) {
      onCaptureTrackerTemplate();
    }
    setDragAction(null);
    dragStartRef.current = null;
  };

  // Direct wheel zoom on the preview screen for whichever layer is selected
  const handleWheelZoom = (e: React.WheelEvent) => {
    if (selectedLayer === 'none' || selectedLayer === 'tracker') return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.08 : -0.08;

    if (selectedLayer === 'mouth' || selectedLayer === 'lip-segment') {
      onUpdateMouthAnchor({
        scale: Number(
          Math.max(0.25, Math.min(3.5, config.mouthAnchor.scale + delta)).toFixed(2)
        ),
      });
    } else if (selectedLayer === 'overlay' && selectedOverlay) {
      onUpdateOverlay(selectedOverlay.id, {
        scale: Number(
          Math.max(0.15, Math.min(3.5, selectedOverlay.scale + delta)).toFixed(2)
        ),
      });
    } else if (selectedLayer === 'character') {
      onUpdateConfig((prev) => ({
        ...prev,
        characterTransform: {
          ...prev.characterTransform,
          scale: Number(
            Math.max(
              0.2,
              Math.min(3.2, prev.characterTransform.scale + delta)
            ).toFixed(2)
          ),
        },
      }));
    } else if (selectedLayer === 'background') {
      onUpdateConfig((prev) => ({
        ...prev,
        background: {
          ...prev.background,
          scale: Number(
            Math.max(
              0.5,
              Math.min(3.0, (prev.background.scale || 1) + delta)
            ).toFixed(2)
          ),
        },
      }));
    }
  };

  return (
    <div
      ref={containerRef}
      onWheel={handleWheelZoom}
      onPointerDown={(e) => beginPointerTransform(e, 'move')}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="absolute inset-0 z-20 select-none overflow-hidden touch-none cursor-grab active:cursor-grabbing"
    >
      {/* Clean Direct-Manipulation Handle Box ONLY when paused & actively editing a layer (Zero floating clutter!) */}
      {!isPlaying &&
        selectedLayer !== 'none' &&
        selectedLayer !== 'background' &&
        selectedLayer !== 'tracker' &&
        activeBox && (
          <div
            style={{
              left: `${Math.max(4, Math.min(96, activeBox.normX * 100))}%`,
              top: `${Math.max(4, Math.min(96, activeBox.normY * 100))}%`,
              width: `${activeBox.boxW}px`,
              height: `${activeBox.boxH}px`,
              transform: `translate(-50%, -50%) rotate(${activeBox.rotation}deg)`,
            }}
            onPointerDown={(e) =>
              beginPointerTransform(e, 'move', selectedLayer, selectedOverlayId)
            }
            className={`absolute border transition-shadow ${
              selectedLayer === 'overlay'
                ? 'border-amber-400/85'
                : selectedLayer === 'character'
                ? 'border-white/75'
                : 'border-[#00E1FA]/85'
            }`}
          >
            {/* Rotate Handle Stem (Top Center) */}
            <div
              onPointerDown={(e) =>
                beginPointerTransform(
                  e,
                  'rotate',
                  selectedLayer,
                  selectedOverlayId
                )
              }
              title="Drag to Rotate"
              className="absolute -top-6 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-white text-zinc-900 shadow-md flex items-center justify-center cursor-grab active:cursor-grabbing hover:scale-110 transition-transform"
            >
              <RotateCw className="w-3 h-3" />
            </div>

            {/* 4 Corner Scale / Zoom Handles */}
            {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => {
                const posClass =
                  corner === 'nw'
                    ? '-top-1.5 -left-1.5 cursor-nwse-resize'
                    : corner === 'ne'
                    ? '-top-1.5 -right-1.5 cursor-nesw-resize'
                    : corner === 'sw'
                    ? '-bottom-1.5 -left-1.5 cursor-nesw-resize'
                    : '-bottom-1.5 -right-1.5 cursor-nwse-resize';
                return (
                  <div
                    key={corner}
                    onPointerDown={(e) =>
                      beginPointerTransform(
                        e,
                        'scale',
                        selectedLayer,
                        selectedOverlayId
                      )
                    }
                    title="Drag Corner to Scale / Zoom"
                    className={`absolute ${posClass} w-3 h-3 rounded-sm bg-white border border-zinc-900 shadow`}
                  />
                );
              })}

            {/* Quick Delete Corner Badge ONLY when an imported overlay or imported character is selected */}
            {selectedLayer === 'overlay' && selectedOverlay && (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteOverlay(selectedOverlay.id);
                }}
                title="ওভারলে ডিলিট করুন"
                className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow flex items-center justify-center cursor-pointer"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            )}

            {selectedLayer === 'character' &&
              hasImportedMainCharacter &&
              onDeleteMainCharacter && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteMainCharacter();
                  }}
                  title="ইমপোর্ট করা ক্যারেক্টার ডিলিট করুন"
                  className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow flex items-center justify-center cursor-pointer"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              )}
          </div>
        )}
    </div>
  );
};

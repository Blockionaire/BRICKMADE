"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Maximize2,
  RotateCcw,
  Minus,
  Plus,
  Move3D,
  X,
  ScanLine,
  ArrowUpRight,
  Layers,
  Play,
  Compass,
} from "lucide-react";
import { CATALOG, COLORS } from "@/domain/catalog";
import { BUILDER_BY_REBRICKABLE } from "@/domain/parts/profiles";
import { findMates, quarterTurn } from "@/domain/parts/connections";
import type { CameraView, HouseModel, PlacementMode } from "@/domain/types";
import { PartIllustration, Sheet } from "./ui";
const Canvas = dynamic(() => import("./model-canvas"), {
  ssr: false,
  loading: () => (
    <div className="viewer-loading">
      <span className="loading-dot" /> Loading your build studio
    </div>
  ),
});

export function ModelViewer({
  model,
  step,
  controls = true,
  allowExpand = true,
  selectable = false,
  requestedView,
  onViewChange,
  highlight = true,
  className = "",
  placementMode = "assembled",
  replay = 0,
  guided = false,
  selectedPlacementId,
  onSelect,
  cameraRequest = 0,
}: {
  model: HouseModel;
  step?: number;
  controls?: boolean;
  allowExpand?: boolean;
  selectable?: boolean;
  requestedView?: CameraView;
  onViewChange?: (view: CameraView) => void;
  highlight?: boolean;
  className?: string;
  placementMode?: PlacementMode;
  replay?: number;
  guided?: boolean;
  selectedPlacementId?: string;
  onSelect?: (id: string | undefined) => void;
  cameraRequest?: number;
}) {
  const [localSelected, setLocalSelected] = useState<string>();
  const [matchingId, setMatchingId] = useState<string>();
  const selectedId = onSelect ? selectedPlacementId : localSelected;
  const selected = model.placements.find(
    (p) => p.id === selectedId && (!step || p.step <= step),
  );
  const matching = !!selected && matchingId === selected.id;
  const select = (id: string | undefined) => {
    setMatchingId(undefined);
    if (onSelect) onSelect(id);
    else setLocalSelected(id);
  };
  const [view, setView] = useState<CameraView>("perspective");
  const [zoom, setZoom] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [expandedView, setExpandedView] = useState<CameraView>("perspective");
  const effectiveView = requestedView ?? view;
  const currentStep = step ? model.steps[step - 1] : undefined;
  const visibleMatches = selected
    ? model.placements.filter(
        (p) =>
          p.partId === selected.partId &&
          p.color === selected.color &&
          (!step || p.step <= step),
      ).length
    : 0;
  const totalMatches = selected
    ? model.parts.find(
        (p) => p.partId === selected.partId && p.color === selected.color,
      )?.quantity
    : 0;
  const attachments = useMemo(() => {
    if (!selectable) return new Map<string, number>();
    const result = findMates(
      model.placements.map((p) => ({
        id: p.id,
        partId: BUILDER_BY_REBRICKABLE.get(p.partId)!.id,
        position: p.position,
        rotation: quarterTurn(p.rotated ? 1 : 0),
      })),
    );
    const counts = new Map<string, number>();
    for (const mate of result.mates)
      for (const c of [mate.a, mate.b])
        counts.set(c.pieceId, (counts.get(c.pieceId) ?? 0) + 1);
    return counts;
  }, [model, selectable]);
  const views: { id: CameraView; name: string }[] = [
    { id: "perspective", name: "3D" },
    { id: "front", name: "Front" },
    { id: "back", name: "Back" },
    { id: "side", name: "Right" },
    { id: "left", name: "Left" },
    { id: "top", name: "Top" },
  ];
  return (
    <div
      className={`model-viewer ${selectable ? "interactive-studio" : ""} ${className}`}
    >
      <Canvas
        model={model}
        step={step}
        view={effectiveView}
        zoom={zoom}
        highlight={highlight}
        selectedPlacementId={selectable ? selected?.id : undefined}
        matchingKey={
          selectable && matching && selected
            ? `${selected.partId}:${selected.color}`
            : undefined
        }
        onPick={selectable ? (p) => select(p?.id) : undefined}
        placementMode={placementMode}
        replay={replay}
        focus={guided ? currentStep?.focus : undefined}
        cameraRequest={cameraRequest}
      />
      {controls && (
        <>
          <div className="viewer-top">
            <span className="viewer-caption">
              <Move3D size={14} />
              {selectable
                ? "Tap any brick. Get the details."
                : "Your model. Every little piece."}
            </span>
            {allowExpand && (
              <button
                className="viewer-icon"
                aria-label="Expand model"
                onClick={() => {
                  setExpandedView(effectiveView);
                  setExpanded(true);
                }}
              >
                <Maximize2 size={17} />
              </button>
            )}
          </div>
          {guided && currentStep && (
            <span className="angle-badge">
              <Compass size={12} /> Best angle:{" "}
              {views.find((v) => v.id === currentStep.suggestedView)?.name}
            </span>
          )}
          <div className="viewer-bottom">
            <div className="camera-presets" aria-label="Camera views">
              {views.map((v) => (
                <button
                  key={v.id}
                  aria-pressed={effectiveView === v.id}
                  onClick={() => {
                    setView(v.id);
                    onViewChange?.(v.id);
                  }}
                >
                  {v.name}
                </button>
              ))}
            </div>
            <div className="zoom-controls">
              <button
                aria-label="Zoom out"
                onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}
                disabled={zoom <= 0.6}
              >
                <Minus size={16} />
              </button>
              <button
                aria-label="Zoom in"
                onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
                disabled={zoom >= 3}
              >
                <Plus size={16} />
              </button>
              <button
                aria-label="Reset camera"
                onClick={() => {
                  setView("perspective");
                  setZoom(1);
                  onViewChange?.("perspective");
                }}
              >
                <RotateCcw size={15} />
              </button>
            </div>
          </div>
        </>
      )}
      {selectable && selected && (
        <div
          className="brick-inspector"
          aria-label="Selected brick"
          role="region"
        >
          <div className="inspector-heading">
            <span className="inspector-render">
              <PartIllustration
                partId={selected.partId}
                color={selected.color}
                small
              />
            </span>
            <div role="status">
              <small>BRICK SPOTLIGHT</small>
              <strong>
                {CATALOG[selected.partId].name} · #{selected.partId}
              </strong>
              <span>
                {COLORS[selected.color].name} · Added in step {selected.step} ·
                Bag {model.steps[selected.step - 1].bag}
              </span>
            </div>
            <button
              aria-label="Clear brick selection"
              onClick={() => select(undefined)}
            >
              <X size={16} />
            </button>
          </div>
          <p className="inspector-attachments">
            {BUILDER_BY_REBRICKABLE.get(selected.partId)!.connectors.length}{" "}
            reviewed attachment points · {attachments.get(selected.id) ?? 0}{" "}
            aligned in this design.
            <Link href="/connections">
              Explore connections <ArrowUpRight size={12} />
            </Link>
            <span>
              Alignment is a geometry check; this demo still needs whole-model
              validation.
            </span>
          </p>
          <div className="inspector-actions">
            <button
              aria-pressed={matching}
              onClick={() => setMatchingId(matching ? undefined : selected.id)}
            >
              <ScanLine size={15} />
              {matching ? "Clear matches" : "Highlight matching pieces"}
              <span>{visibleMatches}</span>
            </button>
            <Link
              href={`/parts?part=${selected.partId}&color=${selected.color}`}
            >
              <ArrowUpRight size={15} /> Find in parts
            </Link>
          </div>
          {matching && (
            <p className="match-count">
              {visibleMatches} matching pieces visible · {totalMatches} in this
              build
            </p>
          )}
        </div>
      )}
      {step && (
        <span className="placement-caption">
          {placementMode === "guide" ? (
            <Play size={12} />
          ) : (
            <Layers size={12} />
          )}
          {placementMode === "guide"
            ? "Follow the coral outlines"
            : "Assembled view"}
        </span>
      )}
      {expanded && (
        <Sheet
          title="Your build. Up close."
          onClose={() => setExpanded(false)}
          className="model-sheet"
        >
          <ModelViewer
            model={model}
            step={step}
            highlight={highlight}
            selectable={selectable}
            requestedView={expandedView}
            onViewChange={setExpandedView}
            allowExpand={false}
            placementMode={placementMode}
            replay={replay}
            guided={guided}
          />
          <p className="muted center">
            Drag to explore. Pinch or scroll to zoom.
          </p>
        </Sheet>
      )}
    </div>
  );
}

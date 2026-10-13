"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Maximize2, RotateCcw, Minus, Plus, Move3D } from "lucide-react";
import type { HouseModel } from "@/domain/types";
import type { CameraView } from "./model-canvas";
import { Sheet } from "./ui";

const Canvas = dynamic(() => import("./model-canvas"), {
  ssr: false,
  loading: () => (
    <div className="viewer-loading">
      <span className="loading-dot" /> Preparing your model
    </div>
  ),
});

export function ModelViewer({
  model,
  step,
  controls = true,
  requestedView,
  onViewChange,
  highlight = true,
  className = "",
}: {
  model: HouseModel;
  step?: number;
  controls?: boolean;
  requestedView?: CameraView;
  onViewChange?: () => void;
  highlight?: boolean;
  className?: string;
}) {
  const [view, setView] = useState<CameraView>("perspective");
  const [zoom, setZoom] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const views: { id: CameraView; name: string }[] = [
    { id: "perspective", name: "3D" },
    { id: "front", name: "Front" },
    { id: "side", name: "Side" },
    { id: "top", name: "Top" },
  ];
  const effectiveView = requestedView ?? view;
  return (
    <div className={`model-viewer ${className}`}>
      <Canvas
        model={model}
        step={step}
        view={effectiveView}
        zoom={zoom}
        highlight={highlight}
      />
      {controls && (
        <>
          <div className="viewer-top">
            <span className="viewer-caption">
              <Move3D size={14} /> Interactive model
            </span>
            <button
              className="viewer-icon"
              aria-label="Expand model"
              onClick={() => setExpanded(true)}
            >
              <Maximize2 size={17} />
            </button>
          </div>
          <div className="viewer-bottom">
            <div className="camera-presets" aria-label="Camera views">
              {views.map((v) => (
                <button
                  key={v.id}
                  aria-pressed={effectiveView === v.id}
                  onClick={() => {
                    setView(v.id);
                    onViewChange?.();
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
                onClick={() => setZoom((z) => Math.min(2.6, z + 0.2))}
                disabled={zoom >= 2.6}
              >
                <Plus size={16} />
              </button>
              <button
                aria-label="Reset camera"
                onClick={() => {
                  setView("perspective");
                  setZoom(1);
                  onViewChange?.();
                }}
              >
                <RotateCcw size={15} />
              </button>
            </div>
          </div>
        </>
      )}
      {expanded && (
        <Sheet
          title="A closer look"
          onClose={() => setExpanded(false)}
          className="model-sheet"
        >
          <ModelViewer model={model} step={step} highlight={highlight} />
          <p className="muted center">
            Drag to rotate. Pinch or scroll to zoom.
          </p>
        </Sheet>
      )}
    </div>
  );
}

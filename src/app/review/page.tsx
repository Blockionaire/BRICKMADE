"use client";

import { useState } from "react";
import { Check, ArrowRight, Layers, Blocks, Info, Pencil } from "lucide-react";
import Link from "next/link";
import { ModelViewer } from "@/components/model-viewer";
import { ModelStats, PageHeading, Sheet } from "@/components/ui";
import { DetailSelector, SizeSelector } from "@/components/settings";
import { createHouse } from "@/domain/house";
import { projectRepository, useProjects } from "@/services/project-repository";
import type { GenerationSettings } from "@/domain/types";

export default function ReviewPage() {
  const { active } = useProjects();
  const model = createHouse(active.settings);
  const [pendingSettings, setPendingSettings] =
    useState<GenerationSettings | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  function updateSettings(settings: GenerationSettings) {
    if (active.currentStep > 1 || active.completed)
      setPendingSettings(settings);
    else
      projectRepository.save({
        ...active,
        settings,
        currentStep: 1,
        completed: false,
      });
  }
  return (
    <div id="page-content" className="review-page">
      <PageHeading
        eyebrow="A familiar place. A new perspective."
        title="Look what you can make."
        description="A little piece of your world, reimagined in bricks."
        back="/"
      />
      <div className="review-layout">
        <div>
          <div className="review-model-wrap">
            <div className="review-model-label">
              <span className="tag">
                <Check size={13} /> Your preview is ready
              </span>
              <span className="demo-label">DEMO MODEL</span>
            </div>
            <ModelViewer model={model} className="review-viewer" />
          </div>
          <div className="model-under-note">
            <span>Drag to rotate. Pinch or scroll to zoom.</span>
            <span>All sides. All the little details.</span>
          </div>
          <ModelStats model={model} />
        </div>
        <div className="review-details">
          <span className="eyebrow">Made for your shelf</span>
          <div className="project-title">
            <h2>{active.name}</h2>
            <button
              className="icon-button"
              aria-label="Rename build"
              onClick={() => {
                setName(active.name);
                setRenaming(true);
              }}
            >
              <Pencil size={17} />
            </button>
          </div>
          <p>
            A terracotta roof, warm little windows, and a path to the front
            door. Home has a new shape.
          </p>
          <DetailSelector
            compact
            value={active.settings.detail}
            onChange={(detail) =>
              updateSettings({ ...active.settings, detail })
            }
          />
          <SizeSelector
            value={active.settings.size}
            onChange={(size) => updateSettings({ ...active.settings, size })}
          />
          <div className="review-summary">
            <span>
              <Layers size={17} />
              {model.stats.uniquePartCount} part & color combinations
            </span>
            <span>
              <Blocks size={17} />
              {model.steps.length} demo steps · {model.bags.length} sorting bags
            </span>
          </div>
          <Link className="button button-primary" href="/builder">
            {active.completed
              ? "Revisit the build"
              : active.currentStep > 1
                ? "Continue building"
                : "Let’s build this"}
            <ArrowRight size={17} />
          </Link>
          <Link className="button button-secondary" href="/parts">
            Explore the parts <Layers size={17} />
          </Link>
          <p className="review-disclaimer">
            <Info size={15} />
            Demo model and instructions. Physical connections, colors,
            availability, and stability are not yet validated.
          </p>
        </div>
      </div>
      {pendingSettings && (
        <Sheet
          title="Try a different version?"
          onClose={() => setPendingSettings(null)}
        >
          <p className="sheet-copy">
            A different detail level or size changes the model and its steps.
            Your building progress for this house will start again at step 1.
          </p>
          <div className="sheet-actions">
            <button
              className="button button-secondary"
              onClick={() => setPendingSettings(null)}
            >
              Keep my progress
            </button>
            <button
              className="button button-primary"
              onClick={() => {
                projectRepository.save({
                  ...active,
                  settings: pendingSettings,
                  currentStep: 1,
                  completed: false,
                });
                setPendingSettings(null);
              }}
            >
              Switch version
            </button>
          </div>
        </Sheet>
      )}
      {renaming && (
        <Sheet title="Make it yours" onClose={() => setRenaming(false)}>
          <label className="field-label" htmlFor="rename">
            Build name
          </label>
          <input
            autoFocus
            id="rename"
            className="text-input"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="button button-primary full-width"
            disabled={!name.trim()}
            onClick={() => {
              projectRepository.save({ ...active, name: name.trim() });
              setRenaming(false);
            }}
          >
            Save name <Check size={17} />
          </button>
        </Sheet>
      )}
    </div>
  );
}

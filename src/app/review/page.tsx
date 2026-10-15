"use client";

import { projectModel } from "@/domain/project-model";
import { useEffect, useRef, useState } from "react";
import { Check, ArrowRight, Layers, Blocks, Info, Pencil } from "lucide-react";
import Link from "next/link";
import { ModelViewer } from "@/components/model-viewer";
import { ModelStats, PageHeading, Sheet } from "@/components/ui";
import {
  DetailSelector,
  ModelKindSelector,
  SizeSelector,
  BuildDifficultySelector,
} from "@/components/settings";
import { regroupProject } from "@/domain/instruction-progress";
import { AssemblyReview } from "@/components/assembly-review";
import { MigrationNotice } from "@/components/migration-notice";
import { modelInfo } from "@/domain/models";
import { createModel } from "@/domain/models";
import { projectRepository, useProjects } from "@/services/project-repository";
import type { GenerationSettings } from "@/domain/types";
import { HouseBriefEditor } from "@/components/house-brief-editor";
import type { HouseBrief } from "../../../shared/house-brief";
import { reviewAssembly } from "@/services/assembly-validation";

export default function ReviewPage() {
  const { active } = useProjects();
  const model = projectModel(active);
  const [pendingSettings, setPendingSettings] =
    useState<GenerationSettings | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [draft, setDraft] = useState<HouseBrief | null>(null);
  const [checking, setChecking] = useState(false);
  const [designError, setDesignError] = useState("");
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  async function updateSettings(settings: GenerationSettings) {
    const id = ++request.current;
    setChecking(true);
    setDesignError("");
    try {
      const report = await reviewAssembly(createModel(settings));
      if (id !== request.current) return;
      if (report.status !== "passed")
        throw Error(
          "This version did not pass the assembly checks. Your saved design has been kept.",
        );
      setDraft(null);
      if (active.currentStep > 1 || active.completed)
        setPendingSettings(settings);
      else
        projectRepository.save({
          ...active,
          settings,
          currentStep: 1,
          completed: false,
          completedPlacementIds: undefined,
        });
    } catch (e) {
      if (id === request.current)
        setDesignError(
          e instanceof Error ? e.message : "Could not check this design.",
        );
    } finally {
      if (id === request.current) setChecking(false);
    }
  }
  return (
    <div id="page-content" className="review-page">
      <PageHeading
        eyebrow="A familiar place. A new perspective."
        title="Look what you can make."
        description="A little piece of your world, reimagined in bricks."
        back="/"
      />
      <MigrationNotice project={active} />
      <div className="review-layout">
        <div>
          <div className="review-model-wrap">
            <div className="review-model-label">
              <span className="tag">
                <Check size={13} /> Your preview is ready
              </span>
              <span className="demo-label">
                {model.design
                  ? model.design.source === "openai"
                    ? "PHOTO-ASSISTED PROTOTYPE"
                    : "GENERATED HOUSE"
                  : "DEMO MODEL"}
              </span>
            </div>
            <ModelViewer model={model} className="review-viewer" />
          </div>
          <div className="model-under-note">
            <span>Drag to rotate. Pinch or scroll to zoom.</span>
            <span>All sides. All the little details.</span>
          </div>
          <ModelStats model={model} />
          <AssemblyReview model={model} />
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
            {model.studio
              ? "Created from your photos with category-specific house construction rules."
              : model.design
                ? "Generated from your editable house description. Review the adaptations below for the actual design choices."
                : modelInfo(active.settings).description}
          </p>
          {model.design ? (
            <div className="generated-design-summary">
              <span className="tag">Your editable design</span>
              <p>
                {model.design.brief.roof === "flat"
                  ? "Flat roof"
                  : "Stepped gable"}{" "}
                · {model.design.brief.height} height ·{" "}
                {model.design.brief.aspectRatio.toFixed(2)} : 1 requested
                proportions
              </p>
              {!active.artifact && (
                <button
                  className="button button-secondary"
                  onClick={() => {
                    setDraft(model.design!.brief);
                    setDesignError("");
                  }}
                >
                  <Pencil size={16} />
                  Edit house description
                </button>
              )}
              {active.cloud && (
                <Link
                  href={`/design?job=${active.cloud.jobId}`}
                  className="button button-secondary"
                >
                  Open saved design & versions
                </Link>
              )}
              <details>
                <summary>Design adaptations & limits</summary>
                <ul>
                  {[
                    ...model.design.adaptations,
                    ...model.design.brief.uncertainties,
                  ].map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              </details>
            </div>
          ) : (
            <ModelKindSelector
              value={active.settings.modelKind ?? "house"}
              onChange={(modelKind) =>
                updateSettings({ ...active.settings, modelKind })
              }
            />
          )}
          {!active.artifact && (
            <>
              <DetailSelector
                settings={active.settings}
                compact
                value={active.settings.detail}
                onChange={(detail) =>
                  updateSettings({ ...active.settings, detail })
                }
              />
              <SizeSelector
                value={active.settings.size}
                onChange={(size) =>
                  updateSettings({ ...active.settings, size })
                }
              />
            </>
          )}
          <div className="review-summary">
            <span>
              <Layers size={17} />
              {model.stats.uniquePartCount} part & color combinations
            </span>
            <span>
              <Blocks size={17} />
              {model.steps.length} {model.design ? "building" : "demo"} steps ·{" "}
              {model.bags.length} sorting bags
            </span>
          </div>
          {checking && (
            <p className="field-description" role="status">
              Checking the new version before saving…
            </p>
          )}
          {designError && (
            <p className="form-error" role="alert">
              {designError}
            </p>
          )}
          <BuildDifficultySelector
            frozenModel={active.artifact ? model : undefined}
            compact
            settings={active.settings}
            onChange={(difficulty) =>
              projectRepository.save(regroupProject(active, difficulty))
            }
          />
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
            {model.design ? "Generated prototype" : "Demo design"}. Colors have
            recorded source evidence. Physical fit, strength and current
            availability remain untested.
          </p>
        </div>
      </div>
      {draft && (
        <Sheet
          title="Shape your house"
          onClose={() => {
            request.current++;
            setChecking(false);
            setDraft(null);
          }}
        >
          <HouseBriefEditor
            brief={draft}
            onChange={setDraft}
            showPresets={false}
          />
          {designError && (
            <p role="alert" className="form-error">
              {designError}
            </p>
          )}
          <button
            className="button button-primary full-width"
            disabled={checking}
            onClick={() =>
              updateSettings({ ...active.settings, houseBrief: draft })
            }
          >
            {checking ? "Checking this design…" : "Check & apply description"}
            <Check size={16} />
          </button>
        </Sheet>
      )}
      {pendingSettings && (
        <Sheet
          title="Try a different version?"
          onClose={() => setPendingSettings(null)}
        >
          <p className="sheet-copy">
            A different detail level or size changes the model and its steps.
            Your building progress for this design will start again at step 1.
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
                  completedPlacementIds: undefined,
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

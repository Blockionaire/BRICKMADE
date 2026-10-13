"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Layers,
  Sparkles,
  RotateCcw,
  BookOpen,
  Play,
  Compass,
  ScanLine,
  Zap,
  CheckCircle2,
  ArrowUpRight,
} from "lucide-react";
import { ProjectSelector } from "@/components/project-selector";
import type { CameraView, PlacementMode, Project } from "@/domain/types";
import { ModelViewer } from "@/components/model-viewer";
import { PartCard, Sheet } from "@/components/ui";
import { Assistant } from "@/components/assistant";
import { createHouse } from "@/domain/house";
import { projectRepository, useProjects } from "@/services/project-repository";

export default function BuilderPage() {
  const { active } = useProjects();
  return <BuilderContent key={active.id} active={active} />;
}

function BuilderContent({ active }: { active: Project }) {
  const model = createHouse(active.settings);
  const number = Math.min(active.currentStep, model.steps.length);
  const step = model.steps[number - 1];
  const bag = model.bags.find((b) => b.number === step.bag)!;
  const [assistant, setAssistant] = useState(false);
  const [stepPicker, setStepPicker] = useState(false);
  const [pickerBag, setPickerBag] = useState(bag.number);
  const [restart, setRestart] = useState(false);
  const [view, setView] = useState<CameraView>();
  const [highlight, setHighlight] = useState(true);
  const [placementMode, setPlacementMode] = useState<PlacementMode>("guide");
  const [replay, setReplay] = useState(0);
  const [autoCamera, setAutoCamera] = useState(true);
  const [cameraRequest, setCameraRequest] = useState(0);
  const [selected, setSelected] = useState<string>();
  const completedSteps = active.completed ? model.steps.length : number - 1;
  const progress = Math.round((completedSteps / model.steps.length) * 100);
  const visibleCount = model.placements.filter((p) => p.step <= number).length;
  const rail = model.steps.slice(
    Math.max(0, Math.min(number - 3, model.steps.length - 5)),
    Math.max(5, Math.min(number + 2, model.steps.length)),
  );
  function goTo(next: number) {
    setView(undefined);
    setSelected(undefined);
    projectRepository.save({ ...active, currentStep: next, completed: false });
  }
  function findPlace() {
    setPickerBag(bag.number);
    setStepPicker(true);
  }

  if (active.completed)
    return (
      <div id="page-content" className="completion-page modern-completion">
        <ProjectSelector />
        <div className="completion-burst" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <i
              key={i}
              style={{ "--confetti-index": i } as React.CSSProperties}
            />
          ))}
          <CheckCircle2 size={40} />
        </div>
        <span className="tag">BUILD COMPLETE</span>
        <h1>Home, made by you.</h1>
        <p>
          {model.stats.pieceCount.toLocaleString()} pieces. One little
          masterpiece.
        </p>
        <ModelViewer model={model} selectable className="completion-viewer" />
        <div className="completion-stats">
          <span>
            <strong>{model.stats.pieceCount}</strong>pieces
          </span>
          <span>
            <strong>{model.steps.length}</strong>guided steps
          </span>
          <span>
            <strong>100%</strong>complete
          </span>
        </div>
        <div className="completion-actions">
          <Link className="button button-primary" href="/">
            Back to my builds <ArrowRight size={17} />
          </Link>
          <button
            className="button button-secondary"
            onClick={() => setRestart(true)}
          >
            <RotateCcw size={16} /> Build it again
          </button>
        </div>
        <p className="demo-note">
          Digital demo complete. Physical construction still needs validation.
        </p>
        {restart && (
          <Sheet
            title="Start the walkthrough again?"
            onClose={() => setRestart(false)}
          >
            <p className="sheet-copy">
              This resets the building progress for {active.name}. Your design
              stays saved.
            </p>
            <button
              className="button button-primary full-width"
              onClick={() => {
                goTo(1);
                setRestart(false);
              }}
            >
              Start at step 1
            </button>
          </Sheet>
        )}
      </div>
    );

  return (
    <div id="page-content" className="builder-page build-studio">
      <ProjectSelector />
      <div className="studio-heading">
        <div>
          <Link href="/review" className="back-link">
            <ArrowLeft size={14} /> Your design
          </Link>
          <span className="eyebrow">
            <Zap size={13} /> BUILD STUDIO · DEMO
          </span>
          <h1>{active.name}</h1>
          <p>Build something worth showing off.</p>
        </div>
        <div
          className="studio-progress-ring"
          style={{ "--progress": `${progress}%` } as React.CSSProperties}
        >
          <span>
            <strong>{progress}%</strong>
            <small>made by you</small>
          </span>
        </div>
      </div>
      <div className="studio-status">
        <button onClick={findPlace}>
          <Layers size={15} /> Step <strong>{number}</strong> of{" "}
          {model.steps.length} <ArrowUpRight size={14} />
        </button>
        <span className="saved-state">
          <i /> Progress saved
        </span>
        <div
          role="progressbar"
          aria-label="Completed build steps"
          aria-valuenow={completedSteps}
          aria-valuemin={0}
          aria-valuemax={model.steps.length}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="builder-layout">
        <div className="builder-main">
          <div className="studio-stage">
            <div className="studio-stage-heading">
              <span className="studio-bag">
                <Layers size={15} /> BAG {bag.number}
                <small>{bag.name}</small>
              </span>
              <span className="studio-step-size">
                {step.placementIds.length} pieces this step
              </span>
            </div>
            <ModelViewer
              model={model}
              step={number}
              selectable
              selectedPlacementId={selected}
              onSelect={setSelected}
              requestedView={
                view ?? (autoCamera ? step.suggestedView : undefined)
              }
              onViewChange={setView}
              highlight={highlight}
              placementMode={placementMode}
              replay={replay}
              guided={autoCamera}
              cameraRequest={cameraRequest}
              className="builder-viewer"
            />
            <div className="studio-toolbox">
              <div
                className="placement-switch"
                role="group"
                aria-label="Placement view"
              >
                <button
                  aria-pressed={placementMode === "guide"}
                  onClick={() => setPlacementMode("guide")}
                >
                  <Play size={14} /> Placement guide
                </button>
                <button
                  aria-pressed={placementMode === "assembled"}
                  onClick={() => setPlacementMode("assembled")}
                >
                  <Layers size={14} /> Assembled
                </button>
              </div>
              <button
                className="replay-placement"
                onClick={() => {
                  setPlacementMode("guide");
                  setReplay((r) => r + 1);
                }}
              >
                <RotateCcw size={14} /> Replay placement
              </button>
            </div>
            <div className="studio-camera-tools">
              <button
                aria-pressed={autoCamera}
                onClick={() => {
                  if (autoCamera) setView(view ?? step.suggestedView);
                  else setView(undefined);
                  setAutoCamera((a) => !a);
                }}
              >
                <Compass size={14} /> Auto camera <i />
              </button>
              <button
                onClick={() => {
                  setView(step.suggestedView);
                  setCameraRequest((n) => n + 1);
                }}
              >
                <ScanLine size={14} /> Suggested angle
              </button>
              <button
                aria-pressed={highlight}
                onClick={() => setHighlight((h) => !h)}
              >
                <Sparkles size={14} /> New in this step{" "}
                {highlight && <Check size={12} />}
              </button>
            </div>
          </div>
          <p className="builder-piece-count" role="status">
            {visibleCount} of {model.stats.pieceCount} pieces shown ·{" "}
            {step.placementIds.length} added in this step
          </p>
          <div className="step-navigation">
            <button
              className="button button-secondary"
              disabled={number === 1}
              onClick={() => goTo(number - 1)}
            >
              <ArrowLeft size={17} /> Previous
            </button>
            <span>
              {number} / {model.steps.length}
            </span>
            <button
              className="button button-primary"
              onClick={() =>
                number < model.steps.length
                  ? goTo(number + 1)
                  : projectRepository.save({
                      ...active,
                      currentStep: number,
                      completed: true,
                    })
              }
            >
              {number === model.steps.length ? "Finish build" : "Next step"}
              {number === model.steps.length ? (
                <Check size={17} />
              ) : (
                <ArrowRight size={17} />
              )}
            </button>
          </div>
          <div className="step-rail" aria-label="Nearby build steps">
            {rail.map((s) => (
              <button
                key={s.number}
                aria-label={`Go to step ${s.number}`}
                aria-current={s.number === number ? "step" : undefined}
                onClick={() => goTo(s.number)}
              >
                <span>
                  {s.number < number ? <Check size={12} /> : s.number}
                </span>
                <small>{s.placementIds.length} pcs</small>
              </button>
            ))}
            <button className="rail-all" onClick={findPlace}>
              <Layers size={17} />
              <small>All steps</small>
            </button>
          </div>
        </div>
        <div className="step-details">
          <div className="instruction-card" key={number}>
            <span className="instruction-kicker">
              {step.area}{" "}
              <span>
                GROUP {step.cluster} / {step.clusters}
              </span>
            </span>
            <h2>{step.title}</h2>
            <p className="step-description">{step.description}</p>
            <div className="step-parts-heading">
              <h3>
                Your next pieces <span>{step.placementIds.length}</span>
              </h3>
              <Link href={`/parts?bag=${bag.number}`} className="text-link">
                Bag {bag.number} <ArrowUpRight size={14} />
              </Link>
            </div>
            <p className="piece-pick-hint">
              Tap a piece card to spotlight it in the model.
            </p>
            <div className="step-parts">
              {step.parts.map((p) => (
                <PartCard
                  key={p.key}
                  part={p}
                  onClick={() =>
                    setSelected(
                      model.placements.find(
                        (piece) =>
                          piece.step === number &&
                          piece.partId === p.partId &&
                          piece.color === p.color,
                      )?.id,
                    )
                  }
                />
              ))}
            </div>
            <div className="builder-tip">
              <BookOpen size={17} />
              <p>{step.hint}</p>
            </div>
          </div>
          <button className="assistant-cta" onClick={() => setAssistant(true)}>
            <span className="assistant-cta-icon">
              <Sparkles size={22} />
            </span>
            <span>
              <strong>A little help?</strong>
              <small>Your assistant knows this exact step.</small>
            </span>
            <ArrowUpRight size={18} />
          </button>
          <p className="demo-note">
            Guided digital demo. Physical fit and stability haven’t been
            validated yet.
          </p>
        </div>
      </div>
      {assistant && (
        <Assistant
          context={{
            projectName: active.name,
            step,
            nextStep: model.steps[number],
            bag,
          }}
          onClose={() => setAssistant(false)}
          onAction={(action) => {
            if (action === "top-view") setView("top");
            else setHighlight(true);
          }}
        />
      )}
      {stepPicker && (
        <Sheet
          title="Find your place"
          onClose={() => setStepPicker(false)}
          className="step-map-sheet"
        >
          <p className="sheet-copy">
            Jump to a step. Earlier steps are marked complete when you skip
            ahead.
          </p>
          <div className="step-bag-tabs">
            {model.bags.map((b) => (
              <button
                key={b.number}
                aria-pressed={pickerBag === b.number}
                onClick={() => setPickerBag(b.number)}
              >
                Bag {b.number}
                <small>{b.name}</small>
              </button>
            ))}
          </div>
          <div className="step-picker">
            {model.steps
              .filter((s) => s.bag === pickerBag)
              .map((s) => (
                <button
                  key={s.number}
                  aria-label={`Go to step ${s.number}`}
                  className={number === s.number ? "selected" : ""}
                  onClick={() => {
                    goTo(s.number);
                    setStepPicker(false);
                  }}
                >
                  <span>
                    {s.number < number ? <Check size={15} /> : s.number}
                  </span>
                  <div>
                    <strong>{s.title}</strong>
                    <small>
                      {s.area} · {s.placementIds.length} pieces · Group{" "}
                      {s.cluster}/{s.clusters}
                    </small>
                  </div>
                  {number === s.number && (
                    <span className="current-label">Here</span>
                  )}
                </button>
              ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}

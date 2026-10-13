"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Layers,
  Sparkles,
  RotateCcw,
  BookOpen,
} from "lucide-react";
import { ModelViewer } from "@/components/model-viewer";
import { PartCard, Sheet } from "@/components/ui";
import { Assistant } from "@/components/assistant";
import { createHouse } from "@/domain/house";
import { projectRepository, useProjects } from "@/services/project-repository";
import type { CameraView } from "@/components/model-canvas";

export default function BuilderPage() {
  const { active } = useProjects();
  const model = createHouse(active.settings);
  const number = Math.min(active.currentStep, model.steps.length);
  const step = model.steps[number - 1];
  const bag = model.bags.find((b) => b.number === step.bag)!;
  const [assistant, setAssistant] = useState(false);
  const [stepPicker, setStepPicker] = useState(false);
  const [restart, setRestart] = useState(false);
  const [view, setView] = useState<CameraView>();
  const [highlight, setHighlight] = useState(true);
  const completedSteps = active.completed ? model.steps.length : number - 1;
  const progress = Math.round((completedSteps / model.steps.length) * 100);

  function goTo(next: number) {
    setView(undefined);
    projectRepository.save({ ...active, currentStep: next, completed: false });
  }

  if (active.completed)
    return (
      <div id="page-content" className="completion-page">
        <span className="tag">
          <Check size={14} /> A little accomplishment
        </span>
        <h1>Home, made by you.</h1>
        <p>One brick at a time. One little memory to keep.</p>
        <ModelViewer model={model} className="completion-viewer" />
        <div className="completion-stats">
          <span>
            <strong>{model.stats.pieceCount}</strong>pieces
          </span>
          <span>
            <strong>{model.steps.length}</strong>demo steps
          </span>
          <span>
            <strong>100%</strong>complete
          </span>
        </div>
        <span className="demo-note">
          You’ve completed the digital demo walkthrough.
        </span>
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
        {restart && (
          <Sheet
            title="Start the walkthrough again?"
            onClose={() => setRestart(false)}
          >
            <p className="sheet-copy">
              This resets the building progress for {active.name}. The design
              and parts stay the same.
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
    <div id="page-content" className="builder-page">
      <div className="builder-title">
        <div>
          <Link href="/review" className="back-link">
            <ArrowLeft size={16} /> Your design
          </Link>
          <span className="eyebrow">A little progress, every step</span>
          <h1>{active.name}</h1>
        </div>
        <span className="demo-label">DEMO WALKTHROUGH</span>
      </div>
      <div className="builder-progress">
        <button onClick={() => setStepPicker(true)}>
          Step <strong>{number}</strong> of {model.steps.length}
          <ChevronDown size={16} />
        </button>
        <span>{progress}% complete</span>
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
          <div className="builder-model">
            <div className="bag-label">
              <Layers size={16} />
              <strong>Bag {bag.number}</strong>
              <span>{bag.name}</span>
            </div>
            <ModelViewer
              model={model}
              step={number}
              requestedView={view}
              onViewChange={() => setView(undefined)}
              highlight={highlight}
              className="builder-viewer"
            />
            <div className="viewer-legend">
              <span>
                <i />
                Already built
              </span>
              <button
                aria-pressed={highlight}
                onClick={() => setHighlight((h) => !h)}
              >
                <i />
                New in this step {highlight && <Check size={12} />}
              </button>
            </div>
          </div>
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
        </div>
        <div className="step-details">
          <span className="eyebrow">
            Step {number} · {step.parts.reduce((n, p) => n + p.quantity, 0)}{" "}
            pieces
          </span>
          <h2>{step.title}</h2>
          <p className="step-description">{step.description}</p>
          <div className="step-parts-heading">
            <h3>What you’ll need</h3>
            <Link href={`/parts?bag=${bag.number}`} className="text-link">
              Bag {bag.number} <ArrowRight size={14} />
            </Link>
          </div>
          <div className="step-parts">
            {step.parts.map((p) => (
              <PartCard key={p.key} part={p} />
            ))}
          </div>
          <button className="assistant-cta" onClick={() => setAssistant(true)}>
            <span className="assistant-cta-icon">
              <Sparkles size={23} />
            </span>
            <span>
              <strong>A little help?</strong>
              <small>Your Build Assistant knows this step.</small>
            </span>
            <ArrowRight size={18} />
          </button>
          <div className="builder-tip">
            <BookOpen size={17} />
            <p>{step.hint}</p>
          </div>
          <p className="demo-note">
            Sample instructions for digital testing. Not yet validated for
            physical construction.
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
        <Sheet title="Find your place" onClose={() => setStepPicker(false)}>
          <p className="sheet-copy">
            Jump to a step in the demo walkthrough. Earlier steps are treated as
            complete when you skip ahead.
          </p>
          <div className="step-picker">
            {model.steps.map((s) => (
              <button
                className={number === s.number ? "selected" : ""}
                key={s.number}
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
                  <small>Bag {s.bag}</small>
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

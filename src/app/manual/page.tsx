"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, LoaderCircle, Printer } from "lucide-react";
import { projectModel } from "@/domain/project-model";
import { CATALOG, COLORS } from "@/domain/catalog";
import { useProjects } from "@/services/project-repository";
import { createStepRenderer } from "@/services/step-renderer";
import { PartCard } from "@/components/ui";
import { ProjectSelector } from "@/components/project-selector";
import type { HouseModel, Project } from "@/domain/types";

export default function ManualPage() {
  const { active } = useProjects();
  return <Manual key={active.id} active={active} />;
}

const directionNote = (d?: [number, number, number]) =>
  !d || d[1] === 1
    ? null
    : d[1] === -1
      ? "Press these parts on from below."
      : "Slide these parts in sideways, along the highlighted direction.";

function Manual({ active }: { active: Project }) {
  const model: HouseModel = projectModel(active);
  const [images, setImages] = useState<Record<number, string>>({});
  const [cover, setCover] = useState<string>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;
    (async () => {
      try {
        const renderer = await createStepRenderer(model);
        dispose = renderer.dispose;
        if (cancelled) return;
        setCover(renderer.render(model.steps.length, { finished: true }));
        // Render in small batches so the page stays responsive while pictures fill in.
        for (
          let start = 1;
          start <= model.steps.length && !cancelled;
          start += 4
        ) {
          const batch: Record<number, string> = {};
          for (let n = start; n < start + 4 && n <= model.steps.length; n++)
            batch[n] = renderer.render(n);
          setImages((old) => ({ ...old, ...batch }));
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [model]);
  const ready = Object.keys(images).length;
  const complete = ready === model.steps.length;
  return (
    <div id="page-content" className="manual-page">
      <div className="manual-toolbar">
        <Link href="/builder" className="text-link">
          <ArrowLeft size={16} /> Back to the builder
        </Link>
        <ProjectSelector />
        <button
          className="button button-primary"
          disabled={!complete}
          onClick={() => window.print()}
        >
          {complete ? (
            <>
              <Printer size={18} /> Print or save as PDF
            </>
          ) : (
            <>
              <LoaderCircle size={18} className="spin" /> Drawing steps {ready}/
              {model.steps.length}
            </>
          )}
        </button>
      </div>
      {failed && (
        <p className="studio-notice error" role="alert">
          The step pictures could not be drawn in this browser. The written
          steps and parts lists below are complete.
        </p>
      )}
      <section className="manual-cover">
        <div>
          <span className="eyebrow">Building instructions</span>
          <h1>{active.name}</h1>
          <p>
            {model.stats.pieceCount} pieces · {model.parts.length} different
            parts · {model.steps.length} steps · {model.bags.length} bags
          </p>
          <p className="manual-small">
            Every picture, step and parts list is generated from the same
            checked brick placements. New pieces in each step are shown in
            colour; pieces from earlier steps are faded.
          </p>
        </div>
        {cover && (
          <Image
            unoptimized
            width={520}
            height={420}
            src={cover}
            alt={`The finished ${active.name}`}
          />
        )}
      </section>
      {model.bags.map((bag) => (
        <section key={bag.number} className="manual-bag">
          <h2>
            Bag {bag.number} · {bag.name}
            <small>
              Steps {bag.firstStep}–{bag.lastStep}
            </small>
          </h2>
          <div className="manual-parts">
            {bag.parts.map((part) => (
              <PartCard key={part.key} part={part} />
            ))}
          </div>
          <ol className="manual-steps">
            {model.steps
              .filter((s) => s.bag === bag.number)
              .map((step) => (
                <li key={step.number} className="manual-step">
                  <div className="manual-step-head">
                    <b>{step.number}</b>
                    <span>{step.title}</span>
                  </div>
                  {images[step.number] ? (
                    <Image
                      unoptimized
                      width={520}
                      height={420}
                      src={images[step.number]}
                      alt={`Step ${step.number}`}
                    />
                  ) : (
                    <div
                      className="manual-step-placeholder"
                      aria-hidden="true"
                    />
                  )}
                  <ul className="manual-callout">
                    {step.parts.map((p) => (
                      <li key={p.key}>
                        <span
                          className="manual-swatch"
                          style={{ background: COLORS[p.color].hex }}
                        />
                        <b>{p.quantity}×</b> {COLORS[p.color].name}{" "}
                        {CATALOG[p.partId].name}
                      </li>
                    ))}
                  </ul>
                  {directionNote(step.insertionDirection) && (
                    <p className="manual-small">
                      {directionNote(step.insertionDirection)}
                    </p>
                  )}
                  {step.procedures?.map((note) => (
                    <p key={note} className="manual-small">
                      {note}
                    </p>
                  ))}
                </li>
              ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

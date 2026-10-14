"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, LoaderCircle, Check } from "lucide-react";
import { PageHeading } from "@/components/ui";
import { ModelThumbnail } from "@/components/model-thumbnail";
import { SizeSelector } from "@/components/settings";
import { BUILD_SIZES, DETAIL_LEVELS } from "@/domain/catalog";
import { createModel, MODEL_KINDS } from "@/domain/models";
import { reviewAssembly } from "@/services/assembly-validation";
import { projectRepository } from "@/services/project-repository";
import type { DetailLevel, BuildSize, ModelKind } from "@/domain/types";
export default function ModelsPage() {
  const router = useRouter(),
    [detail, setDetail] = useState<DetailLevel>("normal"),
    [size, setSize] = useState<BuildSize>("compact"),
    [busy, setBusy] = useState<ModelKind>(),
    [error, setError] = useState("");
  async function choose(kind: ModelKind) {
    if (busy) return;
    setBusy(kind);
    setError("");
    try {
      const settings = {
          modelKind: kind,
          detail,
          size,
          buildDifficulty: "medium" as const,
        },
        model = createModel(settings),
        report = await reviewAssembly(model);
      if (report.status !== "passed")
        throw Error(
          "This design needs review before building. Please reload and try again.",
        );
      projectRepository.save({
        id: crypto.randomUUID(),
        name: MODEL_KINDS.find((k) => k.id === kind)!.name,
        createdAt: new Date().toISOString(),
        settings,
        currentStep: 1,
        completed: false,
      });
      router.push("/review");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The assembly review couldn't finish. Please try again.",
      );
      setBusy(undefined);
    }
  }
  return (
    <div id="page-content" className="models-page">
      <PageHeading
        eyebrow="THE DEMO COLLECTION"
        title="A little world to build."
        description="Four connected designs, built from real part geometry. Pick a design, then make it your own."
      />
      <div className="collection-controls">
        <fieldset className="collection-detail">
          <legend>Model detail</legend>
          <div>
            {DETAIL_LEVELS.map((l) => (
              <button
                key={l.id}
                aria-pressed={detail === l.id}
                onClick={() => setDetail(l.id)}
                disabled={!!busy}
              >
                {l.name}
                {detail === l.id && <Check size={14} />}
              </button>
            ))}
          </div>
        </fieldset>
        <SizeSelector value={size} onChange={setSize} />
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="collection-grid">
        {MODEL_KINDS.map((kind, index) => {
          const model = createModel({ modelKind: kind.id, detail, size });
          return (
            <article
              className={`collection-card collection-${kind.id}`}
              key={kind.id}
            >
              <div className="collection-art">
                <span className="collection-number">0{index + 1}</span>
                <ModelThumbnail model={model} name={kind.name} />
                <span className="collection-detail-tag">
                  {DETAIL_LEVELS.find((l) => l.id === detail)!.name} ·{" "}
                  {BUILD_SIZES.find((l) => l.id === size)!.name}
                </span>
              </div>
              <div className="collection-card-body">
                <h2>{kind.name}</h2>
                <p>
                  {
                    kind.details[
                      DETAIL_LEVELS.findIndex((l) => l.id === detail)
                    ]
                  }
                </p>
                <small>
                  {model.stats.pieceCount} pieces · {model.steps.length} medium
                  steps
                </small>
                <button
                  className="button button-primary"
                  onClick={() => choose(kind.id)}
                  disabled={!!busy}
                >
                  {busy === kind.id ? (
                    <>
                      <LoaderCircle className="spin" size={17} /> Checking
                      assembly…
                    </>
                  ) : (
                    <>
                      Make this build <ArrowUpRight size={17} />
                    </>
                  )}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <p className="collection-note">
        These are deterministic demo designs. Photos are not analyzed yet.
        Digital checks cover recorded colors, reviewed connections, instruction
        accounting and clearance sampled at 0.4 mm. Physical builds are pending.
      </p>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { assetPath } from "@/lib/asset-path";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Camera,
  Images,
  Plus,
  ShieldCheck,
  Sparkles,
  X,
  LoaderCircle,
  Sun,
  ScanLine,
} from "lucide-react";
import { PageHeading } from "@/components/ui";
import {
  DetailSelector,
  SizeSelector,
  BuildDifficultySelector,
} from "@/components/settings";
import { DEFAULT_SETTINGS } from "@/domain/catalog";
import type { GenerationSettings } from "@/domain/types";
import { demoGeneration, GENERATION_STAGES } from "@/services/providers";
import { projectRepository } from "@/services/project-repository";

type Photo = { id: string; url: string; label: string; demo: boolean };
const demoPhotos: Photo[] = ["front", "side", "rear"].map((view, index) => ({
  id: `demo-${view}`,
  url: assetPath(`/demo/house-${view}.svg`),
  label: ["Front view", "Side view", "Rear view"][index],
  demo: true,
}));

export default function CreatePage() {
  const router = useRouter();
  const [stage, setStage] = useState<"upload" | "settings" | "generating">(
    "upload",
  );
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [name, setName] = useState("Compact House");
  const [settings, setSettings] = useState<GenerationSettings>({
    ...DEFAULT_SETTINGS,
  });
  const [error, setError] = useState("");
  const [generationStage, setGenerationStage] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const urls = useRef(new Set<string>());
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const allocated = urls.current;
    return () => {
      allocated.forEach(URL.revokeObjectURL);
      controller.current?.abort();
    };
  }, []);

  function addPhotos(files: FileList | null) {
    if (!files) return;
    setError("");
    const list = Array.from(files);
    if (
      list.some(
        (f) => !["image/jpeg", "image/png", "image/webp"].includes(f.type),
      )
    ) {
      setError("Please choose JPG, PNG, or WebP images.");
      return;
    }
    if (list.some((f) => f.size > 10 * 1024 * 1024)) {
      setError("One of those photos is over 10 MB. Choose a smaller image.");
      return;
    }
    if (photos.length + list.length > 10) {
      setError("You can add up to 10 photos. Remove one to make room.");
      return;
    }
    const next = list.map((file) => {
      const url = URL.createObjectURL(file);
      urls.current.add(url);
      return { id: crypto.randomUUID(), url, label: file.name, demo: false };
    });
    setPhotos((p) => [...p, ...next]);
    if (input.current) input.current.value = "";
  }
  function removePhoto(photo: Photo) {
    if (!photo.demo) {
      URL.revokeObjectURL(photo.url);
      urls.current.delete(photo.url);
    }
    setPhotos((p) => p.filter((item) => item.id !== photo.id));
  }
  async function generate() {
    if (controller.current && !controller.current.signal.aborted) return;
    const abort = new AbortController();
    controller.current = abort;
    setError("");
    setStage("generating");
    setGenerationStage(0);
    try {
      await demoGeneration.generate(settings, setGenerationStage, abort.signal);
      if (abort.signal.aborted) return;
      projectRepository.save({
        id: crypto.randomUUID(),
        name: name.trim() || "Compact House",
        settings: { ...settings },
        createdAt: new Date().toISOString(),
        currentStep: 1,
        completed: false,
      });
      router.push("/review?new=1");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError("We couldn’t prepare your demo. Please try again.");
      setStage("settings");
      controller.current = null;
    }
  }

  if (stage === "generating")
    return (
      <div id="page-content" className="generation-page">
        <span className="eyebrow">A memory in the making</span>
        <div className="building-animation" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <h1>
          A little home.
          <br />
          <span>A whole lot of heart.</span>
        </h1>
        <p>Preparing your {name.trim() || "Compact House"} demo…</p>
        <div className="generation-stages" role="status" aria-live="polite">
          {GENERATION_STAGES.map((label, index) => (
            <div
              key={label}
              className={
                index < generationStage
                  ? "done"
                  : index === generationStage
                    ? "active"
                    : ""
              }
            >
              <span>
                {index < generationStage ? (
                  <Check size={15} />
                ) : index === generationStage ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <span className="stage-dot" />
                )}
              </span>
              {label}
            </div>
          ))}
        </div>
        <div className="generation-track">
          <span
            style={{
              width: `${((generationStage + 1) / GENERATION_STAGES.length) * 100}%`,
            }}
          />
        </div>
        <p className="demo-note">
          Demo generation · Your photos are not analyzed.
        </p>
        <button
          className="text-link"
          onClick={() => {
            controller.current?.abort();
            setStage("settings");
          }}
        >
          Cancel and go back
        </button>
      </div>
    );

  return (
    <div id="page-content" className="create-page">
      <PageHeading
        eyebrow="Let’s make something personal"
        title={
          stage === "upload"
            ? "Every build starts\nwith a little inspiration."
            : "Your house. Your kind of build."
        }
        description={
          stage === "upload"
            ? "Choose a few photos of a place you love, or try our little house."
            : "Keep it simple or enjoy the details. There’s no wrong place to start."
        }
        back="/"
      />
      <div className="flow-stepper">
        <span className={stage === "upload" ? "active" : "done"}>
          <i>{stage === "settings" ? <Check size={13} /> : "1"}</i>Photos
        </span>
        <div />
        <span className={stage === "settings" ? "active" : ""}>
          <i>2</i>Your build
        </span>
        <div />
        <span>
          <i>3</i>Preview
        </span>
      </div>
      {stage === "upload" ? (
        <div className="create-layout">
          <div>
            <div className="panel upload-panel">
              <div className="panel-title">
                <h2>Your inspiration</h2>
                <span>{photos.length}/10 photos</span>
              </div>
              <input
                className="visually-hidden"
                ref={input}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                aria-label="Upload photos"
                onChange={(e) => addPhotos(e.target.files)}
              />
              <button
                className="upload-dropzone"
                onClick={() => input.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  addPhotos(e.dataTransfer.files);
                }}
              >
                <span className="upload-icon">
                  <Camera size={27} />
                </span>
                <strong>Add your photos</strong>
                <span>Tap to choose, or drop them here</span>
                <small>JPG, PNG or WebP · Up to 10 MB each</small>
              </button>
              {photos.length > 0 && (
                <div className="photo-grid">
                  {photos.map((photo) => (
                    <div className="photo-tile" key={photo.id}>
                      {/* Local blob URLs are intentionally not sent to an image optimization service. */}
                      <Image
                        width={400}
                        height={400}
                        unoptimized
                        src={photo.url}
                        alt={
                          photo.demo
                            ? `Demo house ${photo.label.toLowerCase()}`
                            : photo.label
                        }
                      />
                      <span>{photo.label}</span>
                      <button
                        aria-label={`Remove ${photo.label}`}
                        onClick={() => removePhoto(photo)}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="demo-photo-action">
                <div>
                  <Images size={20} />
                  <span>Just exploring?</span>
                </div>
                <button
                  className="text-link"
                  disabled={photos.some((p) => p.demo)}
                  onClick={() => {
                    if (photos.length + 3 > 10) {
                      setError(
                        "Remove a photo before adding the three demo views.",
                      );
                      return;
                    }
                    setPhotos((p) => [...p, ...demoPhotos]);
                    setError("");
                  }}
                >
                  Use demo photos <Plus size={15} />
                </button>
              </div>
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="privacy-note">
              <ShieldCheck size={17} />
              <p>
                Your photos stay in this browser session.
                <br />
                Nothing is uploaded or saved.
              </p>
            </div>
            <div className="flow-actions">
              <span>
                {photos.length < 3
                  ? `Add ${3 - photos.length} more ${3 - photos.length === 1 ? "photo" : "photos"} to continue`
                  : "Looking good. Let’s make it yours."}
              </span>
              <button
                className="button button-primary"
                disabled={photos.length < 3}
                onClick={() => setStage("settings")}
              >
                Continue <ArrowRight size={17} />
              </button>
            </div>
          </div>
          <aside className="photo-guide">
            <span className="eyebrow">A better starting point</span>
            <h2>
              A few angles.
              <br />
              The whole story.
            </h2>
            <Image
              width={400}
              height={400}
              unoptimized
              src={assetPath("/demo/house-front.svg")}
              alt="Illustrated demo house viewed from the front"
            />
            <div>
              <Sun size={19} />
              <p>
                <strong>Find a little daylight</strong>
                <span>Clear, well-lit photos work best.</span>
              </p>
            </div>
            <div>
              <Camera size={19} />
              <p>
                <strong>Walk around your object</strong>
                <span>Try front, side, and rear views.</span>
              </p>
            </div>
            <div>
              <ScanLine size={19} />
              <p>
                <strong>Keep the whole thing in frame</strong>
                <span>A clean background helps, too.</span>
              </p>
            </div>
            <span className="demo-note">
              This prototype always creates the house demo, including when you
              choose your own photos.
            </span>
          </aside>
        </div>
      ) : (
        <div className="settings-layout">
          <div className="panel settings-panel">
            <label className="field-label" htmlFor="build-name">
              Give your build a name
            </label>
            <input
              id="build-name"
              className="text-input"
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My favorite little place"
            />
            <DetailSelector
              value={settings.detail}
              onChange={(detail) => setSettings((s) => ({ ...s, detail }))}
            />
            <SizeSelector
              value={settings.size}
              onChange={(size) => setSettings((s) => ({ ...s, size }))}
            />
            <BuildDifficultySelector
              settings={settings}
              onChange={(buildDifficulty) =>
                setSettings((s) => ({ ...s, buildDifficulty }))
              }
            />
            <div className="settings-note">
              <Sparkles size={18} />
              <p>
                Detail and size shape your house. Building difficulty only
                changes the instructions. You can change your pace anytime.
              </p>
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="flow-actions">
              <button className="text-link" onClick={() => setStage("upload")}>
                <ArrowLeft size={16} /> Photos
              </button>
              <button
                className="button button-primary"
                disabled={!name.trim()}
                onClick={generate}
              >
                Create my preview <ArrowRight size={17} />
              </button>
            </div>
          </div>
          <aside className="settings-aside">
            <span className="tag">Your inspiration</span>
            <div className="inspiration-stack">
              {photos.slice(0, 3).map((p, i) => (
                <div
                  key={p.id}
                  style={{ transform: `rotate(${(i - 1) * 7}deg)` }}
                >
                  <Image
                    width={400}
                    height={400}
                    unoptimized
                    src={p.url}
                    alt={p.label}
                  />
                </div>
              ))}
            </div>
            <p>
              From a familiar place
              <br />
              to a little keepsake.
            </p>
            <small>Demo generation · No payment needed</small>
          </aside>
        </div>
      )}
    </div>
  );
}

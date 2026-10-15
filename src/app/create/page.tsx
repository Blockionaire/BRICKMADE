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
  Blocks,
} from "lucide-react";
import { PageHeading } from "@/components/ui";
import {
  DetailSelector,
  ModelKindSelector,
  SizeSelector,
  BuildDifficultySelector,
} from "@/components/settings";
import { DEFAULT_SETTINGS } from "@/domain/catalog";
import { modelInfo, MODEL_KINDS } from "@/domain/models";
import type { GenerationSettings } from "@/domain/types";
import { demoGeneration, GENERATION_STAGES } from "@/services/providers";
import { projectRepository } from "@/services/project-repository";
import { HouseBriefEditor } from "@/components/house-brief-editor";
import { AiConnectionPanel } from "@/components/ai-connection";
import { HOUSE_PRESETS, type HouseBrief } from "../../../shared/house-brief";
import { houseGeneration, HOUSE_GENERATION_STAGES } from "@/services/providers";
import {
  analyzePhotos,
  readAiConnection,
} from "@/services/photo-interpretation";

type Photo = { id: string; url: string; label: string; demo: boolean };
const demoPhotos: Photo[] = ["front", "side", "rear"].map((view, index) => ({
  id: `demo-${view}`,
  url: assetPath(`/demo/house-${view}.svg`),
  label: ["Front view", "Side view", "Rear view"][index],
  demo: true,
}));

export default function CreatePage() {
  const router = useRouter();
  const [stage, setStage] = useState<
    "upload" | "settings" | "generating" | "analyzing"
  >("upload");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const realPhotoCount = photos.filter((photo) => !photo.demo).length;
  const [name, setName] = useState("Compact House");
  const [settings, setSettings] = useState<GenerationSettings>({
    ...DEFAULT_SETTINGS,
  });
  const [error, setError] = useState("");
  const [generationStage, setGenerationStage] = useState(0);
  const [photoConsent, setPhotoConsent] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const urls = useRef(new Set<string>());
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const allocated = urls.current;
    return () => {
      allocated.forEach(URL.revokeObjectURL);
      controller.current?.abort();
      controller.current = null;
    };
  }, []);

  function addPhotos(files: FileList | null) {
    if (!files) return;
    setError("");
    setPhotoConsent(false);
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
    setPhotoConsent(false);
    if (!photo.demo) {
      URL.revokeObjectURL(photo.url);
      urls.current.delete(photo.url);
    }
    setPhotos((p) => p.filter((item) => item.id !== photo.id));
  }
  function editBrief(brief: HouseBrief) {
    setSettings((s) => ({
      ...s,
      modelKind: "house",
      houseBrief: brief,
      designSource: s.designSource ?? "manual",
    }));
  }
  function startHouseStudio() {
    setSettings((s) => ({
      ...s,
      modelKind: "house",
      houseBrief: s.houseBrief ?? HOUSE_PRESETS[0].brief,
      designSource: s.designSource ?? "manual",
    }));
    if (name === "Compact House") setName("My little house");
    setStage("settings");
    setError("");
  }
  async function interpret() {
    if (controller.current && !controller.current.signal.aborted) return;
    const connection = readAiConnection();
    if (!connection) {
      setError(
        "Connect your private AI service below before interpreting photos.",
      );
      return;
    }
    const real = photos.filter((p) => !p.demo).slice(0, 3);
    if (!photoConsent || !real.length) return;
    const abort = new AbortController();
    controller.current = abort;
    setError("");
    setStage("analyzing");
    const timer = setTimeout(() => abort.abort(), 75000);
    try {
      const brief = await analyzePhotos(
        real.map((p) => p.url),
        connection,
        photoConsent,
        abort.signal,
      );
      if (abort.signal.aborted) return;
      setSettings((s) => ({
        ...s,
        modelKind: "house",
        houseBrief: brief,
        designSource: "openai",
      }));
      if (["Compact House", "My little house"].includes(name))
        setName(brief.title);
      setPhotoConsent(false);
      setStage("settings");
      controller.current = null;
    } catch (e) {
      if (controller.current !== abort) return;
      if (abort.signal.aborted) {
        setError(
          "Photo interpretation timed out. Your photos have not been saved.",
        );
        setPhotoConsent(false);
        setStage("settings");
      } else {
        setError(
          e instanceof Error
            ? e.message
            : "The photos could not be interpreted.",
        );
        setStage("settings");
      }
      controller.current = null;
    } finally {
      clearTimeout(timer);
    }
  }
  async function generate() {
    if (controller.current && !controller.current.signal.aborted) return;
    const abort = new AbortController();
    controller.current = abort;
    setError("");
    setStage("generating");
    setGenerationStage(0);
    try {
      const model = await (
        settings.houseBrief ? houseGeneration : demoGeneration
      ).generate(settings, setGenerationStage, abort.signal);
      if (abort.signal.aborted) return;
      projectRepository.save({
        id: crypto.randomUUID(),
        name: name.trim() || modelInfo(settings).name,
        settings: { ...model.settings },
        createdAt: new Date().toISOString(),
        currentStep: 1,
        completed: false,
      });
      router.push("/review?new=1");
    } catch (e) {
      if (
        abort.signal.aborted ||
        controller.current !== abort ||
        (e instanceof DOMException && e.name === "AbortError")
      )
        return;
      setError(
        settings.houseBrief && e instanceof Error
          ? e.message
          : "We couldn’t prepare your demo. Please try again.",
      );
      setStage("settings");
      controller.current = null;
    }
  }

  const generationStages = settings.houseBrief
    ? HOUSE_GENERATION_STAGES
    : GENERATION_STAGES;
  if (stage === "analyzing")
    return (
      <div id="page-content" className="generation-page">
        <span className="eyebrow">A first look at your place</span>
        <div className="photo-analysis-orbit" aria-hidden="true">
          <ScanLine size={48} />
        </div>
        <h1>
          Finding the shape
          <br />
          <span>of your little world.</span>
        </h1>
        <p role="status">Resizing and interpreting up to three photos…</p>
        <p className="demo-note">
          You’ll review an editable description before any bricks are generated.
          Images are processed by your connected service and OpenAI; BrickMade
          does not store them.
        </p>
        <button
          className="button button-secondary"
          onClick={() => {
            controller.current?.abort();
            controller.current = null;
            setStage("settings");
            setPhotoConsent(false);
          }}
        >
          Cancel interpretation
        </button>
      </div>
    );

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
          A little world.
          <br />
          <span>A whole lot of heart.</span>
        </h1>
        <p>
          Preparing your {name.trim() || modelInfo(settings).name}{" "}
          {settings.houseBrief ? "design" : "demo"}…
        </p>
        <div className="generation-stages" role="status" aria-live="polite">
          {generationStages.map((label, index) => (
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
              width: `${((generationStage + 1) / generationStages.length) * 100}%`,
            }}
          />
        </div>
        <p className="demo-note">
          {settings.houseBrief
            ? "Description-driven prototype · Independent assembly checks · Physical fit untested"
            : "Demo generation · Your photos are not analyzed."}
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
            : "Your world. Your kind of build."
        }
        description={
          stage === "upload"
            ? "Upload your own house photos for AI interpretation, or explore a demo build."
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
                Nothing is uploaded unless you choose photo interpretation and
                confirm sharing.
              </p>
            </div>
            <div className="flow-actions">
              <span>
                {realPhotoCount > 0
                  ? "Next: interpret your house photos. No demo selection needed."
                  : photos.length < 3
                    ? "Add 1–3 house photos, or use the demo photos."
                    : "Explore the demo collection."}
              </span>
              <button
                className="button button-primary"
                disabled={!realPhotoCount && photos.length < 3}
                onClick={() =>
                  realPhotoCount ? startHouseStudio() : setStage("settings")
                }
              >
                Continue <ArrowRight size={17} />
              </button>
            </div>
          </div>
          <aside className="photo-guide">
            <div className="house-studio-entry">
              <span className="tag">New · House studio</span>
              <h2>Start with a shape.</h2>
              <p>
                Design a house now, with editable proportions and features. Add
                photo interpretation when your private service is connected.
              </p>
              <button
                className="button button-secondary"
                onClick={startHouseStudio}
              >
                Design a house <ArrowRight size={16} />
              </button>
            </div>
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
              Demo generation keeps photos local. The house studio offers
              optional photo interpretation with explicit sharing consent.
            </span>
          </aside>
        </div>
      ) : (
        <div className="settings-layout">
          <div
            className={`panel settings-panel ${settings.houseBrief ? "house-studio-panel" : ""}`}
          >
            <div
              className="generation-mode-switch"
              aria-label="Generation mode"
            >
              <button
                aria-pressed={!settings.houseBrief}
                onClick={() => {
                  const { houseBrief, designSource, ...rest } = settings;
                  void houseBrief;
                  void designSource;
                  setSettings(rest);
                  setError("");
                  setPhotoConsent(false);
                }}
              >
                Demo collection
              </button>
              <button
                aria-pressed={!!settings.houseBrief}
                onClick={startHouseStudio}
              >
                House studio <Sparkles size={15} />
              </button>
            </div>
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
            {settings.houseBrief ? (
              <>
                {settings.designSource === "openai" && (
                  <p className="house-uncertainties" role="status">
                    Photo interpretation · {settings.houseBrief.confidence}{" "}
                    confidence. Check and correct the description before
                    generating.
                  </p>
                )}
                <section
                  className="photo-interpretation-panel"
                  aria-label="Photo interpretation"
                >
                  <div className="house-section-title">
                    <ScanLine size={20} />
                    <h2>Interpret your house photos</h2>
                    <span className="tag">Optional AI</span>
                  </div>
                  <p>
                    Start from your own photos without choosing a demo. AI
                    proposes an editable house description; you review it before
                    generating the brick build. This prototype supports simple
                    rectangular houses, with approximate proportions and
                    details.
                  </p>
                  <p>
                    {photos.some((p) => !p.demo)
                      ? `Interpret the first ${Math.min(3, photos.filter((p) => !p.demo).length)} real photos, then check and edit the description below.`
                      : "Add real house photos to use interpretation. You can generate this description without photos or an API key."}
                  </p>
                  {!realPhotoCount && (
                    <button
                      className="button button-secondary"
                      onClick={() => {
                        setStage("upload");
                        setPhotoConsent(false);
                      }}
                    >
                      <Camera size={17} /> Add my house photos
                    </button>
                  )}
                  <details>
                    <summary>Connect your private photo service</summary>
                    <AiConnectionPanel
                      onChange={() => setPhotoConsent(false)}
                    />
                  </details>
                  <label className="photo-consent">
                    <input
                      type="checkbox"
                      checked={photoConsent}
                      disabled={!photos.some((p) => !p.demo)}
                      onChange={(e) => setPhotoConsent(e.target.checked)}
                    />
                    <span>
                      Send up to three resized photos to my connected private
                      service and OpenAI for interpretation. BrickMade does not
                      store the images; OpenAI’s applicable data retention
                      policy still applies.
                    </span>
                  </label>
                  <button
                    className="button button-secondary"
                    onClick={interpret}
                    disabled={!photoConsent || !photos.some((p) => !p.demo)}
                  >
                    <ScanLine size={17} />
                    Interpret my photos
                  </button>
                </section>
                <HouseBriefEditor
                  brief={settings.houseBrief}
                  onChange={editBrief}
                />
              </>
            ) : (
              <ModelKindSelector
                value={settings.modelKind ?? "house"}
                onChange={(modelKind) => {
                  if (name === modelInfo(settings).name)
                    setName(MODEL_KINDS.find((k) => k.id === modelKind)!.name);
                  setSettings((s) => ({ ...s, modelKind }));
                }}
              />
            )}
            <DetailSelector
              settings={settings}
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
                Detail and size shape your selected{" "}
                {settings.houseBrief ? "description" : "model"}. Building
                difficulty only changes the instructions. You can change your
                pace anytime.
              </p>
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="flow-actions">
              <button
                className="text-link"
                onClick={() => {
                  setStage("upload");
                  setPhotoConsent(false);
                }}
              >
                <ArrowLeft size={16} /> Photos
              </button>
              <button
                className="button button-primary"
                disabled={!name.trim()}
                onClick={generate}
              >
                {settings.houseBrief
                  ? "Generate my house"
                  : "Create my preview"}{" "}
                <ArrowRight size={17} />
              </button>
            </div>
          </div>
          <aside className="settings-aside">
            <span className="tag">
              {settings.houseBrief
                ? "Description-driven design"
                : "Your inspiration"}
            </span>
            {!photos.length && settings.houseBrief ? (
              <div className="house-description-aside">
                <Blocks size={44} />
                <h2>
                  Your description.
                  <br />A real brick build.
                </h2>
                <p>
                  The compiler chooses supported pieces, places each one, then
                  checks the assembly before saving.
                </p>
                <span>Shape → Parts → Connections → Instructions</span>
              </div>
            ) : (
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
            )}
            <p>
              From a familiar place
              <br />
              to a little keepsake.
            </p>
            <small>
              {settings.houseBrief
                ? "Real parts · Checked assembly · Private prototype"
                : "Demo generation · No payment needed"}
            </small>
          </aside>
        </div>
      )}
    </div>
  );
}

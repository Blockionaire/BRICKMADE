"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  House,
  Car,
  Cat,
  Flower2,
  WandSparkles,
  ArrowRight,
  ArrowLeft,
  Camera,
  Plus,
  X,
  Sparkles,
  LoaderCircle,
  ShieldCheck,
  Check,
  TriangleAlert,
  Layers,
} from "lucide-react";
import { PageHeading } from "@/components/ui";
import {
  STUDIO_CATEGORIES,
  DETAIL_LABELS,
  EXPERIENCE_LABELS,
  DEFAULT_STUDIO_OPTIONS,
  type StudioCategory,
  type StudioOptions,
  type StudioJob,
} from "../../../shared/studio";
import {
  ensureStudioSession,
  studioRequest,
  preparedStudioPhoto,
  uploadStudioPhoto,
  recordStudioJob,
  readPendingSubmission,
  storePendingSubmission,
  StudioClientError,
  type PendingStudioSubmission,
} from "@/services/studio-client";
type Photo = { id: string; url: string; name: string };
const icons = {
  house: House,
  car: Car,
  animal: Cat,
  flower: Flower2,
  free: WandSparkles,
};
export function CreateStudio() {
  const router = useRouter(),
    input = useRef<HTMLInputElement>(null),
    uploadSection = useRef<HTMLElement>(null),
    notice = useRef<HTMLDivElement>(null),
    active = useRef<AbortController | null>(null),
    allocated = useRef(new Set<string>()),
    pending = useRef<PendingStudioSubmission | null>(null);
  const [category, setCategory] = useState<StudioCategory | null>(null),
    [photos, setPhotos] = useState<Photo[]>([]),
    [options, setOptions] = useState<StudioOptions>(DEFAULT_STUDIO_OPTIONS),
    [configured, setConfigured] = useState<boolean | null>(null),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [reference, setReference] = useState("");
  function fail(e: unknown) {
    setError(
      e instanceof Error
        ? e.message
        : "This step could not finish. Please try again.",
    );
    setReference(e instanceof StudioClientError ? e.requestId || "" : "");
  }
  useEffect(() => {
    const abort = new AbortController(),
      urls = allocated.current;
    studioRequest<{ configured: boolean }>("config", { signal: abort.signal })
      .then((c) => setConfigured(c.configured))
      .catch((e) => {
        if (!abort.signal.aborted) {
          setConfigured(false);
          fail(e);
        }
      });
    return () => {
      abort.abort();
      active.current?.abort();
      urls.forEach(URL.revokeObjectURL);
    };
  }, []);
  useEffect(() => {
    if (error) {
      notice.current?.focus({ preventScroll: true });
      notice.current?.scrollIntoView({ block: "center" });
    }
  }, [error]);
  useEffect(() => {
    const saved = readPendingSubmission();
    if (!saved) return;
    const abort = new AbortController();
    active.current = abort;
    pending.current = saved;
    queueMicrotask(() => {
      if (!abort.signal.aborted) setBusy("Recovering your submission…");
    });
    ensureStudioSession(abort.signal)
      .then(async (s) => {
        if (s.user.id !== saved.ownerId) {
          storePendingSubmission(null);
          return;
        }
        const result = await studioRequest<{ job: StudioJob }>(
          `projects/${saved.projectId}/generate`,
          {
            method: "POST",
            signal: abort.signal,
            body: {
              assetIds: saved.assetIds,
              options: saved.options,
              requestKey: saved.requestKey,
              consent: true,
            },
          },
        );
        if (!abort.signal.aborted) {
          recordStudioJob(result.job);
          storePendingSubmission(null);
          router.replace(`/design?job=${result.job.id}`);
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) {
          storePendingSubmission(null);
          fail(e);
        }
      })
      .finally(() => {
        if (active.current === abort) {
          active.current = null;
          setBusy("");
        }
      });
    return () => abort.abort();
  }, [router]);
  function add(files: FileList | null) {
    if (!files || busy) return;
    const list = Array.from(files);
    setError("");
    if (
      list.some(
        (f) => !["image/jpeg", "image/png", "image/webp"].includes(f.type),
      )
    ) {
      setError("Choose JPG, PNG or WebP photos.");
      return;
    }
    if (list.some((f) => f.size > 10 * 1024 * 1024)) {
      setError("Choose photos smaller than 10 MB each.");
      return;
    }
    if (photos.length + list.length > 3) {
      setError("Choose up to three photos. Different angles work best.");
      return;
    }
    setPhotos((p) => [
      ...p,
      ...list.map((file) => {
        const url = URL.createObjectURL(file);
        allocated.current.add(url);
        return { id: crypto.randomUUID(), url, name: file.name };
      }),
    ]);
    pending.current = null;
    storePendingSubmission(null);
    if (input.current) input.current.value = "";
  }
  async function generate() {
    if (active.current || !category || !photos.length) return;
    const abort = new AbortController();
    active.current = abort;
    setError("");
    setReference("");
    setBusy("Preparing your photos…");
    try {
      const identity = await ensureStudioSession(abort.signal),
        signature = JSON.stringify({
          photos: photos.map((p) => p.id),
          options,
        });
      let submission = pending.current;
      if (
        !submission ||
        submission.signature !== signature ||
        submission.ownerId !== identity.user.id
      ) {
        const prepared = [];
        for (const photo of photos)
          prepared.push(await preparedStudioPhoto(photo.url, abort.signal));
        setBusy("Making a private place for your photos…");
        const draft = await studioRequest<{
          projectId: string;
          uploads: { id: string; url: string }[];
        }>("projects", {
          method: "POST",
          signal: abort.signal,
          body: {
            category,
            photos: prepared.map((p) => ({
              bytes: p.bytes.length,
              sha256: p.sha256,
            })),
          },
        });
        setBusy("Uploading your private photos…");
        for (const [i, ticket] of draft.uploads.entries())
          await uploadStudioPhoto(ticket.url, prepared[i].bytes, abort.signal);
        submission = {
          ownerId: identity.user.id,
          projectId: draft.projectId,
          assetIds: draft.uploads.map((t) => t.id),
          requestKey: crypto.randomUUID(),
          options: { ...options, category },
          signature,
        };
        pending.current = submission;
        storePendingSubmission(submission);
      }
      setBusy("Starting your build…");
      const result = await studioRequest<{ job: StudioJob }>(
        `projects/${submission.projectId}/generate`,
        {
          method: "POST",
          signal: abort.signal,
          body: {
            assetIds: submission.assetIds,
            options: submission.options,
            requestKey: submission.requestKey,
            consent: true,
          },
        },
      );
      abort.signal.throwIfAborted();
      recordStudioJob(result.job);
      storePendingSubmission(null);
      router.push(`/design?job=${result.job.id}`);
    } catch (e) {
      if (!abort.signal.aborted) fail(e);
    } finally {
      if (active.current === abort) {
        active.current = null;
        setBusy("");
      }
    }
  }
  return (
    <div id="page-content" className="studio-page">
      <PageHeading
        eyebrow="A little world, made yours"
        title={"From a photo.\nTo your next favourite build."}
        description="Pick a subject. Add your photos. We’ll handle the little pieces."
        back="/"
      />
      <div className="studio-flow" aria-label="Creation progress">
        <span className={!category ? "active" : "done"}>
          01 <b>Choose a category</b>
        </span>
        <i />
        <span className={category ? "active" : ""}>
          02 <b>Add your photos</b>
        </span>
        <i />
        <span>
          03 <b>Meet your build</b>
        </span>
      </div>
      {error && (
        <div
          ref={notice}
          tabIndex={-1}
          role="alert"
          className="studio-notice error"
        >
          <TriangleAlert size={20} />
          <div>
            <strong>This step needs another try</strong>
            <p>{error}</p>
            {reference && <small>Support reference: {reference}</small>}
          </div>
        </div>
      )}
      <section aria-label="Choose a category" className="studio-category-grid">
        {STUDIO_CATEGORIES.map((c) => {
          const Icon = icons[c.id];
          return (
            <button
              key={c.id}
              className={`studio-category ${category === c.id ? "selected" : ""}`}
              aria-pressed={category === c.id}
              disabled={!c.available || !!busy}
              onClick={() => {
                setCategory(c.id);
                setOptions((o) => ({ ...o, category: c.id }));
                setTimeout(
                  () =>
                    uploadSection.current?.scrollIntoView({
                      block: "start",
                      behavior: matchMedia("(prefers-reduced-motion: reduce)")
                        .matches
                        ? "instant"
                        : "smooth",
                    }),
                  50,
                );
              }}
            >
              <span className={`category-art art-${c.id}`}>
                <Icon size={40} />
              </span>
              <span className="category-name">
                {c.name}
                {category === c.id && <Check size={17} />}
              </span>
              <span className="category-description">{c.description}</span>
              {!c.available && (
                <span className="category-soon">In the making</span>
              )}
            </button>
          );
        })}
      </section>
      {category && (
        <section
          className="studio-upload-layout"
          ref={uploadSection}
          aria-label="Your subject photos"
        >
          <div className="panel studio-upload-panel">
            <div className="panel-title">
              <div>
                <span className="eyebrow">The starting point</span>
                <h2>Show us what makes it yours.</h2>
              </div>
              <span className="tag">{photos.length}/3 photos</span>
            </div>
            <input
              type="file"
              className="visually-hidden"
              ref={input}
              accept="image/jpeg,image/png,image/webp"
              multiple
              aria-label="Upload your photos"
              onChange={(e) => add(e.target.files)}
              disabled={!!busy}
            />
            <button
              className="studio-dropzone"
              disabled={!!busy}
              onClick={() => input.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                add(e.dataTransfer.files);
              }}
            >
              <span>
                <Camera size={30} />
                <Plus size={14} />
              </span>
              <strong>
                {photos.length ? "Add another angle" : "Add your photos"}
              </strong>
              <p>One photo can start a build. A few angles tell us more.</p>
              <small>JPG, PNG or WebP · Up to 10 MB each</small>
            </button>
            {!!photos.length && (
              <div className="studio-photo-grid">
                {photos.map((p) => (
                  <div key={p.id}>
                    <Image
                      width={240}
                      height={180}
                      unoptimized
                      src={p.url}
                      alt={p.name}
                    />
                    <button
                      aria-label={`Remove ${p.name}`}
                      disabled={!!busy}
                      onClick={() => {
                        URL.revokeObjectURL(p.url);
                        allocated.current.delete(p.url);
                        setPhotos((list) => list.filter((v) => v.id !== p.id));
                        pending.current = null;
                        storePendingSubmission(null);
                      }}
                    >
                      <X size={15} />
                    </button>
                    <span>{p.name}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="studio-detail-control">
              <span>
                <Sparkles size={17} /> Make it your kind of build
              </span>
              <div role="group" aria-label="Design quality">
                {(["easy", "normal", "hard"] as const).map((d) => (
                  <button
                    key={d}
                    aria-pressed={options.detail === d}
                    disabled={!!busy}
                    onClick={() => setOptions((o) => ({ ...o, detail: d }))}
                  >
                    <b>{DETAIL_LABELS[d].name}</b>
                    <small>{DETAIL_LABELS[d].hint}</small>
                  </button>
                ))}
              </div>
              <span>
                <Layers size={17} /> Your building experience
              </span>
              <div role="group" aria-label="Building experience">
                {(["easy", "medium", "hard"] as const).map((pace) => (
                  <button
                    key={pace}
                    aria-pressed={options.pace === pace}
                    disabled={!!busy}
                    onClick={() => setOptions((o) => ({ ...o, pace }))}
                  >
                    <b>{EXPERIENCE_LABELS[pace].name}</b>
                    <small>{EXPERIENCE_LABELS[pace].hint}</small>
                  </button>
                ))}
              </div>
              <p>
                You can change design quality, size and building experience
                after your design is ready.
              </p>
            </div>
            {configured === false && (
              <div className="studio-notice">
                <ShieldCheck size={20} />
                <div>
                  <p>
                    {process.env.NEXT_PUBLIC_BASE_PATH
                      ? "Photo generation runs in our private cloud app. Open the cloud studio to create a saved build from your photos."
                      : "The private cloud studio is being connected. You can explore the demo builds while it’s getting ready."}
                  </p>
                  {process.env.NEXT_PUBLIC_BASE_PATH && (
                    <a
                      className="text-link"
                      href="https://brickmade.vercel.app/create"
                    >
                      Open the cloud studio <ArrowRight size={15} />
                    </a>
                  )}
                </div>
              </div>
            )}
            <div className="studio-submit">
              <p>
                <ShieldCheck size={17} /> Generate sends resized photos for AI
                processing. Photos stay private and expire after 24 hours and
                are scheduled for automatic deletion; your design is saved. The
                AI provider’s retention policy also applies.
              </p>
              <button
                className="button button-primary"
                disabled={!!busy || !photos.length || configured !== true}
                onClick={generate}
              >
                {busy ? (
                  <>
                    <LoaderCircle className="spin" size={18} />
                    {busy}
                  </>
                ) : (
                  <>
                    Generate my build <ArrowRight size={18} />
                  </>
                )}
              </button>
              {busy && (
                <button
                  className="text-link"
                  onClick={() => {
                    active.current?.abort();
                    active.current = null;
                    setBusy("");
                  }}
                >
                  Cancel submission
                </button>
              )}
            </div>
          </div>
          <aside className="studio-guide">
            {(() => {
              const c = STUDIO_CATEGORIES.find((c) => c.id === category)!;
              const Icon = icons[c.id];
              return (
                <>
                  <span className="studio-guide-icon">
                    <Icon size={45} />
                  </span>
                  <span className="tag">{c.guide.tag}</span>
                  <h2>
                    {c.guide.headline.split("\n").map((line, i) => (
                      <span key={i}>
                        {i > 0 && <br />}
                        {line}
                      </span>
                    ))}
                  </h2>
                  <p>{c.guide.looksFor}</p>
                  {c.guide.tips.map((tip) => (
                    <div key={tip}>
                      <Camera size={17} />
                      <span>{tip}</span>
                    </div>
                  ))}
                  <div>
                    <Check size={17} />
                    <span>
                      Real parts, exact instructions, checked digitally
                    </span>
                  </div>
                  <small>
                    Models are carved from AI-drawn reference views of your
                    photos at brick scale. Hidden sides are estimated; physical
                    strength remains unverified.
                  </small>
                </>
              );
            })()}
          </aside>
        </section>
      )}
      <div className="studio-demo-link">
        <span>Just looking around?</span>
        <Link href="/create/demo">
          Explore demo builds <ArrowRight size={15} />
        </Link>
      </div>
      {category && (
        <button
          className="text-link"
          disabled={!!busy}
          onClick={() => setCategory(null)}
        >
          <ArrowLeft size={16} /> Back to categories
        </button>
      )}
    </div>
  );
}

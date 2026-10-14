"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Eye,
  Layers,
  Link2,
  RotateCw,
  Search,
  Shapes,
  Unlink,
} from "lucide-react";
import { PageHeading, Sheet } from "@/components/ui";
import { BUILDER_PARTS, PART_PROFILES } from "@/domain/parts/profiles";
import {
  compatibleFamily,
  findMates,
  IDENTITY,
  snapPose,
  worldConnectors,
} from "@/domain/parts/connections";
import type { BuilderPart, PartPose } from "@/domain/parts/types";
import { assetPath } from "@/lib/asset-path";
const Canvas = dynamic(() => import("@/components/connection-canvas"), {
  ssr: false,
  loading: () => (
    <div className="connection-stage connection-load-state">
      Opening the connection studio…
    </div>
  ),
});
const scenarios = [
  { name: "Stack it", target: "3020", moving: "3003", kind: "stud", index: 0 },
  {
    name: "Build sideways",
    target: "4070",
    moving: "3024",
    kind: "stud",
    index: 1,
  },
  {
    name: "Technic fit",
    target: "3700",
    moving: "2780",
    kind: "pin-hole",
    index: 0,
  },
  {
    name: "Curved finish",
    target: "3020",
    moving: "11477",
    kind: "stud",
    index: 0,
  },
  {
    name: "A little flower",
    target: "3005",
    moving: "24866",
    kind: "stud",
    index: 0,
  },
  {
    name: "Window pane",
    target: "60592",
    moving: "60601",
    kind: "stud",
    index: 0,
  },
];
function choicesFor(targetPose: PartPose, movingId: string) {
  const moving = PART_PROFILES.get(movingId)!;
  const original: PartPose = {
    id: "moving",
    partId: movingId,
    position: [0, 0, 0],
    rotation: IDENTITY,
  };
  return worldConnectors(targetPose)
    .flatMap((target) =>
      moving.connectors
        .filter((c) => compatibleFamily(c, target))
        .map((connector) => {
          const pose = snapPose(original, connector.id, target);
          const distance = pose.position.reduce(
            (sum, n, i) => sum + (n - targetPose.position[i]) ** 2,
            0,
          );
          return { target, moving: connector, distance };
        }),
    )
    .sort((a, b) => a.distance - b.distance);
}
export default function ConnectionsPage() {
  const [targetId, setTargetId] = useState("3020"),
    [movingId, setMovingId] = useState("3003"),
    [docked, setDocked] = useState(false),
    [twist, setTwist] = useState(0),
    [pointIndex, setPointIndex] = useState(0),
    [show, setShow] = useState(true),
    [selected, setSelected] = useState("moving");
  const [picker, setPicker] = useState<"target" | "moving">(),
    [query, setQuery] = useState("");
  const target = PART_PROFILES.get(targetId)!,
    moving = PART_PROFILES.get(movingId)!;
  const { choices, poses, analysis } = useMemo(() => {
    const targetPose: PartPose = {
      id: "target",
      partId: targetId,
      position: [0, 0, 0],
      rotation: IDENTITY,
    };
    // Start near the base centre rather than with an arbitrary corner overhang.
    // This is a presentation preference, not a clearance or stability pass.
    const choices = choicesFor(targetPose, movingId);
    const choice = choices[pointIndex % Math.max(1, choices.length)];
    const separated: PartPose = {
      id: "moving",
      partId: movingId,
      position: [3.5, 1.5, 0],
      rotation: IDENTITY,
    };
    const movingPose =
      docked && choice
        ? snapPose(separated, choice.moving.id, choice.target, twist)
        : separated;
    const poses = [targetPose, movingPose];
    return { choices, poses, analysis: findMates(poses) };
  }, [targetId, movingId, docked, pointIndex, twist]);
  const inspection = selected === "target" ? target : moving;
  function reset() {
    setDocked(false);
    setTwist(0);
    setPointIndex(0);
  }
  function chooseScenario(s: (typeof scenarios)[number]) {
    setTargetId(s.target);
    setMovingId(s.moving);
    setDocked(false);
    setTwist(0);
    setSelected("moving");
    const profile = PART_PROFILES.get(s.target)!;
    const compatible = choicesFor(
      {
        id: "target",
        partId: s.target,
        position: [0, 0, 0],
        rotation: IDENTITY,
      },
      s.moving,
    );
    const desired = profile.connectors.filter((c) => c.kind === s.kind)[
      s.index
    ];
    setPointIndex(
      Math.max(
        0,
        compatible.findIndex((c) => c.target.id === desired?.id),
      ),
    );
  }
  function pickPart(part: BuilderPart) {
    if (picker === "target") setTargetId(part.id);
    else setMovingId(part.id);
    setPicker(undefined);
    reset();
  }
  const filtered = BUILDER_PARTS.filter((p) =>
    `${p.name} ${p.id} ${p.rebrickableId} ${p.category}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div id="page-content" className="connections-page">
      <PageHeading
        eyebrow="Real shapes. Real attachment points."
        title="Make the connection."
        description="Explore how pieces meet. Stack them, build sideways, or try a Technic pin."
        back="/catalog"
      />
      <div
        className="connection-presets"
        role="group"
        aria-label="Connection examples"
      >
        {scenarios.map((s) => (
          <button
            key={s.name}
            aria-pressed={targetId === s.target && movingId === s.moving}
            onClick={() => chooseScenario(s)}
          >
            {s.name}
          </button>
        ))}
      </div>
      <div className="connection-layout">
        <section
          className="connection-workspace"
          aria-label="Connection playground"
        >
          <div className="connection-stage-heading">
            <span>
              <span className="connection-live-dot" /> REAL PART GEOMETRY
            </span>
            <button aria-pressed={show} onClick={() => setShow(!show)}>
              <Eye size={15} /> Attachment points
            </button>
          </div>
          <Canvas poses={poses} showConnectors={show} onPick={setSelected} />
          <div className="connection-legend">
            <span>
              <i className="stud-dot" />
              Stud
            </span>
            <span>
              <i className="socket-dot" />
              Underside
            </span>
            <span>
              <i className="pin-dot" />
              Pin
            </span>
            <span>
              <i className="hole-dot" />
              Pin hole
            </span>
          </div>
          <div className="connection-actions">
            <button
              className="connection-primary"
              disabled={!choices.length}
              onClick={() => setDocked(!docked)}
            >
              {docked ? <Unlink size={17} /> : <Link2 size={17} />}{" "}
              {docked ? "Separate pieces" : "Connect pieces"}
            </button>
            <button
              disabled={!docked}
              onClick={() => setTwist((twist + 90) % 360)}
            >
              <RotateCw size={17} /> Rotate 90°
            </button>
            <button
              disabled={choices.length < 2}
              onClick={() => setPointIndex((pointIndex + 1) % choices.length)}
            >
              <Layers size={17} /> Next attachment
            </button>
          </div>
          <div
            className={`connection-feedback ${analysis.mates.length ? "is-connected" : ""}`}
            role="status"
            data-mate-count={analysis.mates.length}
          >
            {analysis.mates.length ? <Check size={19} /> : <Shapes size={19} />}
            <div>
              <strong>
                {!choices.length
                  ? "This fit needs a connection profile"
                  : docked
                    ? `${analysis.mates.length} aligned attachment${analysis.mates.length === 1 ? "" : "s"}`
                    : "Ready to try a supported fit"}
              </strong>
              <p>
                {!choices.length
                  ? "These shapes are available to explore, but this mating mechanism has not been reviewed yet."
                  : docked
                    ? "The attachment points match. Whole-model clearance and stability are a separate next step."
                    : "Choose an attachment, then bring the pieces together."}
              </p>
            </div>
          </div>
          <p className="connection-note">
            Colors are illustrative. A digital fit does not certify clutch
            strength, stock availability or physical stability.
          </p>
        </section>
        <aside className="connection-side">
          <div className="connection-part-pair">
            <h2>Your two pieces</h2>
            {([target, moving] as BuilderPart[]).map((part, i) => (
              <button
                className={`connection-part-choice ${selected === (i ? "moving" : "target") ? "is-selected" : ""}`}
                key={i}
                onClick={() => {
                  setPicker(i ? "moving" : "target");
                  setQuery("");
                }}
                aria-label={`Change ${i ? "moving" : "base"} piece`}
              >
                <Image
                  unoptimized
                  width={92}
                  height={82}
                  src={assetPath(`/catalog/previews/${part.id}.svg`)}
                  alt=""
                />
                <span>
                  <small>{i ? "MOVING PIECE" : "BASE PIECE"}</small>
                  <strong>{part.name.replaceAll(" x ", " × ")}</strong>
                  <span>LDraw #{part.id}</span>
                </span>
                <ArrowRight size={16} />
              </button>
            ))}
          </div>
          <div className="connection-inspection">
            <div
              className="connection-inspection-tabs"
              role="group"
              aria-label="Inspect a piece"
            >
              <button
                aria-pressed={selected === "target"}
                onClick={() => setSelected("target")}
              >
                Base piece
              </button>
              <button
                aria-pressed={selected === "moving"}
                onClick={() => setSelected("moving")}
              >
                Moving piece
              </button>
            </div>
            <h3>{inspection.name.replaceAll(" x ", " × ")}</h3>
            <p>
              {inspection.connectors.length} reviewed attachment points ·{" "}
              {inspection.coverage === "stud-system"
                ? "Stud system"
                : "Partial coverage"}
            </p>
            <div className="connection-feature-list">
              {["stud", "anti-stud", "pin", "pin-hole"].map((kind) => {
                const count = inspection.connectors.filter(
                  (c) => c.kind === kind,
                ).length;
                return count ? (
                  <span key={kind}>
                    <Check size={13} />
                    {count}{" "}
                    {kind === "anti-stud"
                      ? "underside socket"
                      : kind.replace("-", " ")}
                    {count > 1 ? "s" : ""}
                  </span>
                ) : null;
              })}
            </div>
            {inspection.coverage === "partial" && (
              <p className="connection-coverage">
                Only the listed attachment points are supported. Other features
                on this part are still unreviewed.
              </p>
            )}
            <Link href={inspection.source.url} target="_blank" rel="noreferrer">
              Original geometry and credits <ArrowUpRight size={13} />
            </Link>
          </div>
          <div className="connection-precision">
            <span>BUILT ON REAL DIMENSIONS</span>
            <strong>
              8 mm <small>stud spacing</small>
            </strong>
            <p>
              9.6 mm brick · 3.2 mm plate
              <br />
              Uniform geometry scale, with full rotation support.
            </p>
          </div>
        </aside>
      </div>
      <div className="connection-library-footer">
        <div>
          <h2>{BUILDER_PARTS.length} shapes, ready to explore.</h2>
          <p>
            Every piece in the house builder now uses real LDraw surfaces.
            Connection profiles grow independently of the full catalog.
          </p>
        </div>
        <Link href="/builder" className="button button-primary">
          Open your builder <ArrowRight size={16} />
        </Link>
      </div>
      <p className="connection-attribution">
        Geometry © The LDraw Parts Library contributors · CC BY 4.0; individual
        dual-license notices retained. Shapes transformed and compiled for this
        viewer.{" "}
        <a href={assetPath("/catalog/builder-parts.json")}>
          Geometry and connection evidence
        </a>{" "}
        · <a href={assetPath("/catalog/CAlicense4.txt")}>License</a>
      </p>
      {picker && (
        <Sheet
          onClose={() => setPicker(undefined)}
          title={`Choose the ${picker === "target" ? "base" : "moving"} piece`}
        >
          <div className="connection-picker-search">
            <Search size={18} />
            <input
              aria-label="Search builder shapes"
              placeholder="Find a shape or part number…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <p className="connection-picker-count">
            {filtered.length} packaged shapes · connection coverage varies
          </p>
          <div className="connection-picker-grid">
            {filtered.map((p) => (
              <button key={p.id} onClick={() => pickPart(p)}>
                <Image
                  unoptimized
                  width={130}
                  height={115}
                  src={assetPath(`/catalog/previews/${p.id}.svg`)}
                  alt=""
                />
                <strong>{p.name.replaceAll(" x ", " × ")}</strong>
                <span>
                  #{p.id} · {p.connectors.length} attachment points
                </span>
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}

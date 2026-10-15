"use client";

import {projectModel} from "@/domain/project-model";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Search,
  Layers,
  Shapes,
  Package,
  ArrowRight,
  X,
  Check,
} from "lucide-react";
import Link from "next/link";
import libraryManifest from "../../../public/catalog/rebrickable-manifest.json";
import { ProjectSelector } from "@/components/project-selector";
import { CATALOG, COLORS } from "@/domain/catalog";
import {
  PageHeading,
  PartCard,
  PartIllustration,
  Sheet,
} from "@/components/ui";
import { useProjects } from "@/services/project-repository";
import type { PartQuantity, Project } from "@/domain/types";

export default function PartsPage() {
  return (
    <Suspense
      fallback={<div className="viewer-loading">Preparing your parts…</div>}
    >
      <PartsContent />
    </Suspense>
  );
}

function PartsContent() {
  const { active } = useProjects();
  return <BuildParts key={active.id} active={active} />;
}

function BuildParts({ active }: { active: Project }) {
  const model = projectModel(active);
  const params = useSearchParams();
  const [query, setQuery] = useState(params?.get("part") ?? "");
  const [color, setColor] = useState(params?.get("color") ?? "all");
  const [category, setCategory] = useState("all");
  const [bag, setBag] = useState(params?.get("bag") ?? "all");
  const [selected, setSelected] = useState<PartQuantity | null>(null);
  const source =
    model.bags.find((b) => String(b.number) === bag)?.parts ?? model.parts;
  const filtered = source.filter((p) => {
    const part = CATALOG[p.partId];
    return (
      (color === "all" || p.color === color) &&
      (category === "all" || part.category === category) &&
      `${part.name} ${part.id} ${COLORS[p.color].name}`
        .toLowerCase()
        .includes(query.toLowerCase().trim())
    );
  });
  const filtering =
    query || color !== "all" || category !== "all" || bag !== "all";
  function clear() {
    setQuery("");
    setColor("all");
    setCategory("all");
    setBag("all");
  }
  return (
    <div id="page-content" className="parts-page">
      <ProjectSelector />
      <PageHeading
        eyebrow="Every little piece has a place"
        title="Meet your building blocks."
        description={`Every piece of ${active.name}, in one place.`}
        back="/review"
      />
      <div className="parts-summary">
        <div>
          <Layers size={22} />
          <span>
            <strong>{model.stats.pieceCount}</strong>
            <small>Total pieces</small>
          </span>
        </div>
        <div>
          <Shapes size={22} />
          <span>
            <strong>{model.stats.uniquePartCount}</strong>
            <small>Part & color combinations</small>
          </span>
        </div>
        <div>
          <Package size={22} />
          <span>
            <strong>{model.bags.length}</strong>
            <small>Sorting bags</small>
          </span>
        </div>
        <Link className="text-link" href="/builder">
          Go to builder <ArrowRight size={16} />
        </Link>
      </div>
      <Link href="/catalog" className="parts-library-link">
        <Shapes size={24} />
        <span>
          <strong>Beyond the basic brick</strong>
          <small>
            Explore {libraryManifest.partCount.toLocaleString("en-US")} part
            designs: curves, glass, flowers, gears, and more.
          </small>
        </span>
        <ArrowRight size={19} />
      </Link>
      <div className="parts-layout">
        <aside className="bag-sidebar">
          <span className="eyebrow">A little organization</span>
          <h2>Your sorting bags</h2>
          <p>
            One group at a time.
            <br />
            Everything where you need it.
          </p>
          <button
            className={bag === "all" ? "selected" : ""}
            onClick={() => setBag("all")}
          >
            <Layers size={18} />
            <span>
              <strong>All parts</strong>
              <small>The complete build</small>
            </span>
            {bag === "all" && <Check size={16} />}
          </button>
          {model.bags.map((group) => (
            <button
              key={group.number}
              className={bag === String(group.number) ? "selected" : ""}
              onClick={() => setBag(String(group.number))}
            >
              <span className="bag-number">{group.number}</span>
              <span>
                <strong>{group.name}</strong>
                <small>
                  Steps {group.firstStep}–{group.lastStep}
                </small>
              </span>
              {bag === String(group.number) && <Check size={16} />}
            </button>
          ))}
          <span className="demo-note">
            Catalog shapes and demo colors. Live stock and ordering are outside
            this prototype.
          </span>
        </aside>
        <div>
          <div className="parts-filters">
            <label className="search-input">
              <Search size={18} />
              <span className="visually-hidden">Search parts</span>
              <input
                placeholder="Find a part, color, or number…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button aria-label="Clear search" onClick={() => setQuery("")}>
                  <X size={16} />
                </button>
              )}
            </label>
            <div className="part-filter-chips">
              <div
                className="filter-chip-row"
                role="group"
                aria-label="Filter by category"
              >
                {[
                  "all",
                  ...new Set(
                    model.parts.map((p) => CATALOG[p.partId].category),
                  ),
                ].map((c) => (
                  <button
                    key={c}
                    aria-pressed={category === c}
                    onClick={() => setCategory(c)}
                  >
                    {c === "all" ? "All types" : c + "s"}
                  </button>
                ))}
              </div>
              <div
                className="color-chip-row"
                role="group"
                aria-label="Filter by color"
              >
                <button
                  aria-label="All colors"
                  aria-pressed={color === "all"}
                  onClick={() => setColor("all")}
                  className="all-color-chip"
                >
                  <Shapes size={17} />
                </button>
                {Object.entries(COLORS).map(([id, c]) => (
                  <button
                    key={id}
                    aria-label={c.name}
                    title={c.name}
                    aria-pressed={color === id}
                    onClick={() => setColor(id)}
                  >
                    <i style={{ background: c.hex }} />
                    {color === id && <Check size={12} />}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="parts-results">
            <span>
              {filtered.length} combinations ·{" "}
              {filtered.reduce((n, p) => n + p.quantity, 0)} pieces
              {bag !== "all" ? ` in Bag ${bag}` : ""}
            </span>
            {filtering && (
              <button className="text-link" onClick={clear}>
                Clear filters <X size={13} />
              </button>
            )}
          </div>
          <div className="parts-grid">
            {filtered.map((p) => (
              <PartCard key={p.key} part={p} onClick={() => setSelected(p)} />
            ))}
          </div>
          {filtered.length === 0 && (
            <div className="empty-state">
              <Search size={30} />
              <h3>No pieces here just yet.</h3>
              <p>Try a different name, color, or sorting bag.</p>
              <button className="button button-secondary" onClick={clear}>
                Clear filters
              </button>
            </div>
          )}
        </div>
      </div>
      {selected && (
        <Sheet
          title={CATALOG[selected.partId].name}
          onClose={() => setSelected(null)}
        >
          <div className="part-detail-render">
            <PartIllustration partId={selected.partId} color={selected.color} />
          </div>
          <div className="part-detail-stats">
            <div>
              <span>Part number</span>
              <strong>#{selected.partId}</strong>
            </div>
            <div>
              <span>Color</span>
              <strong>
                <i style={{ background: COLORS[selected.color].hex }} />
                {COLORS[selected.color].sourceName} · Rebrickable color #
                {COLORS[selected.color].rebrickableId}
              </strong>
            </div>
            <div>
              <span>
                {bag === "all" ? "Total required" : `Required in Bag ${bag}`}
              </span>
              <strong>{selected.quantity} pieces</strong>
            </div>
            <div>
              <span>Sorting bags</span>
              <strong>
                {model.bags
                  .filter((b) => b.parts.some((p) => p.key === selected.key))
                  .map((b) => b.number)
                  .join(", ")}
              </strong>
            </div>
          </div>
          <p className="demo-note">
            Part numbers identify catalog shapes. Render colors are
            illustrative.
          </p>
          <button
            className="button button-secondary full-width"
            onClick={() => setSelected(null)}
          >
            Back to parts
          </button>
        </Sheet>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Check,
  ChevronDown,
  Download,
  Flower2,
  Layers,
  Search,
  Shapes,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { PageHeading, Sheet } from "@/components/ui";
import { assetPath } from "@/lib/asset-path";
import { loadPartLibrary, type CatalogSource } from "@/services/part-library";
import {
  LIBRARY_FEATURES,
  searchLibrary,
  type LibraryIndex,
  type LibraryPart,
} from "@/domain/library/types";
import ldrawManifest from "../../../public/catalog/manifest.json";
import rbManifest from "../../../public/catalog/rebrickable-manifest.json";
import renderLinks from "../../../data/catalog/render-links.json";
import renderPalette from "../../../public/catalog/render-colors.json";

const PartViewer = dynamic(() => import("@/components/library-part-viewer"), {
  ssr: false,
  loading: () => (
    <div className="viewer-loading">Preparing the part viewer…</div>
  ),
});
const previews = new Map(ldrawManifest.previews.map((p) => [p.id, p]));
const geometryLinks = new Map(
  renderLinks.links.map((link) => [link.rebrickablePartId, link.ldrawPartId]),
);
const featuredIds = ["11477", "60601", "24866", "30176", "3659", "3647"];

export default function CatalogPage() {
  const [source, setSource] = useState<CatalogSource>("rebrickable");
  const [loaded, setLoaded] = useState<{
    source: CatalogSource;
    index: LibraryIndex;
  }>();
  const index = loaded?.source === source ? loaded.index : undefined;
  const manifest = source === "rebrickable" ? rbManifest : ldrawManifest;
  const sourceName = source === "rebrickable" ? "Rebrickable" : "LDraw";
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [feature, setFeature] = useState("all");
  const [category, setCategory] = useState("all");
  const [limit, setLimit] = useState(48);
  const [categoryPicker, setCategoryPicker] = useState(false);
  const [categoryQuery, setCategoryQuery] = useState("");
  const [onlyPreviews, setOnlyPreviews] = useState(false);
  const [selected, setSelected] = useState<LibraryPart>();
  const [renderColor, setRenderColor] = useState(71);
  useEffect(() => {
    let cancelled = false;
    loadPartLibrary(source)
      .then((value) => {
        if (!cancelled) setLoaded({ source, index: value });
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [retry, source]);
  const filtered = useMemo(() => {
    const found = searchLibrary(index?.parts ?? [], query, category, feature);
    return onlyPreviews
      ? found.filter((p) =>
          previews.has(
            source === "ldraw" ? p.id : (geometryLinks.get(p.id) ?? ""),
          ),
        )
      : found;
  }, [index, query, category, feature, onlyPreviews, source]);
  const featured = featuredIds.flatMap(
    (id) => index?.parts.find((p) => p.id === id) ?? [],
  );
  const filtering =
    query || category !== "all" || feature !== "all" || onlyPreviews;
  function previewFor(part: LibraryPart) {
    const id =
      source === "ldraw"
        ? part.id
        : renderLinks.links.find((link) => link.rebrickablePartId === part.id)
            ?.ldrawPartId;
    return id ? previews.get(id) : undefined;
  }
  const selectedPreview = selected && previewFor(selected);
  const palette =
    source === "rebrickable" && (selected?.observedColorIds?.length ?? 0) > 0
      ? (index?.colors.filter((c) =>
          selected?.observedColorIds?.includes(c.id),
        ) ?? [])
      : renderPalette.filter((color) =>
          [71, 15, 4, 14, 2, 70, 47, 43].includes(color.id),
        );
  const selectedColor = palette.find((c) => c.id === renderColor) ?? palette[0];
  function openPart(part: LibraryPart) {
    const suggested = previews.get(part.id)?.color ?? 71;
    setRenderColor(
      source === "rebrickable" &&
        part.observedColorIds?.length &&
        !part.observedColorIds.includes(suggested)
        ? part.observedColorIds[0]
        : suggested,
    );
    setSelected(part);
  }
  function clear() {
    setQuery("");
    setFeature("all");
    setCategory("all");
    setOnlyPreviews(false);
    setLimit(48);
  }
  function partCard(part: LibraryPart, highlight = false) {
    const preview = previewFor(part);
    return (
      <button
        key={part.id}
        className={`library-part-card ${highlight ? "featured" : ""}`}
        aria-label={`Inspect ${part.name} · ${sourceName} ${part.id}`}
        onClick={() => openPart(part)}
      >
        <span className="library-part-art">
          {preview ? (
            <Image
              width={180}
              height={160}
              unoptimized
              src={assetPath(`/catalog/previews/${preview.id}.svg`)}
              alt={`${part.name} from actual LDraw geometry`}
              loading="lazy"
            />
          ) : (
            <span className="library-entry-icon">
              <Shapes size={25} />
              <small>{part.category}</small>
            </span>
          )}
          {preview && <span className="library-preview-badge">3D</span>}
        </span>
        <span className="library-part-text">
          <small>
            {part.category} · #{part.id}
          </small>
          <strong>{part.name.replaceAll(" x ", " × ")}</strong>
          <span>
            {preview ? "Explore the shape" : "View catalog entry"}
            <ArrowUpRight size={12} />
          </span>
        </span>
      </button>
    );
  }
  return (
    <div id="page-content" className="library-page">
      <PageHeading
        eyebrow="A bigger world of possibilities"
        title="Beyond the basic brick."
        description="Curves. Glass. Petals. Gears. Explore the pieces that make a model feel like the real thing."
        back="/parts"
      />
      <div
        className="library-source-tabs"
        role="group"
        aria-label="Catalog source"
      >
        {(["rebrickable", "ldraw"] as const).map((value) => (
          <button
            key={value}
            aria-pressed={source === value}
            onClick={() => {
              setSource(value);
              clear();
              setError(false);
            }}
          >
            {value === "rebrickable"
              ? "Parts & recorded colors"
              : "LDraw geometry"}
          </button>
        ))}
      </div>
      <div className="library-hero-stats">
        <span>
          <Boxes size={22} />
          <strong>{manifest.partCount.toLocaleString("en-US")}</strong>
          <small>Part designs</small>
        </span>
        <span>
          <Shapes size={22} />
          <strong>{manifest.categoryCount}</strong>
          <small>Categories</small>
        </span>
        <span>
          <Layers size={22} />
          <strong>
            {source === "rebrickable"
              ? rbManifest.observedPartColorCount.toLocaleString("en-US")
              : ldrawManifest.previewCount}
          </strong>
          <small>
            {source === "rebrickable"
              ? "Observed color pairs"
              : "Real 3D previews"}
          </small>
        </span>
        <div>
          <span className="tag">{sourceName.toUpperCase()}</span>
          <p>Source snapshot · {manifest.source.snapshotDate}</p>
        </div>
      </div>
      <div className="library-source-note">
        <Sparkles size={18} />
        <p>
          Current Rebrickable catalog data pairs with official LDraw geometry
          from release 2026-09. Recorded colors are historical catalog evidence,
          not live stock. The house demo still uses 12 shapes; connections must
          be validated before new pieces enter generation.
        </p>
      </div>
      <div className="library-search-controls">
        <label className="search-input">
          <Search size={18} />
          <input
            aria-label="Search the part library"
            placeholder="Try flower, curved, window, or a part number…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(48);
            }}
          />
          {query && (
            <button
              aria-label="Clear library search"
              onClick={() => {
                setQuery("");
                setLimit(48);
              }}
            >
              <X size={15} />
            </button>
          )}
        </label>
        <button
          className="library-category-button"
          onClick={() => setCategoryPicker(true)}
        >
          <SlidersHorizontal size={16} />
          {category === "all" ? "All categories" : category}
          <ChevronDown size={14} />
        </button>
      </div>
      <div
        className="library-feature-chips"
        role="group"
        aria-label="Filter part features"
      >
        {["all", ...LIBRARY_FEATURES].map((value) => (
          <button
            key={value}
            aria-pressed={feature === value}
            onClick={() => {
              setFeature(value);
              setLimit(48);
            }}
          >
            {value === "all" ? "All designs" : value}
          </button>
        ))}
        <button
          className="library-preview-filter"
          aria-pressed={onlyPreviews}
          onClick={() => {
            setOnlyPreviews(!onlyPreviews);
            setLimit(48);
          }}
        >
          <Layers size={13} />
          3D previews
        </button>
      </div>
      <div className="library-result-count" aria-live="polite">
        <span>
          {index
            ? `${filtered.length.toLocaleString("en-US")} designs${filtering ? " match your filters" : " in the library"}`
            : "Loading the part library…"}
        </span>
        {filtering && (
          <button className="text-link" onClick={clear}>
            Clear filters <X size={13} />
          </button>
        )}
      </div>
      {!filtering && index && (
        <section
          className="library-featured"
          aria-label="Explore real part shapes"
        >
          <div className="library-section-heading">
            <span className="eyebrow">
              <Flower2 size={15} /> LITTLE PIECES. BIG POSSIBILITIES.
            </span>
            <p>
              These previews use detailed LDraw geometry, including curves and
              hollow shapes.
            </p>
          </div>
          <div className="library-featured-grid">
            {featured.map((p) => partCard(p, true))}
          </div>
        </section>
      )}
      {error && !index ? (
        <div className="library-empty">
          <h2>Let’s load that again.</h2>
          <p>The library couldn’t be downloaded.</p>
          <button
            className="button button-secondary"
            onClick={() => {
              setError(false);
              setRetry((n) => n + 1);
            }}
          >
            Retry
          </button>
        </div>
      ) : !index ? (
        <div className="library-loading" role="status">
          <Boxes size={28} />
          <span>Gathering all the little possibilities…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="library-empty">
          <h2>No matching designs.</h2>
          <p>Try another name, part number, or category.</p>
          <button className="button button-secondary" onClick={clear}>
            Clear filters
          </button>
        </div>
      ) : (
        <div className="library-results-grid">
          {filtered.slice(0, limit).map((p) => partCard(p))}
        </div>
      )}
      {filtered.length > limit && (
        <button
          className="button button-secondary library-load-more"
          onClick={() => setLimit((n) => n + 48)}
        >
          Show more designs <ArrowRight size={16} />
        </button>
      )}
      <div className="library-next-step">
        <div>
          <span className="eyebrow">THE NEXT CONNECTION</span>
          <h2>From a parts list to a real build.</h2>
          <p>
            Our next sourcing layer will match exact part-and-color IDs, then
            prepare a complete wanted list for a brick marketplace. The recorded
            color pairs are historical evidence. Current supplier stock, exact
            vendor IDs, and shipping-country coverage still need verification.
          </p>
        </div>
        <Link href="/parts" className="button button-primary">
          Your build’s parts <ArrowRight size={16} />
        </Link>
      </div>
      <footer className="library-attribution">
        <p>
          Catalog and historical part/color data sourced from{" "}
          <a
            href="https://rebrickable.com/downloads/"
            target="_blank"
            rel="noreferrer"
          >
            Rebrickable
          </a>
          , snapshot {rbManifest.source.snapshotDate}; commercial reuse with
          attribution under its download terms. Geometry and descriptions:{" "}
          <a href="https://library.ldraw.org/" target="_blank" rel="noreferrer">
            The LDraw Parts Library and its contributors
          </a>
          , official release {ldrawManifest.source.revision},{" "}
          <a
            href={ldrawManifest.source.licenseUrl}
            target="_blank"
            rel="noreferrer"
          >
            CC BY 4.0
          </a>
          ; dual-licensed entries retain both licenses. Geometry packaging and
          projection by BrickMade. Source counts are separate and include
          decorated variants; geometry helpers, aliases, assemblies, and
          unofficial files are excluded from its entry count.
        </p>
        <div>
          <a href={assetPath("/catalog/brickmade.sqlite")} download>
            <Download size={14} />
            Catalog database
          </a>
          <a
            href={assetPath("/catalog/rebrickable-manifest.json")}
            target="_blank"
            rel="noreferrer"
          >
            Catalog source manifest <ArrowUpRight size={13} />
          </a>
          <a
            href={assetPath("/catalog/manifest.json")}
            target="_blank"
            rel="noreferrer"
          >
            Geometry source manifest
          </a>
          <a
            href={assetPath("/catalog/CAlicense4.txt")}
            target="_blank"
            rel="noreferrer"
          >
            Geometry license
          </a>
        </div>
      </footer>
      {categoryPicker && (
        <Sheet
          title="Find your kind of piece"
          onClose={() => setCategoryPicker(false)}
        >
          <label className="search-input">
            <Search size={16} />
            <input
              aria-label="Search library categories"
              placeholder="Find a category…"
              value={categoryQuery}
              onChange={(e) => setCategoryQuery(e.target.value)}
            />
          </label>
          <div className="library-category-grid">
            {[
              { name: "all", count: manifest.partCount },
              ...manifest.categories,
            ]
              .filter((c) =>
                c.name.toLowerCase().includes(categoryQuery.toLowerCase()),
              )
              .map((c) => (
                <button
                  key={c.name}
                  aria-pressed={category === c.name}
                  onClick={() => {
                    setCategory(c.name);
                    setLimit(48);
                    setCategoryPicker(false);
                  }}
                >
                  <span>
                    {c.name === "all" ? "All categories" : c.name}
                    <small>{c.count.toLocaleString("en-US")} designs</small>
                  </span>
                  {category === c.name && <Check size={15} />}
                </button>
              ))}
          </div>
        </Sheet>
      )}
      {selected && (
        <Sheet
          title={selected.name.replaceAll(" x ", " × ")}
          onClose={() => setSelected(undefined)}
          className="library-detail-sheet"
        >
          <div className="library-detail-meta">
            <span className="tag">{selected.category}</span>
            <strong>
              {sourceName} #{selected.id}
            </strong>
          </div>
          {selectedPreview && selectedColor ? (
            <>
              <PartViewer
                key={`${source}:${selected.id}`}
                preview={selectedPreview}
                color={selectedColor}
                name={selected.name}
              />
              <div
                className="library-render-colors"
                role="group"
                aria-label="Preview render color"
              >
                {palette.map((c) => (
                  <button
                    key={c.id}
                    aria-label={c.name}
                    aria-pressed={c.id === renderColor}
                    style={{ "--swatch": c.hex } as React.CSSProperties}
                    onClick={() => setRenderColor(c.id)}
                  >
                    {c.id === renderColor && <Check size={13} />}
                  </button>
                ))}
              </div>
              <p className="library-color-note">
                {selectedColor.name}
                {selectedColor.alpha < 255
                  ? " · transparent material"
                  : ""}.{" "}
                {source === "rebrickable" && selected.observedColorIds?.length
                  ? "Color recorded for this part; current supplier stock is unverified."
                  : "Render color only; manufactured availability is unverified."}
              </p>
              <details className="library-thumbnail-fallback">
                <summary>Geometry thumbnail</summary>
                <Image
                  width={180}
                  height={160}
                  unoptimized
                  src={assetPath(`/catalog/previews/${selectedPreview.id}.svg`)}
                  alt={`${selected.name} geometry projection`}
                />
              </details>
            </>
          ) : (
            <div className="library-unpreviewed">
              <Shapes size={42} />
              <h3>Catalog entry</h3>
              <p>
                This part is indexed. Its geometry has not been packaged for the
                app’s preview yet.
              </p>
            </div>
          )}
          <dl className="library-part-facts">
            <div>
              <dt>
                {source === "ldraw"
                  ? "Original geometry author"
                  : "Material / catalog source"}
              </dt>
              <dd>
                {selected.author ||
                  `${selected.material ?? "Unknown"} · Rebrickable`}
              </dd>
            </div>
            <div>
              <dt>Part’s library update</dt>
              <dd>{selected.update ?? manifest.source.snapshotDate}</dd>
            </div>
            <div>
              <dt>Connection / sourcing status</dt>
              <dd>Not yet validated</dd>
            </div>
          </dl>
          <a
            className="button button-secondary full-width"
            href={
              source === "ldraw"
                ? `${ldrawManifest.source.recordBaseUrl}${encodeURIComponent(selected.id)}.dat`
                : `https://rebrickable.com/parts/${encodeURIComponent(selected.id)}/`
            }
            target="_blank"
            rel="noreferrer"
          >
            {source === "ldraw"
              ? "Original geometry & attribution"
              : "Original catalog record"}{" "}
            <ArrowUpRight size={16} />
          </a>
          <p className="demo-note">
            Geometry: The LDraw Parts Library · CC BY 4.0 and dual-licensed
            entries as marked. Catalog data: Rebrickable. Source identities
            remain separate; vendor IDs are not assumed.
          </p>
        </Sheet>
      )}
    </div>
  );
}

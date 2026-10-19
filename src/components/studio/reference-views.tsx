"use client";
import { useEffect, useRef } from "react";
import { decodeView, BACKGROUND, type ViewGrid } from "@/domain/studio/views";

const LABELS = { front: "Front", side: "Side", top: "From above" } as const;

/** Draw one stored reference view; these are what the model was carved from. */
function View({ grid }: { grid: ViewGrid }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const pixels = decodeView(grid);
    const image = ctx.createImageData(grid.width, grid.height);
    pixels.forEach((v, p) => {
      if (v === BACKGROUND) return;
      image.data[p * 4] = ((v >> 11) & 31) * 8.2258;
      image.data[p * 4 + 1] = ((v >> 5) & 63) * 4.0476;
      image.data[p * 4 + 2] = (v & 31) * 8.2258;
      image.data[p * 4 + 3] = 255;
    });
    ctx.putImageData(image, 0, 0);
  }, [grid]);
  return (
    <figure>
      <canvas
        ref={canvas}
        width={grid.width}
        height={grid.height}
        aria-label={`${LABELS[grid.view]} reference view`}
      />
      <figcaption>{LABELS[grid.view]}</figcaption>
    </figure>
  );
}

export function ReferenceViews({ views }: { views: ViewGrid[] }) {
  return (
    <div className="studio-reference-views">
      {views.map((g) => (
        <View key={g.view} grid={g} />
      ))}
    </div>
  );
}

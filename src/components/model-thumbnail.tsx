"use client";
import Image from "next/image";
import { memo, useEffect, useRef, useState } from "react";
import { renderModelThumbnail } from "@/services/model-thumbnail";
import { assetPath } from "@/lib/asset-path";
import type { HouseModel } from "@/domain/types";
/** Offline render of the exact placements and licensed source mesh surfaces. */
export const ModelThumbnail = memo(function ModelThumbnail({
  model,
  name,
}: {
  model: HouseModel;
  name: string;
}) {
  if (model.design) return <GeneratedThumbnail model={model} name={name} />;
  return (
    <Image
      width={480}
      height={400}
      unoptimized
      className="model-thumbnail"
      src={assetPath(
        `/catalog/models/${model.kind ?? "house"}-${model.settings.detail}-${model.settings.size}.png?v=${model.revision}`,
      )}
      alt={`${name} brick model, ${model.stats.pieceCount} pieces`}
      data-total-pieces={model.stats.pieceCount}
      loading="lazy"
    />
  );
});

function GeneratedThumbnail({
  model,
  name,
}: {
  model: HouseModel;
  name: string;
}) {
  const host = useRef<HTMLSpanElement>(null);
  const [result, setResult] = useState<{
    model: HouseModel;
    url?: string;
    failed?: boolean;
  }>();
  useEffect(() => {
    let cancelled = false,
      started = false;
    const start = () => {
      if (started) return;
      started = true;
      renderModelThumbnail(model)
        .then((url) => {
          if (!cancelled) setResult({ model, url });
        })
        .catch(() => {
          if (!cancelled) setResult({ model, failed: true });
        });
    };
    const observer =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              if (entries.some((e) => e.isIntersecting)) {
                start();
                observer?.disconnect();
              }
            },
            { rootMargin: "160px" },
          )
        : null;
    if (host.current && observer) observer.observe(host.current);
    else start();
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [model]);
  const url = result?.model === model ? result.url : undefined;
  return (
    <span
      ref={host}
      className="generated-model-thumbnail"
      data-thumbnail-source="real-mesh"
      data-total-pieces={model.stats.pieceCount}
    >
      {url ? (
        <Image
          width={480}
          height={400}
          className="model-thumbnail"
          unoptimized
          src={url}
          alt={`${name} brick model, ${model.stats.pieceCount} pieces`}
        />
      ) : (
        <span className="thumbnail-loading" role="status">
          {result?.model === model && result.failed
            ? "Model preview unavailable"
            : "Rendering your actual build…"}
        </span>
      )}
    </span>
  );
}

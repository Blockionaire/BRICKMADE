"use client";
import Image from "next/image";
import { memo } from "react";
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

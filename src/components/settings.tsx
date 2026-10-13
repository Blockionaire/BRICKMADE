"use client";

import { Check, Blocks } from "lucide-react";
import { BUILD_SIZES, DETAIL_LEVELS } from "@/domain/catalog";
import type { BuildSize, DetailLevel } from "@/domain/types";

export function DetailSelector({
  value,
  onChange,
  compact = false,
}: {
  value: DetailLevel;
  onChange: (value: DetailLevel) => void;
  compact?: boolean;
}) {
  return (
    <fieldset className={`detail-selector ${compact ? "compact" : ""}`}>
      <legend>How much detail feels right?</legend>
      {!compact && (
        <p className="field-description">
          Same little house. A different kind of adventure.
        </p>
      )}
      <div>
        {DETAIL_LEVELS.map((level, index) => (
          <label
            className={value === level.id ? "selected" : ""}
            key={level.id}
          >
            <input
              type="radio"
              name="detail-level"
              value={level.id}
              checked={value === level.id}
              onChange={() => onChange(level.id)}
            />
            <span className="detail-icon">
              <Blocks size={20} />
              <small>{index + 1}</small>
            </span>
            <span>
              <strong>
                {level.name}
                {level.id === "standard" && (
                  <small className="recommended">Recommended</small>
                )}
              </strong>
              {!compact && <span>{level.description}</span>}
            </span>
            <span className="radio-mark">
              {value === level.id && <Check size={13} />}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function SizeSelector({
  value,
  onChange,
}: {
  value: BuildSize;
  onChange: (value: BuildSize) => void;
}) {
  return (
    <fieldset className="size-selector">
      <legend>A size for your space</legend>
      <div>
        {BUILD_SIZES.map((size) => (
          <label className={value === size.id ? "selected" : ""} key={size.id}>
            <input
              type="radio"
              name="build-size"
              value={size.id}
              checked={value === size.id}
              onChange={() => onChange(size.id)}
            />
            {size.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

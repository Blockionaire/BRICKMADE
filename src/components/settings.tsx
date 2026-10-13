"use client";

import { Check, Blocks, Footprints, Layers, Zap } from "lucide-react";
import {
  BUILD_SIZES,
  DETAIL_LEVELS,
  BUILD_DIFFICULTIES,
} from "@/domain/catalog";
import { createHouse } from "@/domain/house";
import type {
  BuildSize,
  DetailLevel,
  BuildDifficulty,
  GenerationSettings,
} from "@/domain/types";

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
      <legend>Model detail</legend>
      {!compact && (
        <p className="field-description">
          Three house designs, from simple shapes to rich architectural detail.
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
                {level.id === "normal" && (
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
      {compact && (
        <p className="field-description">
          {DETAIL_LEVELS.find((level) => level.id === value)?.description}
        </p>
      )}
    </fieldset>
  );
}

export function BuildDifficultySelector({
  settings,
  onChange,
  compact = false,
}: {
  settings: GenerationSettings;
  onChange: (value: BuildDifficulty) => void;
  compact?: boolean;
}) {
  const value = settings.buildDifficulty ?? "medium";
  const icons = [Footprints, Blocks, Layers];
  return (
    <fieldset className={`instruction-selector ${compact ? "compact" : ""}`}>
      <legend>
        <Zap size={14} /> Building difficulty
      </legend>
      <p className="field-description">
        Your design. Your pace. Same bricks, different steps.
      </p>
      <div className="instruction-options">
        {BUILD_DIFFICULTIES.map((level, index) => {
          const Icon = icons[index];
          const count = createHouse({ ...settings, buildDifficulty: level.id })
            .steps.length;
          return (
            <label
              key={level.id}
              className={value === level.id ? "selected" : ""}
            >
              <input
                type="radio"
                name="build-difficulty"
                value={level.id}
                checked={value === level.id}
                onChange={() => onChange(level.id)}
              />
              <span className="instruction-option-top">
                <Icon size={19} />
                <span className="radio-mark">
                  {value === level.id && <Check size={12} />}
                </span>
              </span>
              <strong>{level.name}</strong>
              <span className="instruction-option-description">
                {level.description}
              </span>
              <span className="instruction-step-count">{count} steps</span>
            </label>
          );
        })}
      </div>
      {compact && (
        <p className="instruction-progress-note">
          Switch anytime. Your place is kept; a partly built group may repeat.
        </p>
      )}
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

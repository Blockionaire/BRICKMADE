"use client";

import {
  Check,
  Blocks,
  Footprints,
  Layers,
  Zap,
  House,
  Car,
  Flower2,
  Building2,
} from "lucide-react";
import {
  BUILD_SIZES,
  DETAIL_LEVELS,
  BUILD_DIFFICULTIES,
} from "@/domain/catalog";
import { createModel } from "@/domain/models";
import { MODEL_KINDS, modelInfo } from "@/domain/models";
import type {
  BuildSize,
  DetailLevel,
  BuildDifficulty,
  GenerationSettings,
  ModelKind,
} from "@/domain/types";

export function DetailSelector({
  value,
  onChange,
  compact = false,
  settings,
}: {
  value: DetailLevel;
  onChange: (value: DetailLevel) => void;
  compact?: boolean;
  settings?: GenerationSettings;
}) {
  return (
    <fieldset className={`detail-selector ${compact ? "compact" : ""}`}>
      <legend>Model detail</legend>
      {!compact && (
        <p className="field-description">
          Choose the amount of detail in your selected design.
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
              {!compact && (
                <span>
                  {settings
                    ? modelInfo(settings).details[index]
                    : level.description}
                </span>
              )}
            </span>
            <span className="radio-mark">
              {value === level.id && <Check size={13} />}
            </span>
          </label>
        ))}
      </div>
      {compact && (
        <p className="field-description">
          {settings
            ? modelInfo(settings).details[
                DETAIL_LEVELS.findIndex((l) => l.id === value)
              ]
            : DETAIL_LEVELS.find((level) => level.id === value)?.description}
        </p>
      )}
    </fieldset>
  );
}

export function ModelKindSelector({
  value,
  onChange,
}: {
  value: ModelKind;
  onChange: (kind: ModelKind) => void;
}) {
  const icons = [House, Car, Flower2, Building2];
  return (
    <fieldset className="model-kind-selector">
      <legend>Demo design</legend>
      <p className="field-description">
        Four real assemblies. Your photos stay local and are not analyzed yet.
      </p>
      <div>
        {MODEL_KINDS.map((kind, index) => {
          const Icon = icons[index];
          return (
            <label
              key={kind.id}
              className={value === kind.id ? "selected" : ""}
            >
              <input
                type="radio"
                name="model-kind"
                value={kind.id}
                checked={value === kind.id}
                onChange={() => onChange(kind.id)}
              />
              <Icon size={24} />
              <strong>{kind.name}</strong>
              <span>{kind.description}</span>
              <i className="radio-mark">
                {value === kind.id && <Check size={12} />}
              </i>
            </label>
          );
        })}
      </div>
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
          const count = createModel({ ...settings, buildDifficulty: level.id })
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

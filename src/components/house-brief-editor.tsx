"use client";
import { HOUSE_PRESETS, type HouseBrief } from "../../shared/house-brief";
import { COLORS } from "@/domain/catalog";
import type { ColorId } from "@/domain/types";
import { Check, House, Layers, SlidersHorizontal } from "lucide-react";
export function HouseBriefEditor({
  brief,
  onChange,
  showPresets = true,
}: {
  brief: HouseBrief;
  onChange: (brief: HouseBrief) => void;
  showPresets?: boolean;
}) {
  const patch = (value: Partial<HouseBrief>) =>
    onChange({ ...brief, ...value });
  const choices = <T extends string | number>(
    label: string,
    values: { id: T; name: string }[],
    selected: T,
    change: (v: T) => void,
  ) => (
    <fieldset className="house-choice">
      <legend>{label}</legend>
      <div>
        {values.map((item) => (
          <button
            type="button"
            className={selected === item.id ? "selected" : ""}
            aria-pressed={selected === item.id}
            key={item.id}
            onClick={() => change(item.id)}
          >
            {item.name}
            {selected === item.id && <Check size={13} />}
          </button>
        ))}
      </div>
    </fieldset>
  );
  const palette = (
    label: string,
    colors: ColorId[],
    selected: ColorId,
    change: (v: ColorId) => void,
  ) => (
    <fieldset className="house-choice">
      <legend>{label}</legend>
      <div className="house-palette">
        {colors.map((color) => (
          <button
            type="button"
            className={selected === color ? "selected" : ""}
            aria-label={`${label}: ${COLORS[color].name}`}
            aria-pressed={selected === color}
            key={color}
            onClick={() => change(color)}
          >
            <i style={{ background: COLORS[color].hex }} />
            {COLORS[color].name}
            {selected === color && <Check size={13} />}
          </button>
        ))}
      </div>
    </fieldset>
  );
  return (
    <section className="house-brief-editor" aria-label="House description">
      <div className="house-section-title">
        <SlidersHorizontal size={19} />
        <h2>Shape your little house</h2>
        <span className="tag">Editable</span>
      </div>
      {showPresets && (
        <div className="house-presets">
          {HOUSE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() =>
                onChange({ ...p.brief, observations: [], uncertainties: [] })
              }
            >
              <House size={18} />
              <strong>{p.name}</strong>
              <span>
                {p.brief.roof === "flat" ? "Flat roof" : "Stepped roof"} ·{" "}
                {p.brief.height}
              </span>
            </button>
          ))}
        </div>
      )}
      <p className="field-description">
        Change the proportions and features. These choices generate real
        placements, parts and instructions.
      </p>
      <fieldset className="house-ratio">
        <legend>Width compared with depth</legend>
        <div>
          <span>Deeper</span>
          <output>{brief.aspectRatio.toFixed(2)} : 1</output>
          <span>Wider</span>
        </div>
        <input
          type="range"
          min="0.75"
          max="3"
          step="0.05"
          aria-label="House width to depth ratio"
          value={brief.aspectRatio}
          onChange={(e) => patch({ aspectRatio: Number(e.target.value) })}
        />
      </fieldset>
      {choices(
        "Building height",
        [
          { id: "low", name: "Low" },
          { id: "standard", name: "Balanced" },
          { id: "tall", name: "Tall" },
        ],
        brief.height,
        (height) => patch({ height: height as HouseBrief["height"] }),
      )}
      {choices(
        "Roof shape",
        [
          { id: "stepped", name: "Stepped gable" },
          { id: "flat", name: "Flat roof" },
        ],
        brief.roof,
        (roof) => patch({ roof: roof as HouseBrief["roof"] }),
      )}
      {palette(
        "Wall color",
        ["sand", "white", "stone", "wood"],
        brief.wallColor,
        (wallColor) =>
          patch({ wallColor: wallColor as HouseBrief["wallColor"] }),
      )}
      {palette(
        "Roof color",
        ["roof", "black", "stone", "white"],
        brief.roofColor,
        (roofColor) =>
          patch({ roofColor: roofColor as HouseBrief["roofColor"] }),
      )}
      {palette(
        "Door color",
        ["wood", "black", "white"],
        brief.doorColor,
        (doorColor) =>
          patch({ doorColor: doorColor as HouseBrief["doorColor"] }),
      )}
      {choices(
        "Front window groups",
        [
          { id: 0, name: "None" },
          { id: 1, name: "One" },
          { id: 2, name: "Two" },
        ],
        brief.frontWindows,
        (frontWindows) => patch({ frontWindows: frontWindows as 0 | 1 | 2 }),
      )}
      <div className="house-feature-toggles">
        {(
          [
            { key: "rearWindows", name: "Rear windows" },
            { key: "chimney", name: "Chimney" },
            { key: "garden", name: "Garden" },
          ] as const
        ).map((feature) => (
          <label
            className={brief[feature.key] ? "selected" : ""}
            key={feature.key}
          >
            <input
              type="checkbox"
              checked={brief[feature.key]}
              onChange={(e) => patch({ [feature.key]: e.target.checked })}
            />
            <span>{feature.name}</span>
            <Check size={15} />
          </label>
        ))}
      </div>
      {!!brief.observations.length && (
        <div className="house-observations">
          <strong>
            <Layers size={16} />
            What the photos suggest · {brief.confidence} confidence
          </strong>
          <ul>
            {brief.observations.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </div>
      )}
      {!!brief.uncertainties.length && (
        <div className="house-uncertainties">
          <strong>Check these before generating</strong>
          <ul>
            {brief.uncertainties.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="field-description">
        Simple rectangular houses only. Dimensions are snapped to the stud grid;
        fitted windows appear in Normal and Hard detail. Digital checks do not
        establish physical strength.
      </p>
    </section>
  );
}

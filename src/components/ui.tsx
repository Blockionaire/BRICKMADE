"use client";

import { useEffect, useRef, useId, type ReactNode } from "react";
import {
  X,
  ArrowLeft,
  ArrowRight,
  Layers,
  Clock3,
  Ruler,
  Signal,
} from "lucide-react";
import Link from "next/link";
import { CATALOG, COLORS } from "@/domain/catalog";
import type { HouseModel, PartQuantity } from "@/domain/types";

export function PageHeading({
  eyebrow,
  title,
  description,
  back,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  back?: string;
}) {
  return (
    <div className="page-heading">
      {back && (
        <Link className="back-link" href={back}>
          <ArrowLeft size={16} /> Back
        </Link>
      )}
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
  );
}

export function ActionLink({
  href,
  children,
  secondary = false,
}: {
  href: string;
  children: ReactNode;
  secondary?: boolean;
}) {
  return (
    <Link
      className={`button ${secondary ? "button-secondary" : "button-primary"}`}
      href={href}
    >
      {children}
      <ArrowRight size={17} />
    </Link>
  );
}

export function ModelStats({ model }: { model: HouseModel }) {
  const s = model.stats;
  return (
    <div className="model-stats">
      <div>
        <Layers size={17} />
        <strong>{s.pieceCount.toLocaleString()}</strong>
        <span>pieces</span>
      </div>
      <div>
        <Clock3 size={17} />
        <strong>{Math.round((s.buildMinutes / 60) * 10) / 10} hrs</strong>
        <span>estimated build</span>
      </div>
      <div>
        <Ruler size={17} />
        <strong>
          {s.dimensions[0]} × {s.dimensions[1]}
        </strong>
        <span>cm footprint</span>
      </div>
      <div>
        <Signal size={17} />
        <strong>{s.difficulty}</strong>
        <span>difficulty</span>
      </div>
    </div>
  );
}

export function PartIllustration({
  partId,
  color,
  small = false,
}: {
  partId: string;
  color: PartQuantity["color"];
  small?: boolean;
}) {
  const part = CATALOG[partId];
  const fill = COLORS[color].hex;
  const tall = part.category === "Brick" ? 22 : 9;
  const w = part.width >= 4 ? 66 : part.width === 2 ? 48 : 33;
  const d = part.depth === 2 ? 27 : 17;
  const x = (100 - w - d) / 2;
  const y = 23;
  return (
    <svg
      className={`part-illustration ${small ? "small" : ""}`}
      viewBox="0 0 100 82"
      role="img"
      aria-label={`${COLORS[color].name} ${part.name}`}
    >
      <ellipse
        cx="50"
        cy={y + d + tall + 7}
        rx="34"
        ry="5"
        fill="#2d281c"
        opacity=".07"
      />
      <path d={`M${x} ${y + d}l${w} 0v${tall}l-${w} 0z`} fill={fill} />
      <path
        d={`M${x + w} ${y + d}l${d} -${d}v${tall}l-${d} ${d}z`}
        fill={fill}
        style={{ filter: "brightness(.76)" }}
      />
      <path
        d={`M${x} ${y + d}l${d} -${d}h${w}l-${d} ${d}z`}
        fill={fill}
        style={{ filter: "brightness(1.15)" }}
      />
      {part.studs &&
        Array.from({ length: part.width * part.depth }, (_, i) => {
          const col = i % part.width;
          const row = Math.floor(i / part.width);
          const cx =
            x + ((col + 0.5) * w) / part.width + ((row + 0.5) * d) / part.depth;
          const cy = y + d - ((row + 0.5) * d) / part.depth;
          return (
            <g key={i}>
              <ellipse cx={cx} cy={cy} rx="5.2" ry="3" fill={fill} />
              <rect
                x={cx - 5.2}
                y={cy - 3}
                width="10.4"
                height="3"
                fill={fill}
              />
              <ellipse
                cx={cx}
                cy={cy - 3}
                rx="5.2"
                ry="3"
                fill={fill}
                style={{ filter: "brightness(1.24)" }}
              />
            </g>
          );
        })}
    </svg>
  );
}

export function PartCard({
  part,
  onClick,
}: {
  part: PartQuantity;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="part-render">
        <PartIllustration partId={part.partId} color={part.color} />
      </span>
      <span className="part-card-text">
        <strong>{CATALOG[part.partId].name}</strong>
        <span>{COLORS[part.color].name}</span>
        <small>#{part.partId}</small>
      </span>
      <span className="quantity">×{part.quantity}</span>
    </>
  );
  return onClick ? (
    <button className="part-card" onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className="part-card">{content}</div>
  );
}

export function Sheet({
  title,
  children,
  onClose,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
    };
  }, []);
  return (
    <dialog
      className={`sheet ${className}`}
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet-inner">
        <div className="sheet-handle" />
        <div className="sheet-heading">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

import { CATALOG, COLORS } from "@/domain/catalog";
import type { HouseModel } from "@/domain/types";

// Isometric projection of the very same placements used by the 3D viewer.
// SVG avoids starting a separate WebGL renderer for every saved build card.
export function ModelThumbnail({
  model,
  name,
}: {
  model: HouseModel;
  name: string;
}) {
  const project = (x: number, y: number, z: number) => [
    (x - z) * 0.86,
    (x + z) * 0.43 - y * 1.05,
  ];
  const pieces = [...model.placements].sort(
    (a, b) =>
      a.position[0] + a.position[2] - b.position[0] - b.position[2] ||
      a.position[1] - b.position[1],
  );
  const faces = pieces.map((p) => {
    const part = CATALOG[p.partId];
    const w = (p.rotated ? part.depth : part.width) / 2 - 0.025;
    const d = (p.rotated ? part.width : part.depth) / 2 - 0.025;
    const [x, y, z] = p.position;
    const top = y + part.height / 2 - 0.015;
    const bottom = y - part.height / 2 + 0.015;
    const vertices = [
      project(x - w, top, z - d),
      project(x + w, top, z - d),
      project(x + w, top, z + d),
      project(x - w, top, z + d),
    ];
    return {
      p,
      part,
      vertices,
      right: [
        vertices[1],
        vertices[2],
        project(x + w, bottom, z + d),
        project(x + w, bottom, z - d),
      ],
      front: [
        vertices[2],
        vertices[3],
        project(x - w, bottom, z + d),
        project(x + w, bottom, z + d),
      ],
    };
  });
  const all = faces.flatMap((f) => [...f.vertices, ...f.front, ...f.right]);
  const minX = Math.min(...all.map((v) => v[0])) - 2;
  const minY = Math.min(...all.map((v) => v[1])) - 2;
  const width = Math.max(...all.map((v) => v[0])) - minX + 2;
  const height = Math.max(...all.map((v) => v[1])) - minY + 2;
  const points = (vertices: number[][]) =>
    vertices.map((v) => v.join(",")).join(" ");
  return (
    <svg
      className="model-thumbnail"
      viewBox={`${minX} ${minY} ${width} ${height}`}
      role="img"
      aria-label={`${name} brick model, ${model.stats.pieceCount} pieces`}
      data-total-pieces={model.stats.pieceCount}
    >
      {faces.map(({ p, part, vertices, front, right }) => (
        <g
          key={p.id}
          data-piece-id={p.id}
          fill={COLORS[p.color].hex}
          stroke="#463c2d"
          strokeOpacity=".22"
          strokeWidth=".04"
          strokeLinejoin="round"
        >
          <polygon points={points(right)} />
          <polygon
            points={points(right)}
            fill="#000"
            opacity=".18"
            stroke="none"
          />
          <polygon points={points(front)} />
          <polygon
            points={points(front)}
            fill="#000"
            opacity=".08"
            stroke="none"
          />
          <polygon points={points(vertices)} />
          {part.studs &&
            Array.from({ length: part.width * part.depth }, (_, i) => {
              const dx = (i % part.width) + 0.5 - part.width / 2;
              const dz = Math.floor(i / part.width) + 0.5 - part.depth / 2;
              const [cx, cy] = project(
                p.position[0] + (p.rotated ? dz : dx),
                p.position[1] + part.height / 2 + 0.08,
                p.position[2] + (p.rotated ? -dx : dz),
              );
              return <ellipse key={i} cx={cx} cy={cy} rx=".25" ry=".13" />;
            })}
        </g>
      ))}
    </svg>
  );
}

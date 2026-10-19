#!/usr/bin/env python3
"""Resolve LDCad shadow-library snap metadata for official LDraw parts.

The LDCad Shadow Library (CC BY-SA 4.0, https://github.com/RolandMelkert/LDCadShadowLibrary)
adds "0 !LDCAD SNAP_*" meta lines to LDraw files. A part's connections are the snaps
of its own shadow file plus those inherited through its LDraw sub-file tree and
SNAP_INCL references, minus SNAP_CLEAR removals. This module only resolves that
metadata into part coordinates (LDraw units, LDraw axes); BrickMade verifies every
resulting connector against real geometry before use.
"""
import math
import re
from pathlib import Path

META = re.compile(r"^\s*0\s+!LDCAD\s+(SNAP_[A-Z]+)\s*(.*)$")
PARAM = re.compile(r"\[\s*([A-Za-z]+)\s*=\s*([^\]]*)\]")
IDENTITY = ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0))


def matmul(a, b):
    return tuple(tuple(sum(a[r][k] * b[k][c] for k in range(3)) for c in range(3)) for r in range(3))


def apply(m, v):
    return tuple(sum(m[r][c] * v[c] for c in range(3)) for r in range(3))


def add(a, b):
    return tuple(x + y for x, y in zip(a, b))


def load_shadow(directory):
    """Map lower-case LDraw-relative paths (parts/x.dat, p/x.dat) to shadow text."""
    shadow = {}
    root = Path(directory)
    for folder in ("parts", "p"):
        for path in (root / folder).rglob("*.dat"):
            rel = folder + "/" + path.relative_to(root / folder).as_posix()
            shadow[rel.lower()] = path.read_text(encoding="utf-8", errors="replace")
    return shadow


def parse_params(text):
    return {k.lower(): v.strip() for k, v in PARAM.findall(text)}


def floats(text, n):
    values = [float(x) for x in text.split()]
    if len(values) != n:
        raise ValueError(f"Expected {n} numbers: {text}")
    return values


def grid_offsets(spec):
    """'C 2 1 20 0' → centred 2 along x, 1 along z, 20/0 LDU steps."""
    if not spec:
        return [(0.0, 0.0, 0.0)]
    tokens = spec.split()
    counts, centred = [], []
    i = 0
    while len(counts) < 2:
        if tokens[i].upper() == "C":
            centred.append(True)
            i += 1
        else:
            centred.append(False)
        counts.append(int(tokens[i]))
        i += 1
    steps = [float(tokens[i]), float(tokens[i + 1])]
    axes = []
    for count, centre, step in zip(counts, centred, steps):
        start = -(count - 1) * step / 2 if centre else 0.0
        axes.append([start + n * step for n in range(count)])
    return [(x, 0.0, z) for x in axes[0] for z in axes[1]]


def parse_sections(text):
    tokens = text.split()
    if len(tokens) % 3:
        raise ValueError("Bad section list " + text)
    return [
        {"shape": tokens[i].upper(), "radius": float(tokens[i + 1]), "length": float(tokens[i + 2])}
        for i in range(0, len(tokens), 3)
    ]


class Resolver:
    def __init__(self, files, shadow):
        self.files = files  # lower-case path -> (original path, bytes)
        self.shadow = shadow
        self.cache = {}

    def locate(self, ref, parent):
        ref = ref.replace("\\", "/").lower()
        for candidate in ("parts/" + ref, "p/" + ref, ref, str(Path(parent).parent / ref).lower()):
            if candidate in self.files or candidate in self.shadow:
                return candidate
        return None

    def own_meta(self, path):
        """Snap meta lines from the shadow file, then any in the official file itself."""
        lines = []
        for source in (self.shadow.get(path, ""), self.files.get(path, (None, b""))[1].decode("utf-8", "replace")):
            for line in source.splitlines():
                m = META.match(line)
                if m:
                    lines.append((m.group(1), parse_params(m.group(2))))
        return lines

    def snaps(self, path, depth=0):
        """All snaps of an LDraw file in its own coordinates (cached)."""
        if path in self.cache:
            return self.cache[path]
        if depth > 40:
            raise ValueError("Snap include depth exceeded at " + path)
        own, cleared, includes = [], [], []
        for kind, p in self.own_meta(path):
            if kind == "SNAP_CLEAR":
                cleared.append(p.get("id", "").lower() or None)
            elif kind == "SNAP_INCL":
                includes.append(p)
            elif kind in ("SNAP_CYL", "SNAP_CLP", "SNAP_FGR", "SNAP_GEN"):
                own.extend(self.expand(kind, p, path))
        inherited = []
        for inc in includes:
            target = self.locate(inc.get("ref", ""), path)
            if not target:
                continue
            base = self.snaps(target, depth + 1)
            m = self.matrix(inc)
            for off in grid_offsets(inc.get("grid")):
                pos = add(self.vector(inc.get("pos")), apply(m, off))
                inherited.extend(self.transform(s, m, pos) for s in base)
        # Geometry sub-files contribute their snaps too (e.g. stud.dat gives studs).
        data = self.files.get(path)
        if data:
            for line in data[1].decode("utf-8", "replace").splitlines():
                if not re.match(r"^\s*1\s+", line):
                    continue
                tokens = line.split(maxsplit=14)
                if len(tokens) < 15:
                    continue
                target = self.locate(tokens[14].strip(), path)
                if not target:
                    continue
                t = tuple(map(float, tokens[2:5]))
                a = list(map(float, tokens[5:14]))
                m = (tuple(a[0:3]), tuple(a[3:6]), tuple(a[6:9]))
                inherited.extend(self.transform(s, m, t) for s in self.snaps(target, depth + 1))
        if cleared:
            clear_all = None in cleared
            inherited = [s for s in inherited if not clear_all and (s.get("id") or "").lower() not in cleared]
        result = own + inherited
        self.cache[path] = result
        return result

    @staticmethod
    def vector(text):
        return tuple(floats(text, 3)) if text else (0.0, 0.0, 0.0)

    @staticmethod
    def matrix(p):
        if not p.get("ori"):
            return IDENTITY
        v = floats(p["ori"], 9)
        return (tuple(v[0:3]), tuple(v[3:6]), tuple(v[6:9]))

    def expand(self, kind, p, path):
        m = self.matrix(p)
        base = self.vector(p.get("pos"))
        out = []
        for off in grid_offsets(p.get("grid")):
            snap = {
                "type": kind[5:].lower(),
                "id": p.get("id"),
                "group": p.get("group"),
                "gender": (p.get("gender") or "").upper() or None,
                "caps": (p.get("caps") or "one").lower(),
                "slide": (p.get("slide") or "false").lower() == "true",
                "center": (p.get("center") or "false").lower() == "true",
                "source": path,
                "pos": add(base, apply(m, off)),
                "matrix": m,
            }
            if kind == "SNAP_CYL":
                snap["sections"] = parse_sections(p.get("secs", ""))
            elif kind == "SNAP_CLP":
                snap["radius"] = float(p.get("radius", "4"))
                snap["length"] = float(p.get("length", "8"))
                snap["gender"] = "F"
            elif kind == "SNAP_FGR":
                snap["radius"] = float(p.get("radius", "4"))
                snap["seq"] = [float(x) for x in p.get("seq", "").split()]
            elif kind == "SNAP_GEN":
                snap["bounding"] = p.get("bounding")
            out.append(snap)
        return out

    @staticmethod
    def transform(snap, m, t):
        s = dict(snap)
        s["pos"] = add(apply(m, snap["pos"]), t)
        s["matrix"] = matmul(m, snap["matrix"])
        return s


def describe(snap):
    """Axis (LDraw coordinates) along which the cylinder's sections run: local −Y."""
    m = snap["matrix"]
    axis = apply(m, (0.0, -1.0, 0.0))
    length = math.sqrt(sum(v * v for v in axis))
    scale = length
    return tuple(v / length for v in axis), scale

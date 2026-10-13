#!/usr/bin/env python3
"""Import a pinned, licensed LDraw snapshot; never promote geometry to buildable stock."""
import argparse
import collections
import hashlib
import json
import re
import sqlite3
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[2]
KNOWN_LICENSES = {
    "Redistributable under CCAL version 2.0 : see CAreadme.txt",
    "Licensed under CC BY 2.0 and CC BY 4.0 : see CAreadme.txt",
    "Licensed under CC BY 4.0 : see CAreadme.txt",
}


def header(text, directive):
    match = re.search(r"^0 " + re.escape(directive) + r"\s+(.+)$", text, re.MULTILINE)
    return match.group(1).strip() if match else ""


def tags_for(name, category, keywords):
    text = f"{name} {category} {keywords}".lower()
    tags = []
    if re.search(r"round|curved|sphere|cylinder|dish|cone|arch", text): tags.append("Rounded")
    if (category in ("Glass", "Windscreen", "Window") or "Windows" in category or name.startswith(("Glass", "Windscreen", "Window"))): tags.append("Glass & windows")
    if re.search(r"\bplant\b|flower|leaves|leaf|bamboo", text): tags.append("Plants & flowers")
    if category.startswith("Technic"): tags.append("Technic")
    if (category in ("Wheel", "Tyre") or "Wheels" in category or "Tyres" in category): tags.append("Wheels & tyres")
    if "pattern" in text or "print" in text or category.startswith("Sticker"): tags.append("Decorated")
    return tags


def parse_part(path, data):
    text = data.decode("utf-8-sig", errors="strict").replace("\r\n", "\n")
    lines = text.splitlines()
    if not lines or not lines[0].startswith("0 "): return None
    name = " ".join(lines[0][2:].split())
    org = header(text, "!LDRAW_ORG")
    # Assemblies, aliases, hidden helper shapes, unofficial submissions, and flexible
    # sections are not individual catalog entries. Dependencies stay separately indexed.
    if not re.fullmatch(r"Part UPDATE \d{4}-\d{2}", org) or name.startswith(("~", "=")): return None
    license_text = header(text, "!LICENSE")
    if license_text not in KNOWN_LICENSES: return None
    category = header(text, "!CATEGORY") or name.split()[0]
    keywords = header(text, "!KEYWORDS")
    return {
        "id": PurePosixPath(path).stem,
        "name": name,
        "category": category,
        "author": header(text, "Author:"),
        "license": "CC-BY-2.0 AND CC-BY-4.0" if "2.0 and CC BY 4.0" in license_text else "CC-BY-4.0" if "CC BY 4.0" in license_text else "CC-BY-2.0",
        "file": path,
        "sha256": hashlib.sha256(data).hexdigest(),
        "update": org.rsplit(" ", 1)[-1],
        "keywords": keywords,
        "tags": tags_for(name, category, keywords),
    }


def parse_colors(text):
    colors = []
    for line in text.splitlines():
        match = re.match(r"0 !COLOUR (\S+)\s+CODE\s+(\d+)\s+VALUE\s+(#[0-9A-Fa-f]{6})\s+EDGE\s+(#[0-9A-Fa-f]{6})(.*)", line)
        if not match or int(match[2]) in (16, 24): continue
        tail = match[5]
        alpha = re.search(r"\bALPHA\s+(\d+)", tail)
        colors.append({"id": int(match[2]), "name": match[1].replace("_", " "), "hex": match[3], "edge": match[4], "alpha": int(alpha[1]) if alpha else 255})
    return colors


def read_library(archive, tree=None):
    files = {}
    with zipfile.ZipFile(archive) as bundle:
        paths = set(bundle.namelist())
        roots = {str(PurePosixPath(name).parent) + "/" for name in paths if name.endswith("LDConfig.ldr")}
        roots = {prefix for prefix in roots if prefix + "CAlicense.txt" in paths and prefix + "CAreadme.txt" in paths}
        if len(roots) != 1: raise ValueError("Expected one licensed LDraw library root")
        prefix = next(iter(roots))
        expected = None
        if tree:
            document = json.loads(Path(tree).read_text())
            if document.get("truncated"): raise ValueError("Cannot verify a truncated source tree")
            expected = {item["path"]: item["sha"] for item in document["tree"] if item["type"] == "blob"}
        for item in bundle.infolist():
            if not item.filename.startswith(prefix) or item.is_dir(): continue
            path = item.filename[len(prefix):]
            if ".." in PurePosixPath(path).parts or path.startswith("/"): raise ValueError("Unsafe archive path")
            if not (path.endswith(".dat") or path in ("LDConfig.ldr", "CAlicense.txt", "CAlicense4.txt", "CAreadme.txt")): continue
            if item.file_size > 25_000_000: raise ValueError("Unexpectedly large library record")
            data = bundle.read(item)
            if expected is not None:
                git_hash = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
                if expected.get("/".join(PurePosixPath(item.filename).parts[1:])) != git_hash: raise ValueError(f"Source integrity mismatch: {path}")
            files[path.lower()] = (path, data)
    if not all(name in files for name in ("calicense.txt", "careadme.txt", "ldconfig.ldr")): raise ValueError("Missing license or color definitions")
    return files


def make_preview(part_id, files):
    """A self-contained MPD: original geometry and every recursive dependency."""
    included = {}
    active = set()
    def visit(path):
        key = path.lower()
        if key in active: raise ValueError(f"Cyclic geometry dependency: {path}")
        if key in included: return
        if key not in files: raise ValueError(f"Missing geometry dependency: {path}")
        canonical, data = files[key]
        text = data.decode("utf-8-sig").replace("\r\n", "\n")
        if header(text, "!LICENSE") not in KNOWN_LICENSES: raise ValueError(f"Unapproved dependency license: {canonical}")
        if "Unofficial" in header(text, "!LDRAW_ORG"): raise ValueError(f"Unofficial preview dependency: {canonical}")
        active.add(key)
        rewritten = []
        for line in text.splitlines():
            if re.match(r"^\s*1\s+", line):
                tokens = line.split(maxsplit=14)
                if len(tokens) != 15: raise ValueError(f"Malformed reference: {canonical}")
                ref = tokens[14].replace("\\", "/").lower()
                if ".." in PurePosixPath(ref).parts or ref.startswith("/"): raise ValueError("Unsafe geometry reference")
                candidates = ("parts/" + ref, "p/" + ref, ref, str(PurePosixPath(key).parent / ref))
                target = next((c for c in candidates if c in files), None)
                if target is None: raise ValueError(f"Missing reference {ref} in {canonical}")
                visit(target)
                tokens[14] = target
                line = " ".join(tokens)
            rewritten.append(line)
        active.remove(key)
        included[key] = "\n".join(rewritten)
    root = f"parts/{part_id}.dat"
    visit(root)
    main = f"0 FILE main.ldr\n0 BrickMade standalone preview; derived from The LDraw Parts Library\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 {root}\n0 NOFILE\n"
    document = main + "".join(f"0 FILE {path}\n{text}\n0 NOFILE\n" for path, text in included.items())
    return document, list(included)


def write_database(destination, source, parts, colors, files):
    destination.unlink(missing_ok=True)
    with sqlite3.connect(destination) as db:
        db.executescript('''
          PRAGMA foreign_keys = ON;
          CREATE TABLE sources(id TEXT PRIMARY KEY, metadata_json TEXT NOT NULL);
          CREATE TABLE parts(id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, author TEXT NOT NULL, license TEXT NOT NULL, geometry_file TEXT NOT NULL, geometry_sha256 TEXT NOT NULL, source_id TEXT REFERENCES sources(id), update_code TEXT, keywords TEXT, tags_json TEXT, connection_status TEXT NOT NULL CHECK(connection_status IN ('unverified','verified')));
          CREATE TABLE identifiers(part_id TEXT REFERENCES parts(id), system TEXT, value TEXT, status TEXT CHECK(status IN ('verified','unverified','ambiguous')), citation TEXT, PRIMARY KEY(part_id,system,value));
          CREATE TABLE colors(id INTEGER PRIMARY KEY, name TEXT, rgb TEXT, edge_rgb TEXT, alpha INTEGER, source_id TEXT REFERENCES sources(id));
          CREATE TABLE part_colors(part_id TEXT REFERENCES parts(id), color_id INTEGER REFERENCES colors(id), evidence TEXT NOT NULL, status TEXT CHECK(status IN ('observed','verified')), PRIMARY KEY(part_id,color_id));
          CREATE TABLE connections(part_id TEXT REFERENCES parts(id), connector_id TEXT, kind TEXT, local_frame_json TEXT, status TEXT CHECK(status IN ('unverified','verified')), PRIMARY KEY(part_id,connector_id));
          CREATE TABLE purchase_mappings(part_id TEXT REFERENCES parts(id), color_id INTEGER REFERENCES colors(id), provider TEXT, provider_part_id TEXT, provider_color_id TEXT, status TEXT CHECK(status IN ('verified','unverified','ambiguous')), citation TEXT NOT NULL, PRIMARY KEY(part_id,color_id,provider));
          CREATE TABLE geometry_files(path TEXT PRIMARY KEY, sha256 TEXT, author TEXT, license_header TEXT, organization TEXT);
          CREATE INDEX parts_category ON parts(category);
        ''')
        db.execute("INSERT INTO sources VALUES (?,?)", (source["sourceId"], json.dumps(source)))
        db.executemany("INSERT INTO parts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", [(p["id"],p["name"],p["category"],p["author"],p["license"],p["file"],p["sha256"],source["sourceId"],p["update"],p["keywords"],json.dumps(p["tags"]),"unverified") for p in parts])
        db.executemany("INSERT INTO identifiers VALUES (?,?,?,?,?)", [(p["id"],"ldraw",p["id"],"verified",source.get('recordBaseUrl',source['mirrorUrl'] + '/blob/' + source['revision'] + '/complete/ldraw/parts/') + p['id'] + '.dat') for p in parts])
        db.executemany("INSERT INTO colors VALUES (?,?,?,?,?,?)", [(c["id"],c["name"],c["hex"],c["edge"],c["alpha"],source["sourceId"]) for c in colors])
        rows=[]
        for path,data in files.values():
            if not path.endswith('.dat'): continue
            text=data.decode('utf-8-sig',errors='replace').replace('\r\n','\n')
            rows.append((path,hashlib.sha256(data).hexdigest(),header(text,"Author:"),header(text,"!LICENSE"),header(text,"!LDRAW_ORG")))
        db.executemany("INSERT INTO geometry_files VALUES (?,?,?,?,?)",rows)
        assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--source", type=Path, default=ROOT / "data/catalog/source.json")
    parser.add_argument("--tree", type=Path, help="GitHub tree JSON for independent per-file Git blob verification")
    parser.add_argument("--output", type=Path, default=ROOT / "public/catalog")
    parser.add_argument("--download", action="store_true", help="Download the pinned archive, with TLS verification")
    args = parser.parse_args()
    source=json.loads(args.source.read_text())
    if args.download:
        args.archive.parent.mkdir(parents=True,exist_ok=True)
        with urllib.request.urlopen(source["archiveUrl"],timeout=60) as response, args.archive.open('wb') as output:
            while chunk:=response.read(1024*1024): output.write(chunk)
    archive_sha=hashlib.sha256(args.archive.read_bytes()).hexdigest()
    if source.get('archiveSha256') and archive_sha!=source['archiveSha256']:raise ValueError('Archive does not match the pinned release checksum; review a new release before changing the source configuration')
    files=read_library(args.archive,args.tree)
    parts=[]; excluded=0
    for path,data in files.values():
        if path.startswith('parts/') and path.count('/')==1 and path.endswith('.dat'):
            part=parse_part(path,data)
            if part: parts.append(part)
            else: excluded+=1
    parts.sort(key=lambda p:(p['category'],p['name'],p['id']))
    if not parts: raise ValueError("No licensed, official catalog entries found")
    colors=parse_colors(files['ldconfig.ldr'][1].decode('utf-8-sig'))
    if not colors: raise ValueError("No render palette found")
    destination=args.output; (destination/'previews').mkdir(parents=True,exist_ok=True)
    previews=[]
    ids={p['id'] for p in parts}
    for selection in source['previewParts']:
        part_id=selection['id']
        if part_id not in ids: raise ValueError(f"Preview is not an approved catalog entry: {part_id}")
        document,dependencies=make_preview(part_id,files)
        (destination/'previews'/f'{part_id}.mpd').write_text(document)
        previews.append({**selection,'file':f'/catalog/previews/{part_id}.mpd','dependencyCount':len(dependencies),'sha256':hashlib.sha256(document.encode()).hexdigest()})
    for name in ('CAlicense.txt','CAlicense4.txt','CAreadme.txt'):
        if name.lower() in files:(destination/name).write_bytes(files[name.lower()][1])
    source={**source,'archiveSha256':hashlib.sha256(args.archive.read_bytes()).hexdigest(),'treeVerified':args.tree is not None}
    counts=collections.Counter(p['category'] for p in parts)
    manifest={"schemaVersion":1,"source":source,"partCount":len(parts),"categoryCount":len(counts),"colorCount":len(colors),"previewCount":len(previews),"excludedRootFiles":excluded,"categories":[{"name":name,"count":count} for name,count in sorted(counts.items())],"previews":previews,"manufacturedPartColorCount":0,"verifiedConnectionCount":0,"verifiedPurchaseMappingCount":0}
    index={"schemaVersion":1,"parts":[{key:p[key] for key in ('id','name','category','tags','author','update','keywords')} for p in parts],"colors":colors}
    (destination/'index.json').write_text(json.dumps(index,separators=(',',':'),ensure_ascii=False)+'\n')
    (destination/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    write_database(destination/'brickmade.sqlite',source,parts,colors,files)
    print(json.dumps({key:manifest[key] for key in ('partCount','categoryCount','colorCount','previewCount','excludedRootFiles')},indent=2))
    print('Written:',destination,'Source tree verified:',source['treeVerified'])

if __name__=='__main__': main()

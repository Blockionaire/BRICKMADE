#!/usr/bin/env python3
"""Package licensed geometry and conservative, auditable connector profiles.

Run AFTER the source imports. No catalogue name is treated as a connection rule.
Stud positions come from explicit LDraw stud primitives; underside sockets and
pin seating datums are individually curated below. These are geometry reviews,
not measurements, clutch-strength tests or whole-model validation.
"""
import argparse
import hashlib
import importlib.util
import json
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("ldraw_import", Path(__file__).with_name("import_ldraw.py"))
ldraw = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ldraw)

# (Rebrickable identity, LDraw identity, x studs, z studs, body height LDU).
# 3023.dat is an upstream move to 3023b, explicitly mapped rather than conflating IDs.
STANDARD = [
    ("3005","3005",1,1,24), ("3004","3004",2,1,24),
    ("3622","3622",3,1,24), ("3010","3010",4,1,24),
    ("3009","3009",6,1,24), ("3003","3003",2,2,24),
    ("3002","3002",3,2,24), ("3001","3001",4,2,24),
    ("2456","2456",6,2,24), ("3024","3024",1,1,8),
    ("3023","3023b",2,1,8), ("3623","3623",3,1,8),
    ("3710","3710",4,1,8), ("3666","3666",6,1,8),
    ("3460","3460",8,1,8), ("3022","3022",2,2,8),
    ("3020","3020",4,2,8), ("3795","3795",6,2,8),
    ("3034","3034",8,2,8), ("3031","3031",4,4,8),
    ("3035","3035",8,4,8), ("3070b","3070b",1,1,8),
    ("3068b","3068b",2,2,8),
]
# body centre is an explicit LDraw datum, not a mesh bounding-box recenter.
SPECIAL = {
    "6141": [0,4,0], "3062b": [0,12,0], "11477": [0,-8,0],
    "3039": [0,12,0], "3040b": [0,12,0], "3659": [0,12,0],
    "60601": [0,24,0], "60592": [0,24,0], "24866": [0,4,0],
    "2423": [0,4,0], "30176": [0,12,0], "3700": [0,12,0],
    "2780": [0,0,0], "3705": [0,0,0], "32002": [0,0,0],
    "3647": [0,0,0], "4624": [0,0,0], "4070": [0,12,0],
    "60470b": [0,4,0], "4032a": [0,4,0], "3941": [0,12,0],
    "3942c": [0,24,0], "4589": [0,12,0], "3678b": [0,24,0],
}
STUDS = {"stud.dat", "stud2.dat", "stud2a.dat", "stud10.dat"}

def matmul(a,b):
    return [[sum(a[r][k]*b[k][c] for k in range(3)) for c in range(3)] for r in range(3)]

def vec(m,v): return [sum(m[r][c]*v[c] for c in range(3)) for r in range(3)]
def add(a,b): return [x+y for x,y in zip(a,b)]
def point(v,center): return [round((v[0]-center[0])/20,6),round((center[1]-v[1])/20,6),round((center[2]-v[2])/20,6)]
def axis(v): return [round(v[0],6),round(-v[1],6),round(-v[2],6)]

def extract_studs(part_id,files,center):
    found=[]
    def visit(path,m,t,trail):
        if path in trail: raise ValueError("Cyclic connector dependency")
        text=files[path][1].decode("utf-8-sig")
        for line in text.splitlines():
            if not re.match(r"^\s*1\s+",line): continue
            tokens=line.split(maxsplit=14)
            ref=tokens[14].replace("\\","/").lower()
            candidates=("parts/"+ref,"p/"+ref,ref,str(Path(path).parent/ref))
            target=next((p for p in candidates if p in files),None)
            if target is None: raise ValueError(ref)
            translation=list(map(float,tokens[2:5]))
            a=list(map(float,tokens[5:14])); local=[a[:3],a[3:6],a[6:]]
            combined=matmul(m,local); offset=add(vec(m,translation),t)
            if Path(target).name in STUDS:
                # Reject scaled/deformed studs rather than manufacture a fit assumption.
                if any(abs(sum(combined[r][c]**2 for r in range(3))-1)>1e-5 for c in range(3)): continue
                if any(abs(sum(combined[r][a]*combined[r][b] for r in range(3)))>1e-5 for a,b in ((0,1),(0,2),(1,2))): continue
                found.append({"position":point(offset,center),"normal":axis(vec(combined,[0,-1,0])),"evidenceFile":path,"primitive":target})
            else: visit(target,combined,offset,trail+[path])
    visit("parts/"+part_id+".dat",[[1,0,0],[0,1,0],[0,0,1]],[0,0,0],[])
    # A repeated primitive reference is not a second physical connector.
    unique={json.dumps([p["position"],p["normal"]]):p for p in found}
    return list(unique.values())

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive",type=Path,required=True)
    args=parser.parse_args()
    source=json.loads((ROOT/"data/catalog/source.json").read_text())
    if hashlib.sha256(args.archive.read_bytes()).hexdigest()!=source["archiveSha256"]: raise ValueError("Pinned archive checksum mismatch")
    files=ldraw.read_library(args.archive,None)
    alias=files["parts/3023.dat"][1].decode("utf-8-sig")
    if "Moved to 3023b" not in alias or "3023b.dat" not in alias: raise ValueError("Review the explicit 3023 to 3023b geometry link")
    output=ROOT/"public/catalog"
    (output/"geometry").mkdir(exist_ok=True)
    profiles=[]
    selections=[(rb,ld,[0,h/2,0],(w,d,h)) for rb,ld,w,d,h in STANDARD]
    selections += [(ident,ident,center,None) for ident,center in SPECIAL.items()]
    rb_db=sqlite3.connect(output/"brickmade.sqlite")
    for rb,ident,center,grid in selections:
        part=ldraw.parse_part("parts/"+ident+".dat",files["parts/"+ident+".dat"][1])
        if not part: raise ValueError("Unapproved root "+ident)
        rb_name=rb_db.execute("SELECT name FROM rb_parts WHERE id=?",(rb,)).fetchone()
        if not rb_name: raise ValueError("Missing Rebrickable identity "+rb)
        document,deps=ldraw.make_preview(ident,files)
        (output/"geometry"/(ident+".mpd")).write_text(document)
        # Also make existing catalog browsing benefit from the larger packaged selection.
        (output/"previews"/(ident+".mpd")).write_text(document)
        connectors=[]
        def connector(kind,pos,normal,evidence,**extra):
            connectors.append({"id":f"{kind}-{len(connectors)+1}","kind":kind,"position":pos,"normal":normal,"status":"geometry-reviewed","evidence":evidence,**extra})
        for stud in extract_studs(ident,files,center):
            connector("stud",stud["position"],stud["normal"],{"file":stud["evidenceFile"],"primitive":stud["primitive"],"method":"explicit unit-scale LDraw stud reference"},radius=0.3,depth=0.2)
        sockets=[]
        if grid:
            w,d,h=grid
            sockets=[[(x+.5-w/2)*20,h,(z+.5-d/2)*20] for x in range(w) for z in range(d)]
        # Individually reviewed non-rectangular underside footprints. Deliberately
        # leave other mechanisms unknown, including window-pane pegs, clips, axles.
        if ident in ("6141","3062b","4070","30176"): sockets=[[0,center[1]*2,0]]
        if ident=="3659": sockets=[[-30,24,0],[30,24,0]] # arch void is NOT a socket
        if ident=="3700": sockets=[[-10,24,0],[10,24,0]]
        if ident=="60592": sockets=[[-10,48,0],[10,48,0]]
        if ident in ("24866","2423"): sockets=[[0,8,0]]
        if ident=="11477": sockets=[[0,0,-10]] # only the full-depth rear socket
        if ident=="3039": sockets=[[x,24,z] for x in (-10,10) for z in (0,-20)]
        if ident=="3040b": sockets=[[0,24,z] for z in (0,-20)]
        if ident=="60470b": sockets=[[-10,8,0],[10,8,0]]
        if ident in ("4032a","3941"): sockets=[[x,center[1]*2,z] for x in (-10,10) for z in (-10,10)]
        for socket in sockets:
            connector("anti-stud",point(socket,center),[0,-1,0],{"file":"parts/"+ident+".dat","method":"curated underside seating plane and clutch footprint"},radius=0.3,depth=0.2)
        if ident=="3700":
            for z in (-10,10):
                connector("pin-hole",point([0,10,z],center),axis([0,0,z/10]),{"file":"parts/3700.dat","primitive":"p/peghole.dat","method":"6 LDU shaft bore; recessed collar seat is 8 LDU radius and 2 LDU deep; 20 LDU through-hole"},radius=0.3,depth=1.0,collarRadius=0.4,collarDepth=0.1,channel="through-z")
        if ident=="2780":
            for sign in (-1,1):
                # The inner HALF of the split collar seats in peghole's 2 LDU
                # recess. Its centre, not its outer face, meets the brick face.
                connector("pin",point([0,0,0],center),[sign,0,0],{"file":"parts/2780.dat","primitive":"p/confric5.dat","method":"split collar centre seats at exterior hole plane; inner half occupies 8 LDU radius / 2 LDU recess; 20 LDU insertion"},radius=0.3,depth=1.0,collarRadius=0.4,collarDepth=0.1)
        profile={"id":ident,"rebrickableId":rb,"name":part["name"],"rebrickableName":rb_name[0],"category":part["category"],"tags":part["tags"],"centerLdu":center,"bodySize":[grid[0],grid[2]/20,grid[1]] if grid else None,"connectors":connectors,"coverage":"partial" if not grid else "stud-system","unknownMechanisms":[] if grid else ["Unlisted mating features are unsupported; no fit is inferred from the shape."],"source":{"file":part["file"],"sha256":part["sha256"],"author":part["author"],"license":part["license"],"url":source["recordBaseUrl"]+ident+".dat"},"geometryFile":"/catalog/geometry/"+ident+".mpd","geometrySha256":hashlib.sha256(document.encode()).hexdigest(),"dependencyCount":len(deps)}
        profiles.append(profile)
    rb_db.close()
    manifest={"schemaVersion":1,"units":{"studMillimetres":8,"lduMillimetres":0.4,"lduPerStud":20,"brickHeightLdu":24,"plateHeightLdu":8,"coordinateSystem":"right-handed Y-up; LDraw rotated 180 degrees about X, uniformly scaled by 1/20, then offset by explicit body datum"},"source":source,"profileVersion":"2026-10-14.1","connectionStatus":"geometry-reviewed; not physically certified","parts":profiles}
    (output/"builder-parts.json").write_text(json.dumps(manifest,indent=2)+"\n")
    # Dedicated namespaced application tables, never upgrade upstream verified flags.
    with sqlite3.connect(output/"brickmade.sqlite") as db:
        db.execute("PRAGMA foreign_keys=ON")
        db.executescript("DROP TABLE IF EXISTS builder_connectors; DROP TABLE IF EXISTS builder_parts; CREATE TABLE builder_parts(ldraw_id TEXT PRIMARY KEY REFERENCES parts(id), rebrickable_id TEXT REFERENCES rb_parts(id), profile_json TEXT NOT NULL, status TEXT NOT NULL CHECK(status='geometry-reviewed')); CREATE TABLE builder_connectors(ldraw_id TEXT REFERENCES builder_parts(ldraw_id), connector_id TEXT, kind TEXT, connector_json TEXT NOT NULL, status TEXT NOT NULL CHECK(status='geometry-reviewed'), PRIMARY KEY(ldraw_id,connector_id));")
        for p in profiles:
            db.execute("INSERT INTO builder_parts VALUES (?,?,?,?)",(p["id"],p["rebrickableId"],json.dumps(p),"geometry-reviewed"))
            for c in p["connectors"]: db.execute("INSERT INTO builder_connectors VALUES (?,?,?,?,?)",(p["id"],c["id"],c["kind"],json.dumps(c),c["status"]))
        assert not db.execute("PRAGMA foreign_key_check").fetchall()
    catalog_manifest=json.loads((output/"manifest.json").read_text())
    previous={p["id"]:p for p in catalog_manifest["previews"]}
    for p in profiles:
        previous[p["id"]]={"id":p["id"],"color":previous.get(p["id"],{}).get("color",71),"file":"/catalog/previews/"+p["id"]+".mpd","dependencyCount":p["dependencyCount"],"sha256":p["geometrySha256"]}
    catalog_manifest["previews"]=list(previous.values());catalog_manifest["previewCount"]=len(previous)
    catalog_manifest["reviewedBuilderPartCount"]=len(profiles)
    catalog_manifest["reviewedConnectorCount"]=sum(len(p["connectors"]) for p in profiles)
    (output/"manifest.json").write_text(json.dumps(catalog_manifest,indent=2)+"\n")
    links={"status":"geometry-reviewed illustration links; not provider buying mappings","links":[{"rebrickablePartId":p["rebrickableId"],"ldrawPartId":p["id"]} for p in profiles]}
    (ROOT/"data/catalog/render-links.json").write_text(json.dumps(links,indent=2)+"\n")
    print(json.dumps({"builderParts":len(profiles),"connectors":sum(len(p["connectors"]) for p in profiles)},indent=2))

if __name__=="__main__": main()

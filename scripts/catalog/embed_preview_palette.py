#!/usr/bin/env python3
"""Add only referenced fixed LDraw colors to standalone previews; preserve original subfiles."""
import hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]/'public/catalog'
palette={c['id']:c for c in json.loads((ROOT/'index.json').read_text())['colors']}
manifest=json.loads((ROOT/'manifest.json').read_text())
for preview in manifest['previews']:
 p=ROOT/'previews'/f"{preview['id']}.mpd";text=p.read_text()
 text=re.sub(r'^0 !COLOUR BRICKMADE_LDRAW_SOURCE_.*\n','',text,flags=re.M)
 ids=set()
 for line in text.splitlines():
  if re.match(r'^[1-5]\s',line):
   token=line.split()[1]
   if token.isdecimal() and int(token) not in (16,24):ids.add(int(token))
 missing=ids-palette.keys()
 if missing:raise ValueError(f'Unknown source palette colors {missing}: {preview["id"]}')
 headers='\n'.join(f"0 !COLOUR BRICKMADE_LDRAW_SOURCE_{ident} CODE {ident} VALUE {palette[ident]['hex']} EDGE {palette[ident]['edge']} ALPHA {palette[ident]['alpha']}" for ident in sorted(ids))
 if headers:text=text.replace('0 FILE main.ldr\n',f'0 FILE main.ldr\n{headers}\n',1)
 p.write_text(text);preview['sha256']=hashlib.sha256(text.encode()).hexdigest()
(ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')

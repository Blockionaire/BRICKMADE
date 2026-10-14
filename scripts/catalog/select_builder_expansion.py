#!/usr/bin/env python3
"""Freeze a source-backed shortlist, not connector admissions. Every port is audited later."""
import collections,json,re,sqlite3
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def dims(name):
 m=re.search(r'(\d+(?:\.\d+)?) x (\d+(?:\.\d+)?)',name)
 return sorted(map(float,m.groups())) if m else None

def select():
 db=sqlite3.connect(ROOT/'public/catalog/brickmade.sqlite')
 core={p['id'] for p in json.loads((ROOT/'public/catalog/builder-parts.json').read_text())['parts'] if p.get('batch','core')=='core'}
 rows=db.execute('SELECT p.id,p.name,p.category,r.name,COALESCE((SELECT SUM(inventory_lot_count) FROM rb_part_color_observations o WHERE o.part_num=r.id),0) FROM parts p JOIN rb_parts r ON r.id=p.id').fetchall()
 quotas={'Brick':45,'Plate':55,'Tile':28,'Slope':65,'Arch':18,'Window':12,'Panel':18,'Plant':14,'Wedge':25}
 selected=[];excluded=[]
 for category,quota in quotas.items():
  matches=[]
  for ident,name,cat,rb_name,popularity in rows:
   if cat!=category or ident in core:continue
   if not re.fullmatch(r'\d+[a-z]?',ident) or re.search(r'Pattern|Sticker|^~|^=|Moved|Assembly|Duplo|Fabuland|Electric|Conductive|Magnet',name):continue
   footprint=dims(name);rb_footprint=dims(rb_name)
   if footprint!=rb_footprint:
    excluded.append({'id':ident,'reason':'source identity footprint mismatch','ldrawName':name,'rebrickableName':rb_name});continue
   if footprint and (max(footprint)>10 or footprint[0]*footprint[1]>32):continue
   matches.append((ident,name,rb_name,popularity))
  matches.sort(key=lambda p:(-p[3],p[0]))
  for ident,name,rb_name,popularity in matches[:quota]:
   grid=None
   pure=re.fullmatch(r'(Brick|Plate|Tile) (\d+) x (\d+)(?: x (\d+(?:\.\d+)?))?(?: with Groove)?',name)
   if pure:
    kind,a,b,h=pure.groups();height=24*float(h or 1) if kind=='Brick' else 8
    if height<=72 and height%1==0:grid=[max(int(a),int(b)),min(int(a),int(b)),int(height)]
   selected.append({'rebrickableId':ident,'ldrawId':ident,'ldrawName':name,'rebrickableName':rb_name,'category':category,'selectionEvidence':'matching source identity and footprint; undecorated official part; historical inventory frequency','inventoryLotCount':popularity,'grid':grid,'centerLdu':[0,grid[2]/2,0] if grid else [0,0,0]})
 result={'schemaVersion':1,'batch':'builder-expansion-2026-10-14','sourceRevision':'2026-09','status':'shortlist; ports require geometric witnesses before admission','entries':selected,'excludedIdentityLinks':excluded}
 target=ROOT/'data/catalog/builder-expansion.json';target.write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps({'additional':len(selected),'byCategory':dict(collections.Counter(p['category'] for p in selected)),'identityMismatches':len(excluded)},indent=2))
if __name__=='__main__':select()

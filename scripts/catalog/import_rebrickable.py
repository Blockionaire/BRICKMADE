#!/usr/bin/env python3
"""Import official Rebrickable bulk CSVs, at most once per 24 hours per file."""
import argparse
import collections
import csv
import datetime
import gzip
import email.utils
import hashlib
import json
import re
import sqlite3
import urllib.request
from pathlib import Path
from import_ldraw import ROOT, tags_for

FILES = ('parts','colors','part_categories','part_relationships','elements','inventory_parts')
PERMISSION = 'You can use these files for any purpose, including commercial, provided you acknowledge Rebrickable as your source of data.'


def rows(directory, name):
    with gzip.open(directory / (name+'.csv.gz'),'rt',encoding='utf-8-sig',newline='') as stream:
        yield from csv.DictReader(stream)


def download(directory):
    directory.mkdir(parents=True,exist_ok=True)
    now=datetime.datetime.now(datetime.timezone.utc)
    for name in FILES:
        destination=directory/(name+'.csv.gz')
        if destination.exists() and now.timestamp()-destination.stat().st_mtime < 86400:
            print('Using cached bulk file:',name)
            continue
        url='https://cdn.rebrickable.com/media/downloads/'+name+'.csv.gz'
        temporary=destination.with_suffix('.tmp')
        request=urllib.request.Request(url,headers={'User-Agent':'BrickMade catalog importer; bulk CSV only'})
        with urllib.request.urlopen(request,timeout=60) as response, temporary.open('wb') as output:
            while chunk:=response.read(1024*1024):output.write(chunk)
            metadata={'url':url,'lastModified':response.headers.get('Last-Modified'),'retrievedAt':now.isoformat(),'bytes':temporary.stat().st_size,'sha256':hashlib.sha256(temporary.read_bytes()).hexdigest()}
        metadata['bytes']=temporary.stat().st_size
        metadata['sha256']=hashlib.sha256(temporary.read_bytes()).hexdigest()
        # Check that a download really is a readable CSV before replacing the cache.
        with gzip.open(temporary,'rt') as stream:
            if not stream.readline().strip():raise ValueError('Empty CSV download')
        temporary.replace(destination)
        (directory/(name+'.source.json')).write_text(json.dumps(metadata,indent=2))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',type=Path,required=True)
    parser.add_argument('--output',type=Path,default=ROOT/'public/catalog')
    parser.add_argument('--download',action='store_true')
    args=parser.parse_args()
    if args.download:download(args.input)
    provenance=[]
    for name in FILES:
        path=args.input/(name+'.csv.gz')
        metadata_path=args.input/(name+'.source.json')
        if not path.exists() or not metadata_path.exists():raise ValueError('Missing bulk file or source record: '+name)
        metadata=json.loads(metadata_path.read_text())
        digest=hashlib.sha256(path.read_bytes()).hexdigest()
        if metadata.get('sha256') != digest:raise ValueError('Source integrity mismatch: '+name)
        provenance.append({'name':name,**metadata})
    snapshot_date=max(email.utils.parsedate_to_datetime(item['lastModified']).date() for item in provenance if item.get('lastModified')).isoformat()
    categories={int(r['id']):r['name'] for r in rows(args.input,'part_categories')}
    colors=[{'id':int(r['id']),'name':r['name'],'hex':'#'+r['rgb'],'edge':'#333333','alpha':128 if r['is_trans']=='True' else 255,'placeholder':r['id'].startswith('-') or r['name'].startswith('[')} for r in rows(args.input,'colors')]
    allowed_colors={c['id'] for c in colors if not c['placeholder']}
    parts={r['part_num']:r for r in rows(args.input,'parts')}
    elements=list(rows(args.input,'elements'))
    relationships=list(rows(args.input,'part_relationships'))
    observations=collections.Counter()
    element_pairs=set()
    element_counts=collections.Counter()
    for row in elements:
        part=row['part_num'];color=int(row['color_id'])
        if part in parts and color in allowed_colors:
            element_pairs.add((part,color));element_counts[part]+=1
    inventory_rows=0
    for row in rows(args.input,'inventory_parts'):
        inventory_rows+=1
        part=row['part_num'];color=int(row['color_id'])
        if part in parts and color in allowed_colors and int(row['quantity'])>0:observations[(part,color)]+=1
    pairs=set(observations)|element_pairs
    part_colors=collections.defaultdict(list)
    for part,color in sorted(pairs):part_colors[part].append(color)
    part_index=[]
    for identifier,row in parts.items():
        category=categories[int(row['part_cat_id'])]
        part_index.append({'id':identifier,'namespace':'rebrickable','name':row['name'],'category':category,'material':row['part_material'],'tags':tags_for(row['name'],category,''),'author':'Rebrickable catalog data','update':snapshot_date,'keywords':'','observedColorIds':part_colors[identifier],'elementCount':element_counts[identifier]})
    part_index.sort(key=lambda p:(p['category'],p['name'],p['id']))
    category_counts=collections.Counter(p['category'] for p in part_index)
    source={'sourceId':'rebrickable-bulk-'+snapshot_date,'name':'Rebrickable','snapshotDate':snapshot_date,'downloadPage':'https://rebrickable.com/downloads/','termsUrl':'https://rebrickable.com/terms/','permission':PERMISSION,'attribution':'Catalog and historical part/color data sourced from Rebrickable','downloadLimit':'At most once per day per bulk file','files':provenance}
    manifest={'schemaVersion':1,'source':source,'partCount':len(part_index),'categoryCount':len(category_counts),'colorCount':len(allowed_colors),'observedPartColorCount':len(pairs),'elementCount':len(elements),'relationshipCount':len(relationships),'inventoryRowCount':inventory_rows,'categories':[{'name':name,'count':count} for name,count in sorted(category_counts.items())],'stockVerified':False,'providerMappingsVerified':False}
    destination=args.output
    if not (destination/'brickmade.sqlite').exists():raise ValueError('Import the LDraw foundation first')
    with sqlite3.connect(destination/'brickmade.sqlite') as db:
        db.executescript('''
          DROP TABLE IF EXISTS rb_part_color_observations;
          DROP TABLE IF EXISTS rb_elements;
          DROP TABLE IF EXISTS rb_relationships;
          DROP TABLE IF EXISTS rb_parts;
          DROP TABLE IF EXISTS rb_colors;
          DROP TABLE IF EXISTS rb_categories;
          CREATE TABLE rb_categories(id INTEGER PRIMARY KEY,name TEXT NOT NULL);
          CREATE TABLE rb_parts(id TEXT PRIMARY KEY,name TEXT NOT NULL,category_id INTEGER REFERENCES rb_categories(id),material TEXT,source_id TEXT REFERENCES sources(id));
          CREATE TABLE rb_colors(id INTEGER PRIMARY KEY,name TEXT,rgb TEXT,is_trans INTEGER,is_placeholder INTEGER);
          CREATE TABLE rb_elements(element_id TEXT,part_num TEXT REFERENCES rb_parts(id),color_id INTEGER REFERENCES rb_colors(id),design_id TEXT,PRIMARY KEY(element_id,part_num,color_id));
          CREATE TABLE rb_relationships(kind TEXT,child_part_num TEXT,parent_part_num TEXT,PRIMARY KEY(kind,child_part_num,parent_part_num));
          CREATE TABLE rb_part_color_observations(part_num TEXT REFERENCES rb_parts(id),color_id INTEGER REFERENCES rb_colors(id),inventory_lot_count INTEGER,element_evidence INTEGER,status TEXT CHECK(status='observed'),PRIMARY KEY(part_num,color_id));
          CREATE INDEX rb_part_category ON rb_parts(category_id);
        ''')
        db.execute('INSERT OR REPLACE INTO sources VALUES (?,?)',(source['sourceId'],json.dumps(source)))
        db.executemany('INSERT INTO rb_categories VALUES (?,?)',sorted(categories.items()))
        db.executemany('INSERT INTO rb_parts VALUES (?,?,?,?,?)',[(identifier,row['name'],int(row['part_cat_id']),row['part_material'],source['sourceId']) for identifier,row in parts.items()])
        db.executemany('INSERT INTO rb_colors VALUES (?,?,?,?,?)',[(c['id'],c['name'],c['hex'],c['alpha']<255,c['placeholder']) for c in colors])
        db.executemany('INSERT OR IGNORE INTO rb_elements VALUES (?,?,?,?)',[(r['element_id'],r['part_num'],int(r['color_id']),r['design_id'] or None) for r in elements])
        db.executemany('INSERT OR IGNORE INTO rb_relationships VALUES (?,?,?)',[(r['rel_type'],r['child_part_num'],r['parent_part_num']) for r in relationships])
        db.executemany('INSERT INTO rb_part_color_observations VALUES (?,?,?,?,?)',[(part,color,observations[(part,color)],(part,color) in element_pairs,'observed') for part,color in sorted(pairs)])
        assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    browser_parts=[{key:p[key] for key in ('id','name','category','material','tags','observedColorIds','elementCount')} for p in part_index]
    (destination/'rebrickable-index.json').write_text(json.dumps({'schemaVersion':1,'parts':browser_parts,'colors':colors},separators=(',',':'),ensure_ascii=False)+'\n')
    (destination/'rebrickable-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    # Keep the renderer palette separate from Rebrickable's color-ID namespace.
    ldraw=json.loads((destination/'index.json').read_text())
    (destination/'render-colors.json').write_text(json.dumps(ldraw['colors'],separators=(',',':'))+'\n')
    print(json.dumps({key:manifest[key] for key in ('partCount','categoryCount','colorCount','observedPartColorCount','elementCount','relationshipCount','inventoryRowCount')},indent=2))

if __name__=='__main__':main()

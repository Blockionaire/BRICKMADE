#!/usr/bin/env python3
"""Ship a compact operational projection; retain full audits in source JSON and SQLite."""
import json
from pathlib import Path
root=Path(__file__).resolve().parents[2]/'public/catalog'
full=json.loads((root/'builder-parts.json').read_text())
for p in full['parts']:
 p.pop('portAudit',None);p.pop('rejectedPorts',None)
 p['admission']={k:v for k,v in p['admission'].items() if k in ('status','physicalStatus','acceptedPorts','rejectedPorts')}
(root/'builder-runtime.json').write_text(json.dumps(full,separators=(',',':'))+'\n')
print('Runtime registry bytes:',(root/'builder-runtime.json').stat().st_size)

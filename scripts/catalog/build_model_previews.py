"""Render saved-card previews from the exact model placements and checked LDraw meshes.
Input is emitted by EXPORT_DEMO_MODELS=/tmp/models.json npm test -- tests/assembly.test.ts.
Run: python3 scripts/catalog/build_model_previews.py /tmp/models.json
Requires Pillow. No generated artwork, proxy boxes, or photo analysis.
"""
import hashlib,json,math,struct,sys
from pathlib import Path
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[2]
registry=json.loads((ROOT/'public/catalog/builder-parts.json').read_text())
profiles={p['rebrickableId']:p for p in registry['parts']}
colors=json.loads((ROOT/'data/catalog/model-colors.json').read_text())['colors']
meshes={}
for id,p in profiles.items():
 raw=(ROOT/'public'/p['mesh']['file'].lstrip('/')).read_bytes()
 assert hashlib.sha256(raw).hexdigest()==p['mesh']['sha256']
 count=struct.unpack_from('<I',raw,8)[0]
 vertices=list(struct.iter_unpack('<fff',raw[12:12+count*12]))
 meshes[id]=[vertices[i:i+3] for i in range(0,count,3)]
def transform(v,q,pos):
 x,y,z=v;qx,qy,qz,qw=q
 tx=2*(qy*z-qz*y);ty=2*(qz*x-qx*z);tz=2*(qx*y-qy*x)
 return (x+qw*tx+qy*tz-qz*ty+pos[0],y+qw*ty+qz*tx-qx*tz+pos[1],z+qw*tz+qx*ty-qy*tx+pos[2])
def project(v):return ((v[0]-v[2])*.866,(v[0]+v[2])*.433-v[1])
out=ROOT/'public/catalog/models';out.mkdir(exist_ok=True)
for model in json.loads(Path(sys.argv[1]).read_text()):
 triangles=[];allpoints=[]
 for piece in model['placements']:
  c=colors[piece['color']]['hex'];rgb=tuple(int(c[i:i+2],16) for i in (1,3,5));q=piece.get('rotation',[0,math.sin(math.pi/4),0,math.cos(math.pi/4)] if piece['rotated'] else [0,0,0,1])
  for tri in meshes[piece['partId']]:
   vs=[transform(v,q,piece['position']) for v in tri]
   u=[vs[1][i]-vs[0][i] for i in range(3)];v=[vs[2][i]-vs[0][i] for i in range(3)]
   normal=(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]);length=math.sqrt(sum(n*n for n in normal))
   if length<1e-8:continue
   facing=sum(normal)/length
   if facing<0:continue
   shade=.64+.3*max(0,(normal[0]*.15+normal[1]+normal[2]*.45)/length)
   fill=tuple(min(255,round(n*shade)) for n in rgb)+(255,)
   pts=[project(v) for v in vs];allpoints.extend(pts)
   triangles.append((sum(sum(v) for v in vs)/3,pts,fill))
 mins=[min(p[i] for p in allpoints) for i in range(2)];maxs=[max(p[i] for p in allpoints) for i in range(2)]
 W,H=960,800;scale=min((W-80)/(maxs[0]-mins[0]),(H-80)/(maxs[1]-mins[1]));offset=((W-(maxs[0]-mins[0])*scale)/2,(H-(maxs[1]-mins[1])*scale)/2)
 image=Image.new('RGBA',(W,H));draw=ImageDraw.Draw(image)
 for _,points,fill in sorted(triangles,key=lambda t:t[0]):draw.polygon([(round((p[0]-mins[0])*scale+offset[0]),round((p[1]-mins[1])*scale+offset[1])) for p in points],fill=fill)
 file=out/f"{model['kind']}-{model['settings']['detail']}-{model['settings']['size']}.png"
 image.resize((480,400),Image.Resampling.LANCZOS).save(file,optimize=True)
 print(file.name, len(triangles),'source triangles')

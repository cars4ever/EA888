#!/usr/bin/env python3
"""Validate and import the supplied archive without changing any source image bytes."""
import argparse,hashlib,json,stat,zipfile
from pathlib import Path,PurePosixPath
from prepare_roster import IDS
p=argparse.ArgumentParser();p.add_argument('zip',type=Path);p.add_argument('work',type=Path);a=p.parse_args()
expected={f'Cleetus_Hunyuan3D_5_Cars/{folder}/{folder}_{view}.png' for folder in IDS for view in ['side','front_3q','rear_3q']}
dest=a.work/'references';manifest={'archiveSha256':hashlib.sha256(a.zip.read_bytes()).hexdigest(),'files':[]}
with zipfile.ZipFile(a.zip) as z:
 files=[i for i in z.infolist() if not i.is_dir()]
 assert sum(i.file_size for i in files)<512*1024**2,'Archive exceeds budget'
 for info in files:
  name=PurePosixPath(info.filename)
  assert not name.is_absolute() and '..' not in name.parts and '\\' not in info.filename,'Unsafe archive path'
  assert not stat.S_ISLNK(info.external_attr>>16),'Symlinks forbidden'
  assert info.file_size<64*1024**2,'File exceeds budget'
  assert info.filename in expected or info.filename=='Cleetus_Hunyuan3D_5_Cars/LEESMIJ.txt','Unexpected archive file: '+info.filename
 assert {i.filename for i in files}==expected|{'Cleetus_Hunyuan3D_5_Cars/LEESMIJ.txt'},'Archive does not contain the exact five reference sets'
 # Validate everything before writing anything. Existing originals can only be reused byte-for-byte.
 for info in files:
  data=z.read(info);target=dest/info.filename
  if target.exists():assert target.read_bytes()==data,'Existing original differs: '+info.filename
 for info in files:
  data=z.read(info);target=dest/info.filename;target.parent.mkdir(parents=True,exist_ok=True)
  if not target.exists():target.write_bytes(data)
  manifest['files'].append({'path':info.filename,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
(a.work/'import-manifest.json').write_text(json.dumps(manifest,indent=2));print('Validated/imported',len(files),'original files')

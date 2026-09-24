# 3D car pipeline (Hunyuan3D -> Blender -> GLB)

Turns photos of the reference Scirocco into the game body. Nothing here writes into the repo:
models, venvs and intermediates live in `$EA888_CAR3D_WORK` (default: `../work` next to the checkout).

## 1. Cut the photos out

```bash
python3 tools/car3d/prep_inputs.py          # rembg + square padding -> $WORK/input/*.png
```

Reads `src/assets/images/randy-scirocco-*.png|jpg`. Keeps only the largest blob, so the grass and kerb
rembg leaves behind do not end up in the mesh.

## 2. Generate the shape

Needs a running Hunyuan3D Gradio app. Two are used here:

| Model | Port | Started with |
|---|---|---|
| Hunyuan3D-2.1 (single image) | 7860 | `--model_path tencent/Hunyuan3D-2.1 --subfolder hunyuan3d-dit-v2-1` |
| Hunyuan3D-2mv (multi-view) | 7870 | `--model_path <patched dir> --subfolder hunyuan3d-dit-v2-mv` |

The multi-view weights are a 2.0-generation checkpoint whose `config.yaml` names `hy3dgen.shapegen.*`
modules; the 2.1 container calls the same classes `hy3dshape.*`. Copy the model directory, rewrite those
six `target:` lines and point `--model_path` at the copy (the path must contain `mv`, that is what
switches the app into multi-view mode).

```bash
python3 tools/car3d/gen_shape.py side2 --port 7860 --octree 512 --steps 60   # one photo
python3 tools/car3d/gen_shape.py mvnew --port 7870 --octree 512 --steps 70   # front/back/left/right
```

Multi-view **requires** a `front` key and only pays off when the views agree with each other. What works
(DEVLOG 21) is a square-on side photo, a square-on rear photo, the side mirrored for the other flank, and a
3/4 front standing in for the front. What does not: four photos from different sessions, or a different 3/4
front (that one came out 3.8 m wide). Raise the settings if the cowl comes out ragged - octree 512 and 70
steps cleaned it up where 384/50 did not.

The shipped body came from: `mvnew` at octree 512, 70 steps, seed 7.

## 3. Blender post-processing

```bash
blender -b -P tools/car3d/postprocess.py -- --src $WORK/hunyuan/shape-side2.glb \
        --out $WORK/blender/body.glb --up Z --yaw 90
```

Keeps the largest shell, orients and scales to the real car (4.256 x 1.810 m, wheelbase 2.578 m,
wheel radius 0.323 m, nose towards -Z, ground at y = 0), clips the road/grass slab off below
0.16 m (the procedural body bottom), cuts the four wheels out, mirrors the left half onto the right,
and decimates to ~52k triangles.

`--yaw` depends on how the generator happened to place the car - multi-view puts the length along Y (yaw 0
or 180), the single-image models needed 90. Getting it wrong is not subtle: the car scales to 8.8 m wide.
Check with

```bash
blender -b -P tools/car3d/probe.py -- $WORK/hunyuan/shape.glb     # bounding box and triangle count
```

## 4. Materials and lamp heights

```bash
blender -b -P tools/car3d/materials.py  -- --src $WORK/blender/body.glb --out $WORK/blender/body-mat.glb
blender -b -P tools/car3d/probe_tail.py -- $WORK/blender/body-mat.glb          # tail depth map
blender -b -P tools/car3d/probe_tail.py -- $WORK/blender/body-mat.glb nose     # nose depth map
gltf-transform optimize $WORK/blender/body-mat.glb src/assets/models/scirocco-body.glb \
    --compress meshopt --texture-compress false --simplify false
```

`materials.py` splits the mesh into `paint` and `trim` (dark, below 0.36 m) and prints where the exhaust
mouths are, for the flame anchors in `scirocco.js`. It does **not** cut the lights out: the generated
recesses are too soft to separate by position and normal. `scirocco.js` lays the lamps onto the surface
instead, at heights read off `probe_tail.py` - a local maximum in that depth map is a recess, and the tail
light line shows as a band recessed 3-4 cm.

meshopt keeps 36k triangles in 618 KB and three decodes it with its own bundled
`meshopt_decoder.module.js`; Draco would need a separate wasm file shipped in the APK.

## 5. Review renders

```bash
blender -b -P tools/car3d/render_views.py -- $WORK/blender/body.glb $WORK/renders body   # raw geometry
python3 tools/car_preview.py   --out /tmp/car                                            # in the game
python3 tools/track_preview.py --out /tmp/track --quality high                           # on the strip
```

`render_views.py` gives six views on neutral grey, so the geometry is judged and not the texture; compare
against the photos before integrating. The other two show it with the game's own materials and lighting,
which is where the lamp placement is actually judged.

## A note on the registration

Only shape is generated - `/shape_generation` returns an untextured mesh - so a plate cannot reach the
model, and the owner's photos are not committed. If a texture is ever baked from them, erase the plates
first with `tools/erase_plates.py`, checking the boxes by eye: neither its own detector nor a wider one
found them reliably in the 2026 photo set.

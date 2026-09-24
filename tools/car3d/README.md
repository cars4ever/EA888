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
python3 tools/car3d/gen_shape.py mv    --port 7870 --octree 384 --steps 50   # front/back/left/right
```

Multi-view **requires** a front view and only pays off when all four photos come from one session at the
same ride height against a plain background. Mixing a 3/4 shot in as "front" gives a worse mesh than a
single clean side photo (measured: see DEVLOG 20).

## 3. Blender post-processing

```bash
blender -b -P tools/car3d/postprocess.py -- --src $WORK/hunyuan/shape-side2.glb \
        --out $WORK/blender/body.glb --up Z --yaw 90
```

Keeps the largest shell, orients and scales to the real car (4.256 x 1.810 m, wheelbase 2.578 m,
wheel radius 0.323 m, nose towards -Z, ground at y = 0), clips the road/grass slab off below
0.16 m (the procedural body bottom), cuts the four wheels out, mirrors the left half onto the right,
and decimates to ~52k triangles.

`--yaw` depends on how the generator happened to place the car; check with

```bash
blender -b -P tools/car3d/probe.py -- $WORK/hunyuan/shape.glb     # bounding box and triangle count
```

## 4. Review renders

```bash
blender -b -P tools/car3d/render_views.py -- $WORK/blender/body.glb $WORK/renders body
```

Six views (front, rear, side, front34, rear34, top) on neutral grey, so the geometry is judged and not
the texture. Compare against the photos before integrating.

# Wardrobe v3 raster artwork

## Production files

- `public/block-world/avatar-clothing-v3.png`: 1254 × 1254 RGBA, 20 new clothing/shoe/hat shapes.
- `public/block-world/avatar-bags-v3.png`: 1254 × 1254 RGBA, four bags.
- `public/block-world/avatar-accessories-v3.png`: 1536 × 1024 RGBA, three glasses and three neckwear pieces.
- `public/block-world/wardrobe-thumbs-v3/*.webp`: 144 × 144 transparent single-item thumbnails.

The original v1 atlases and original item IDs are unchanged. Runtime placement is in `PaperDoll.tsx`. Both repositories use identical new atlas bytes. These are raster voxel assets, not SVGs or live 3D scenes.

## Generation record

Created with the built-in image-generation tool, not an API/CLI fallback. The existing monochrome voxel clothing atlas was used as a style reference. Original generated files were retained without changes in the session's generated-images directory.

Prompt-set production specification (condensed record):

1. **Clothes** — neutral white/grayscale, tint-ready, tactile voxel/Minecraft-style wardrobe sprites, front view and consistent soft upper-left lighting. Five columns by four rows, generous separation, magenta matte, no human/body parts or labels/logos. Ordered items: tee, oversized tee, polo, soccer jersey, basketball jersey; baseball jersey, denim jacket, cardigan, flared dress, long dress; sports shorts, cargo pants, leggings, long skirt, paired cleats; paired sandals, paired high-tops, bucket hat, beanie, crown. Dresses must have complete one-piece silhouettes; shoes must be separate pairs. Generated source ID: `exec-07fc564a-0496-4773-9f65-296279c3adca`.
2. **Bags** — matching grayscale voxel item sprites, isolated two-by-two grid on magenta matte. Backpack, long-strap crossbody, tote with handles, satchel with handle/shoulder loop. Complete straps and clear internal gaps; no body, labels or background props. Generated source ID: `exec-250815bb-a7df-406e-a290-700a8da1b03f`.
3. **Accessories** — matching tint-ready grayscale voxel sprites, three columns by two rows, isolated round glasses, rectangular glasses, sunglasses, scarf, bandana and star pendant necklace. Requested genuine transparency including open lenses and necklace interior; preserve black sunglass lenses. No human face/body or labels. Generated source ID: `exec-8e08dd37-e94b-4d1f-b44a-6abd3c14d7a0`.

## Explicitly authorized background cleanup

The generator returned RGB images rather than usable alpha. The user explicitly approved separate image processing with “응제거해” after being told that the accessory background contained a painted checkerboard.

- Clothes/bags: remove strongly magenta matte, recover fractional edge alpha, remove magenta spill from neutral foreground; do not change silhouettes or invent new objects.
- Accessories: manual source-silhouette alpha masks and interior hole masks, with a small inward edge trim (~1.5 source pixels). Preserve visible source RGB and dark sunglass lenses.
- Preserve originals. Save cleaned art under the new v3 filenames. White/grass-green composite QA checks gaps and boundaries before in-avatar placement review.
- Offline preparation only; no image processing, canvas, WebGL or continuous animation in the student runtime.

Source preparation scripts and crop/alpha QA manifests are retained in the parent workspace's `social-verification` directory. This is a new art release, not a student-data migration.

# Block-world plaza and navigation artwork

Current architecture (2026-09-08): live plaza and home storage belong to monster-site. The tree app retains original avatar storage and a local-only admin design preview; its former social API returns410. The deleted tree social migration must never be applied. See `block-world-release.md` for the current boundary; the artwork history below is not database deployment guidance.

The user approved a Minecraft-inspired, pixel-textured block world, rejected SVG artwork, and required mobile-friendly rendering. Existing trees and student records remain unchanged.

## Selected assets

- `public/block-world/plaza-v1.png`: static plaza raster background; source built-in imagegen result `exec-219af0bd-acea-4a65-85ad-31d22ab210c5.png`.
- `public/block-world/navigation-v1.png`: six-cell raster navigation atlas; source built-in imagegen result `exec-97613d3e-6415-4d73-8697-b0cdca98bd07.png`.
- Both use approved reference `exec-3cde154a-ed3d-48c6-b1a2-effb5dbf1c9e.png`, generated in the same task. The original reference files are in `C:/Users/girls/.codex/generated_images/01a07139-f8c5-7b01-aaf2-8b4797cf84b6/`.

Generated with the imagegen skill and built-in image tool. Returned PNG files were copied unchanged. Rendering uses responsive optimized images and CSS atlas windows; no external Minecraft assets, SVG world drawings, WebGL engine, or bitmap editing pipeline were added.

## Exact plaza prompt

Use case: precise-object-edit / production game background. Input image 1 is the APPROVED visual style and world reference. Derive ONLY the left phone's Minecraft-inspired voxel village environment into a standalone background asset, with NO phone, NO UI, NO text, NO characters, NO nameplates, NO currency. Do not recreate the concept board. Produce a portrait 4:5 frame, ideally 1024x1280. Rich crisp pixel-textured pre-rendered 2D isometric Minecraft-style world, warm sunshine, square grassy dirt blocks, cubic leaves, oak-plank cottages with stepped orange terracotta roofs and glowing block windows, little square lanterns and block flowers. Keep the same charming colorful block materials, not smooth SVG/vector art, not clay or watercolor.
Game composition is essential: exactly THREE distinct cottages in upper 44% of frame: smaller own house upper-left (door centered x22%,y37%), larger friend house upper-right (door x76%,y29%), small community hut upper-middle/back (door x48%,y23%) surrounded by cube leaves. This keeps logical clickable entrances. LOWER 50% is a LARGE CLEAR walkable cobblestone plaza with grass borders, not lots of obstructions: stone tiles clearly readable, open ground from x12..88% and y52..90%. Only a SMALL square stone well at x51%,y56%, taking less than 10% width, no tall roof that obscures players. Tiny wooden bench at far right edge, block flowerbeds along edges, a thin blue block-water stream and small wooden bridge at bottom-left edge, sunny green cube trees mostly at outer upper edges. Orthographic 3/4 isometric camera, coherent scale. Environment fills full frame edge-to-edge, no floating diorama void. Preserve foreground room for moving overlay sprites. No animals or humans baked into scene. No letters, numbers, borders, signs, HUD or watermark. Strong appealing crisp game-art quality matching input reference exactly, usable as the static mobile game world image.

## Exact navigation prompt

Use case: stylized-concept, production mobile game inventory icon atlas. Derive matching voxel/pixel-textured icons from reference image1's bottom navigation. Output ONE exact 3 columns by 2 rows equal-cell sprite sheet, landscape 3:2. Each cell is a square and fills one sixth of image, no gutters, no text. Entire atlas background is the same solid dark slate #243448, NOT transparent and NOT checkerboard; each icon centered with 13% padding in its own exact cell, no icon shadows extending outside the cell. All icons bright Minecraft-inspired block objects, high fidelity to reference: crisp pixel textures, oak brown, orange terracotta roofs, green grass, soft sunny isometric voxel shading, original artwork. Reading left to right: row1 col1 small stone square village well with oak beam and lantern; row1 col2 small oak block cottage with orange terracotta stepped roof; row1 col3 sky blue pixel T-shirt hanging on small wooden hanger. Row2 col1 friendly fashionable child avatar head with brown cubic hair, ivory skin and black square eyes (no body); row2 col2 green grass block with small cube-leaf tree growing on it; row2 col3 wooden pixel treasure storage chest with brass latch. EXACTLY six objects, aligned center in their cells. No borders, no badges, no UI text, no labels, no phones, no circles, no smooth vector outlines, no flat vector icon style, no watermark. Actual UI will cut six equal square cells using CSS, so don't vary cell sizes or combine objects across cells.

## Related assets

See [avatar assets](block-world-avatar-assets.md) and [room assets](block-world-room-assets.md) for their selected outputs and exact prompts. See [release checklist](block-world-release.md) for validation and remaining production steps.

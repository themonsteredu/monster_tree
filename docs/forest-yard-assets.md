# Forest front yard — selected design, 2026-09-09

The user selected forest-front-yard concept 1 and asked for the large wooden sign to be editable per student. Its words are native escaped text, not baked into the image. Tree stages, avatars and yard objects remain independent live layers. No real-time 3D engine or SVG world assets are added.

## Production asset

- Asset: `public/block-world/forest-yard-v1.webp`
- Built-in image generation tool, edit of the approved mockup. No API/CLI fallback.
- Generated source retained at `C:/Users/girls/.codex/generated_images/01a07139-f8c5-7b01-aaf2-8b4797cf84b6/exec-d050e77a-c2e5-4348-9d3f-5b6d3b573d49.png`.
- Source inspection: cottage/forest/lawn/fence only; no baked avatar, focal growing tree, personal text, UI or watermark.
- WebP encoding for web delivery: 1254 × 1254, 324,992 bytes, quality 82. No scene editing, compositing or resizing outside the image-generation tool.
- Original mockup: `C:/Users/girls/.codex/generated_images/01a07139-f8c5-7b01-aaf2-8b4797cf84b6/exec-fa923ef0-752a-478d-bfbf-637ba8037c70.png`.

## Final generation prompt

```text
Use case: precise-object-edit
Asset type: production raster background plate for a lightweight mobile forest-yard game screen.
Input image: selected forest front-yard UI mockup, the edit target.
Primary request: turn the central environment into a clean square (1024x1024) garden background ONLY, suitable to overlay the student's existing dynamic tree and avatar. Preserve its Minecraft-like voxel/cubic materials, blue slate block roof cottage on the back-left, oak timber, warm lanterns, lush forest, flowers, stone path, wooden foreground fence and gate, gentle late afternoon light.
Composition: cottage occupies upper-left around x=5..48%, y=8..48%; distant forest upper third; central and right lawn stays open and uncluttered from y=40..85%, so an avatar at x=44% and tree at x=70% can be rendered there separately. Front fence and gate stay below y=90%. Slight elevated front view, all of garden visible.
Remove ALL UI: header, banners, labels, written signs, text, progress bar, buttons, profile, points. Remove the main foreground tree completely including its trunk and birdhouse, replacing it with continuous lawn. Remove avatar and cat entirely. Keep distant forest trees only. No main focal foreground tree or other characters; no white panels or frame. No lettering, logos, watermarks, empty UI labels, or SVG. Output a single seamless-edge square background image, not the whole phone mockup.
```

# Block-world avatar assets

Generated with the built-in `image_gen.imagegen` tool, using the user-approved block-world design as a style reference. No image API key, CLI fallback, SVG conversion, or code-drawn sprite substitutes were used.

Reference: `C:/Users/girls/.codex/generated_images/01a07139-f8c5-7b01-aaf2-8b4797cf84b6/exec-3cde154a-ed3d-48c6-b1a2-effb5dbf1c9e.png`.

| Project asset | Source dimensions | Purpose |
| --- | --- | --- |
| `public/block-world/avatar-heads-v1.png` | 1536 × 1024 | Five face/skin types × three expressions |
| `public/block-world/avatar-clothes-v1.png` | 1536 × 1024 | Separate tops, bottoms, shoes, beret and cap |
| `public/block-world/avatar-hair-v1.png` | 1254 × 1254 | Four hair styles, separate skin/fur limbs, bow |

The generated PNG files were copied unchanged into the project. The generator returned RGB artwork with a painted checkerboard rather than alpha transparency, despite requesting true transparency. `PaperDoll.tsx` therefore uses fixed source windows and carefully clipped CSS silhouettes, not the painted checkerboard. Hair contours were audited against the original RGB pixels once during development. There is no runtime pixel scan, canvas, WebGL, animation loop, or adjustable garment position.

All garments share fixed shoulder, waist, ankle and neck coordinates. Face, expression, hair, top, bottom, footwear and headwear selections retain independent behavior. Skin/fur is separate from the clothing tint layers. The persisted catalog schema remains compatible with the previously implemented version 2 validator.

For phones, each source is requested through `/tree/_next/image` at a fixed width of 640 pixels and quality 82. These three URLs are reused by every sprite, including on high-DPR screens. `next/image` is marked `unoptimized` only because its source is already the bounded optimizer URL; this prevents double optimization and oversized DPR variants. Original PNGs are not directly downloaded by the avatar component.

Verification: `node scripts/check-avatar-v2.cjs` checks all catalog choices, 63 valid look renders, active individual-control behavior, the raster-only renderer, at most 40 DOM nodes per avatar, and the three bounded atlas URLs. Parent-task browser review confirmed the corrected hair edges and fitting at a 360-pixel-wide viewport.

## Exact generation prompts

Each call supplied the reference image above through `referenced_image_paths`.

### Heads

```text
Use case: stylized-concept. Asset type: production GAME SPRITE ATLAS, not a mockup. The supplied image is STYLE REFERENCE only: use its charming Minecraft-like block/voxel character rendering, dimensional pixel textures, simple cubic faces. Generate ONE genuinely transparent PNG atlas with exactly FIVE equal columns and THREE equal rows (15 equally-sized rectangular cells), no borders, no labels, no text, no ground, no shadow, no background pixels. Each cell contains ONLY an isolated block-character HEAD viewed perfectly straight-on with a very shallow visible top plane; no body and no neck. Every head has exactly the same square cube face size and placement in its cell, bottom edge at 85% cell height, head width about60%cell width. Reserve room above for animal ears. Columns left to right:1 bare-haired human peach-skin square head,2 bare-haired human honey-tan square head,3 bare-haired human cocoa-brown square head,4 white rabbit square head with tall upright block ears and tiny pink nose,5 ginger cat square head with small triangular block ears and white muzzle. Human heads must have NO hair at all because hair is equipped separately. Rows top to bottom:1 large friendly open shiny black square eyes,2 joyful closed smiling eyes,3 left open eye and right winking eye. Faces kid-friendly cute age-neutral toy/game avatars. Tiny pixel blush, cubic ears, pixel lighting from upper left. Identical head dimensions and projection in all15cells. Flat regular grid is essential for software sprite extraction. True alpha transparency everywhere outside each isolated head.
```

### Clothes

```text
Use case: stylized-concept. Asset type: production MODULAR VOXEL AVATAR WARDROBE SPRITE ATLAS. Input image style reference only. Match its Minecraft-inspired dimensional block character clothes, pixel woven textures, blocky cuboid forms and high quality game sprites. Generate ONE truly TRANSPARENT PNG with a perfect FIVE equal columns × THREE equal rows grid (15cells), no lines/text/labels/shadows/background. Each cell separate centered isolated item. All items orthographic FRONT view with shallow top plane, matching same block humanoid rig, no tilt or rotation. Use neutral pearl/off-white LIGHT GREY fabric with clear mid-grey pixel shading so program can tint clothing later. Avoid saturated colors. Top row five torso-plus-both-sleeves ONLY cutouts, NO HEAD, HANDS, LEGS: col1 relaxed crewneck sweatshirt with small stitched square chest emblem;col2 striped long-sleeve tee;col3 drawstring hoodie with pocket;col4 blazer jacket with white shirt and tiny tie;col5 blouse upper part of pinafore dress. Every torso identical straight waist position and width, sleeves down at sides, cuffs end at waist, waist centered60%width of entire garment. Middle row:col1 block cuffed shorts ONLY no bare legs, col2 short pleated block skirt ONLY, col3 straight block pants twolegs ONLY no shoes, col4 pinafore dress SKIRT portion with pleated flared hem only, col5 a neutral white pair of long socks with leg shapes (no shoes). Bottom row:col1 a PAIR of block chunky sneakers with laces, col2 PAIR of block loafers, col3 PAIR of block laceup boots, col4 block beret, col5 block baseball cap. Shoes in straight symmetric front standing view, not side view; slight top toe planes. All parts have same lighting upper-left, crisp cuboid edges and pixelated surfaces matching reference. Real alpha transparent background.
```

### Hair and body modules

```text
Use case: stylized-concept. Asset type: production MODULAR VOXEL AVATAR HAIR AND BODY SPRITE ATLAS. Reference image is STYLE ONLY; match its block/Minecraft-like dimensional cute avatars. Generate ONE genuinely transparent PNG atlas in perfect FOUR equal columns × THREE equal rows. No grid lines, labels, text, shadows or backgrounds. Each cell a separate isolated item straight-on view shallow top plane, same pixel scale and lighting. Row1 four HAIR WIG ONLY cutouts for identical square cube head, with transparent hole where entire face goes:1 tousled block short hair,2 straight block bob with bangs framing a square empty face,3 low block pigtails tied with little orange bands (matching reference girl's haircut),4 long block hair framing a square empty face. Hair all chestnut medium brown with pixel strands, no faces, no skin, no heads. Wigs should have common square face opening centered and equal size. Row2 four HEADLESS HANDS+LEGS BODY BASES for the common block avatar rig, no head, no torso clothing:1 peach skin,2 honey skin,3 cocoa skin,4 white rabbit fur. Each base consists only of two relaxed cubic hands beside where waist will be and two parallel separated straight bare cuboid legs below them; invisible torso and empty above waist. Identical pose and silhouette. These will be behind clothing. Row3:col1 ginger fur version of the same headless hands+legs base;col2 single large pixel bow hair clip in neutral pearl grey;col3 a pair of little block pigtail bands in grey;col4 leave EMPTY transparent. Every shape has true transparent pixels around it and all face openings true alpha transparency. Sharp dimensional square cuboid rendering, same reference style, no line-art and no vector look.
```

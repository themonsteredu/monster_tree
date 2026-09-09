import Image from "next/image";
import type { CSSProperties } from "react";
import { TOP_META, normalizeLook, type PaperDollLook, type StoredPaperDollLook } from "@/lib/avatar-v2";

type Rect = readonly [number, number, number, number];
type Sprite = { sheet: keyof typeof SHEETS; crop: Rect; outline?: string };
const SHEETS = {
  heads: { src: "/tree/block-world/avatar-heads-v1.png", width: 1536, height: 1024 },
  clothes: { src: "/tree/block-world/avatar-clothes-v1.png", width: 1536, height: 1024 },
  hair: { src: "/tree/block-world/avatar-hair-v1.png", width: 1254, height: 1254 },
  clothing: { src: "/tree/block-world/avatar-clothing-v3.png", width: 1254, height: 1254 },
  bags: { src: "/tree/block-world/avatar-bags-v3.png", width: 1254, height: 1254 },
  accessories: { src: "/tree/block-world/avatar-accessories-v3.png", width: 1536, height: 1024 },
} as const;
const polygon = (points: string) => `polygon(${points})`;
const SHIRT_OUTLINE = polygon("28% 1%,68% 1%,73% 6%,91% 6%,100% 89%,96% 97%,82% 97%,80% 88%,79% 100%,23% 100%,22% 89%,20% 97%,1% 95%,0% 87%,9% 6%,25% 6%");
const TOPS: Record<PaperDollLook["top"], Sprite> = {
  sweatshirt: { sheet: "clothes", crop: [33, 88, 274, 236], outline: SHIRT_OUTLINE },
  stripe: { sheet: "clothes", crop: [338, 87, 269, 238], outline: SHIRT_OUTLINE },
  hoodie: { sheet: "clothes", crop: [637, 66, 271, 261], outline: polygon("22% 9%,18% 6%,24% 1%,75% 1%,82% 6%,80% 10%,91% 13%,100% 91%,96% 96%,82% 97%,80% 89%,79% 100%,22% 100%,22% 89%,20% 97%,1% 95%,0% 87%,9% 14%") },
  blazer: { sheet: "clothes", crop: [942, 86, 263, 238], outline: SHIRT_OUTLINE },
  dress: { sheet: "clothes", crop: [1239, 88, 256, 235], outline: polygon("28% 2%,72% 2%,76% 7%,91% 7%,99% 45%,80% 51%,77% 36%,78% 99%,19% 99%,19% 39%,18% 51%,0% 44%,10% 6%,24% 6%") },
  tee: { sheet: "clothing", crop: [23, 101, 223, 188] },
  oversized_tee: { sheet: "clothing", crop: [257, 99, 247, 195] },
  polo: { sheet: "clothing", crop: [519, 98, 217, 196] },
  soccer_jersey: { sheet: "clothing", crop: [759, 99, 234, 195] },
  basketball_jersey: { sheet: "clothing", crop: [1047, 98, 155, 204] },
  baseball_jersey: { sheet: "clothing", crop: [18, 374, 233, 204] },
  denim_jacket: { sheet: "clothing", crop: [256, 386, 247, 184] },
  cardigan: { sheet: "clothing", crop: [511, 381, 232, 189] },
  flare_dress: { sheet: "clothing", crop: [761, 355, 227, 278] },
  long_dress: { sheet: "clothing", crop: [1030, 352, 190, 317] },
};
const BOTTOMS: Record<PaperDollLook["bottom"] | "dress", Sprite> = {
  shorts: { sheet: "clothes", crop: [54, 410, 241, 203], outline: polygon("7% 7%,20% 1%,84% 1%,92% 7%,99% 92%,96% 98%,57% 98%,49% 60%,46% 98%,5% 96%,0% 89%") },
  skirt: { sheet: "clothes", crop: [350, 434, 249, 152], outline: polygon("14% 2%,86% 2%,90% 15%,99% 85%,92% 92%,73% 96%,51% 99%,23% 96%,3% 88%,0% 82%,12% 18%") },
  pants: { sheet: "clothes", crop: [678, 372, 182, 272], outline: polygon("8% 7%,13% 1%,86% 1%,95% 7%,99% 93%,94% 99%,57% 99%,49% 40%,44% 98%,4% 98%,0% 94%") },
  dress: { sheet: "clothes", crop: [939, 482, 268, 150], outline: polygon("14% 1%,84% 1%,88% 20%,99% 85%,95% 91%,74% 98%,48% 99%,21% 96%,0% 85%,12% 20%") },
  sport_shorts: { sheet: "clothing", crop: [34, 728, 200, 168] },
  cargo_pants: { sheet: "clothing", crop: [289, 667, 180, 265] },
  leggings: { sheet: "clothing", crop: [562, 672, 131, 264] },
  long_skirt: { sheet: "clothing", crop: [760, 682, 229, 251] },
};
const TOP_LAYOUT: Record<PaperDollLook["top"], Rect> = {
  sweatshirt: [37, 126, 107, 77], stripe: [37, 126, 107, 77], hoodie: [37, 119, 107, 84],
  blazer: [37, 126, 107, 77], dress: [37, 126, 107, 77],
  tee: [37, 126, 107, 77], oversized_tee: [32, 125, 117, 83], polo: [37, 126, 107, 77],
  soccer_jersey: [37, 126, 107, 77], basketball_jersey: [58, 126, 66, 78], baseball_jersey: [37, 126, 107, 77],
  denim_jacket: [35, 128, 111, 75], cardigan: [37, 126, 107, 77],
  flare_dress: [34, 126, 112, 136], long_dress: [30, 126, 120, 161],
};
const BOTTOM_LAYOUT: Record<keyof typeof BOTTOMS, Rect> = {
  shorts: [63, 196, 56, 46], skirt: [58, 196, 66, 55], pants: [64, 196, 53, 88], dress: [58, 196, 66, 55],
  sport_shorts: [61, 196, 60, 50], cargo_pants: [61, 196, 60, 88], leggings: [66, 196, 50, 88], long_skirt: [54, 196, 74, 87],
};
const HAIRS: Record<PaperDollLook["hair"], Sprite> = {
  short: { sheet: "hair", crop: [47, 105, 240, 213], outline: polygon("41.3% 1.4%, 43.8% 1.4%, 43.8% 2.8%, 51.2% 2.8%, 52.5% 5.6%, 56.3% 5.6%, 56.3% 7.0%, 58.8% 7.0%, 60.0% 4.2%, 65.0% 4.2%, 65.0% 5.6%, 75.0% 5.6%, 75.0% 11.3%, 76.3% 11.3%, 76.3% 12.7%, 87.5% 12.7%, 88.8% 19.7%, 90.0% 19.7%, 90.0% 21.1%, 87.5% 22.5%, 87.5% 28.2%, 92.5% 31.0%, 92.5% 36.6%, 93.8% 36.6%, 93.8% 38.0%, 98.8% 38.0%, 98.8% 45.1%, 97.5% 45.1%, 98.8% 50.7%, 92.5% 53.5%, 92.5% 57.7%, 93.8% 57.7%, 93.8% 70.4%, 88.8% 74.6%, 90.0% 81.7%, 88.8% 81.7%, 88.8% 84.5%, 83.8% 84.5%, 83.8% 85.9%, 82.5% 85.9%, 82.5% 91.5%, 78.8% 91.5%, 78.8% 93.0%, 77.5% 93.0%, 77.5% 97.2%, 63.7% 97.2%, 62.5% 94.4%, 36.3% 94.4%, 35.0% 97.2%, 26.3% 95.8%, 26.3% 93.0%, 25.0% 93.0%, 25.0% 91.5%, 21.3% 91.5%, 21.3% 87.3%, 20.0% 87.3%, 18.8% 84.5%, 15.0% 84.5%, 15.0% 80.3%, 13.8% 80.3%, 13.8% 71.8%, 7.5% 69.0%, 7.5% 57.7%, 6.3% 57.7%, 6.3% 56.3%, 2.5% 56.3%, 2.5% 42.3%, 6.3% 42.3%, 6.3% 40.8%, 8.8% 39.4%, 8.8% 36.6%, 10.0% 36.6%, 10.0% 32.4%, 8.8% 32.4%, 8.8% 31.0%, 6.3% 31.0%, 6.3% 29.6%, 7.5% 29.6%, 7.5% 21.1%, 8.8% 21.1%, 8.8% 19.7%, 11.3% 19.7%, 13.8% 15.5%, 20.0% 16.9%, 20.0% 15.5%, 21.3% 15.5%, 21.3% 14.1%, 20.0% 14.1%, 20.0% 11.3%, 21.3% 11.3%, 21.3% 9.9%, 25.0% 9.9%, 27.5% 5.6%, 38.8% 7.0%, 41.3% 1.4%, 41.3% 1.4%, 41.3% 1.4%, 57.5% 46.5%, 55.0% 47.9%, 55.0% 50.7%, 53.8% 50.7%, 53.8% 52.1%, 46.3% 52.1%, 43.8% 47.9%, 37.5% 47.9%, 37.5% 49.3%, 36.3% 49.3%, 36.3% 54.9%, 30.0% 54.9%, 30.0% 56.3%, 28.7% 56.3%, 28.7% 57.7%, 30.0% 57.7%, 30.0% 87.3%, 31.3% 87.3%, 31.3% 88.7%, 73.8% 88.7%, 73.8% 87.3%, 75.0% 87.3%, 75.0% 63.4%, 73.8% 63.4%, 73.8% 62.0%, 71.3% 62.0%, 71.3% 54.9%, 70.0% 54.9%, 70.0% 53.5%, 62.5% 53.5%, 62.5% 47.9%, 61.3% 47.9%, 61.3% 46.5%, 57.5% 46.5%, 57.5% 46.5%") },
  bob: { sheet: "hair", crop: [366, 113, 208, 218], outline: polygon("28.8% 1.4%, 63.5% 1.4%, 63.5% 2.8%, 72.1% 2.8%, 73.6% 5.5%, 83.7% 5.5%, 85.1% 8.3%, 90.9% 8.3%, 90.9% 9.6%, 92.3% 9.6%, 92.3% 19.3%, 93.8% 19.3%, 93.8% 22.0%, 96.6% 23.4%, 98.1% 79.8%, 96.6% 79.8%, 96.6% 89.4%, 95.2% 89.4%, 95.2% 90.8%, 89.4% 90.8%, 89.4% 92.2%, 88.0% 92.2%, 88.0% 96.3%, 83.7% 96.3%, 83.7% 95.0%, 82.2% 95.0%, 82.2% 96.3%, 80.8% 96.3%, 80.8% 99.1%, 75.0% 99.1%, 72.1% 92.2%, 36.1% 92.2%, 36.1% 90.8%, 33.2% 92.2%, 33.2% 90.8%, 27.4% 90.8%, 27.4% 92.2%, 26.0% 92.2%, 26.0% 97.7%, 24.5% 97.7%, 24.5% 99.1%, 18.8% 99.1%, 17.3% 96.3%, 13.0% 96.3%, 13.0% 90.8%, 11.5% 90.8%, 11.5% 89.4%, 10.1% 89.4%, 10.1% 90.8%, 4.3% 90.8%, 4.3% 86.7%, 2.9% 86.7%, 2.9% 71.6%, 1.4% 71.6%, 2.9% 23.4%, 4.3% 23.4%, 4.3% 22.0%, 5.8% 22.0%, 5.8% 19.3%, 7.2% 19.3%, 7.2% 12.4%, 8.7% 12.4%, 8.7% 8.3%, 14.4% 8.3%, 15.9% 5.5%, 27.4% 5.5%, 27.4% 4.1%, 28.8% 4.1%, 28.8% 1.4%, 28.8% 1.4%, 28.8% 1.4%, 28.8% 48.2%, 27.4% 48.2%, 27.4% 49.5%, 26.0% 49.5%, 26.0% 52.3%, 23.1% 53.7%, 23.1% 83.9%, 24.5% 83.9%, 24.5% 85.3%, 75.0% 85.3%, 75.0% 83.9%, 76.4% 83.9%, 76.4% 53.7%, 73.6% 52.3%, 73.6% 49.5%, 72.1% 49.5%, 72.1% 48.2%, 66.3% 48.2%, 66.3% 49.5%, 64.9% 49.5%, 64.9% 48.2%, 28.8% 48.2%, 28.8% 48.2%") },
  pigtails: { sheet: "hair", crop: [627, 115, 305, 224], outline: polygon("51.1% 1.3%, 52.1% 1.3%, 52.1% 2.7%, 60.0% 2.7%, 60.0% 4.0%, 62.0% 4.0%, 62.0% 5.4%, 64.9% 5.4%, 65.9% 8.0%, 69.8% 8.0%, 71.8% 14.7%, 74.8% 14.7%, 74.8% 13.4%, 80.7% 13.4%, 80.7% 17.4%, 81.6% 17.4%, 81.6% 18.8%, 87.5% 18.8%, 87.5% 21.4%, 89.5% 22.8%, 89.5% 26.8%, 90.5% 26.8%, 90.5% 57.6%, 91.5% 57.6%, 91.5% 58.9%, 94.4% 58.9%, 94.4% 64.3%, 96.4% 65.6%, 96.4% 73.7%, 97.4% 73.7%, 97.4% 88.4%, 94.4% 88.4%, 94.4% 89.7%, 93.4% 89.7%, 93.4% 95.1%, 89.5% 95.1%, 88.5% 97.8%, 85.6% 97.8%, 85.6% 95.1%, 83.6% 93.8%, 83.6% 81.7%, 82.6% 81.7%, 82.6% 80.4%, 80.7% 80.4%, 80.7% 71.0%, 79.7% 71.0%, 79.7% 69.6%, 77.7% 69.6%, 77.7% 37.5%, 75.7% 36.2%, 75.7% 37.5%, 74.8% 37.5%, 74.8% 80.4%, 72.8% 80.4%, 72.8% 81.7%, 71.8% 81.7%, 71.8% 87.1%, 68.9% 87.1%, 67.9% 89.7%, 64.9% 89.7%, 64.9% 88.4%, 34.4% 88.4%, 34.4% 87.1%, 33.4% 87.1%, 33.4% 88.4%, 32.5% 88.4%, 32.5% 91.1%, 30.5% 91.1%, 30.5% 88.4%, 29.5% 88.4%, 29.5% 87.1%, 26.6% 87.1%, 26.6% 81.7%, 25.6% 81.7%, 25.6% 80.4%, 23.6% 80.4%, 23.6% 37.5%, 21.6% 36.2%, 21.6% 37.5%, 20.7% 37.5%, 20.7% 40.2%, 19.7% 40.2%, 19.7% 41.5%, 20.7% 41.5%, 20.7% 54.9%, 19.7% 54.9%, 19.7% 56.3%, 20.7% 56.3%, 20.7% 69.6%, 18.7% 69.6%, 18.7% 71.0%, 17.7% 71.0%, 17.7% 80.4%, 15.7% 80.4%, 15.7% 81.7%, 13.8% 80.4%, 13.8% 81.7%, 12.8% 81.7%, 12.8% 83.0%, 14.8% 84.4%, 14.8% 93.8%, 12.8% 95.1%, 12.8% 97.8%, 9.8% 97.8%, 7.9% 93.8%, 4.9% 93.8%, 4.9% 89.7%, 3.9% 89.7%, 3.9% 88.4%, 2.0% 88.4%, 2.0% 65.6%, 3.9% 65.6%, 3.9% 64.3%, 4.9% 64.3%, 4.9% 58.9%, 6.9% 58.9%, 6.9% 57.6%, 7.9% 57.6%, 7.9% 26.8%, 8.9% 26.8%, 8.9% 22.8%, 10.8% 22.8%, 10.8% 21.4%, 11.8% 21.4%, 11.8% 18.8%, 16.7% 18.8%, 16.7% 17.4%, 17.7% 17.4%, 17.7% 13.4%, 23.6% 13.4%, 23.6% 14.7%, 25.6% 16.1%, 25.6% 14.7%, 26.6% 14.7%, 26.6% 12.1%, 29.5% 9.4%, 29.5% 6.7%, 33.4% 6.7%, 33.4% 5.4%, 35.4% 5.4%, 35.4% 4.0%, 39.3% 4.0%, 39.3% 2.7%, 51.1% 2.7%, 51.1% 1.3%, 51.1% 1.3%, 51.1% 1.3%, 55.1% 40.2%, 53.1% 41.5%, 53.1% 48.2%, 39.3% 48.2%, 39.3% 45.5%, 38.4% 45.5%, 38.4% 44.2%, 36.4% 44.2%, 36.4% 45.5%, 35.4% 45.5%, 35.4% 48.2%, 34.4% 48.2%, 34.4% 53.6%, 32.5% 53.6%, 32.5% 54.9%, 31.5% 54.9%, 31.5% 81.7%, 32.5% 81.7%, 32.5% 83.0%, 65.9% 83.0%, 65.9% 81.7%, 66.9% 81.7%, 66.9% 57.6%, 67.9% 57.6%, 67.9% 56.3%, 63.9% 52.2%, 63.9% 50.9%, 64.9% 50.9%, 64.9% 48.2%, 63.9% 48.2%, 63.9% 46.9%, 60.0% 46.9%, 60.0% 41.5%, 59.0% 41.5%, 59.0% 40.2%, 55.1% 40.2%, 55.1% 40.2%") },
  long: { sheet: "hair", crop: [981, 111, 209, 259], outline: polygon("28.7% 2.3%, 70.3% 2.3%, 71.8% 4.6%, 80.4% 4.6%, 80.4% 6.9%, 81.8% 6.9%, 81.8% 8.1%, 87.6% 8.1%, 87.6% 10.4%, 89.0% 10.4%, 89.0% 18.5%, 90.4% 18.5%, 90.4% 19.7%, 93.3% 19.7%, 93.3% 57.9%, 94.7% 57.9%, 94.7% 60.2%, 93.3% 60.2%, 93.3% 61.4%, 94.7% 61.4%, 94.7% 69.5%, 96.2% 69.5%, 97.6% 88.0%, 93.3% 88.0%, 93.3% 89.2%, 91.9% 89.2%, 91.9% 93.8%, 90.4% 93.8%, 90.4% 96.1%, 87.6% 96.1%, 86.1% 98.5%, 80.4% 98.5%, 77.5% 92.7%, 71.8% 92.7%, 71.8% 77.6%, 70.3% 77.6%, 70.3% 76.4%, 31.6% 76.4%, 31.6% 75.3%, 30.1% 75.3%, 30.1% 76.4%, 28.7% 76.4%, 28.7% 83.4%, 27.3% 83.4%, 27.3% 92.7%, 21.5% 92.7%, 21.5% 93.8%, 20.1% 93.8%, 20.1% 98.5%, 12.9% 98.5%, 12.9% 96.1%, 7.2% 92.7%, 7.2% 91.5%, 8.6% 91.5%, 8.6% 89.2%, 2.9% 86.9%, 2.9% 77.6%, 4.3% 77.6%, 4.3% 69.5%, 5.7% 69.5%, 5.7% 25.5%, 7.2% 25.5%, 7.2% 18.5%, 8.6% 18.5%, 8.6% 19.7%, 11.5% 18.5%, 11.5% 8.1%, 18.7% 8.1%, 18.7% 6.9%, 20.1% 6.9%, 20.1% 4.6%, 27.3% 4.6%, 28.7% 2.3%, 28.7% 2.3%, 28.7% 2.3%, 56.0% 30.1%, 53.1% 31.3%, 53.1% 34.7%, 44.5% 34.7%, 44.5% 35.9%, 43.1% 35.9%, 43.1% 37.1%, 44.5% 37.1%, 44.5% 42.9%, 28.7% 41.7%, 28.7% 42.9%, 25.8% 44.0%, 25.8% 69.5%, 27.3% 69.5%, 27.3% 70.7%, 71.8% 70.7%, 71.8% 69.5%, 73.2% 69.5%, 73.2% 35.9%, 71.8% 35.9%, 71.8% 34.7%, 70.3% 34.7%, 70.3% 35.9%, 68.9% 35.9%, 68.9% 34.7%, 64.6% 34.7%, 64.6% 31.3%, 63.2% 31.3%, 63.2% 30.1%, 56.0% 30.1%, 56.0% 30.1%") },
};
const HAIR_LAYOUT: Record<PaperDollLook["hair"], Rect> = {
  short: [31, 20, 118, 112], bob: [40, 23, 100, 112],
  pigtails: [17, 23, 147, 117], long: [39, 23, 103, 130],
};
const SKIN_COLUMN = { peach: 0, honey: 1, cocoa: 2 };
const FACE_COLUMN = [58, 357, 656, 956, 1257];
const FACE_Y = [188, 478, 778];
const EYE_ROW = { bright: 0, smile: 1, wink: 2 };
const TINT: Record<PaperDollLook["topColor"], string> = {
  cream: "sepia(.28) saturate(.8) brightness(1.05)",
  sage: "sepia(1) saturate(1.3) hue-rotate(32deg) brightness(.67)",
  rose: "sepia(1) saturate(2) hue-rotate(298deg) brightness(.84)",
  lilac: "sepia(1) saturate(1.5) hue-rotate(195deg) brightness(.72)",
  navy: "sepia(1) saturate(1.9) hue-rotate(157deg) brightness(.44)",
  apricot: "sepia(1) saturate(4.5) hue-rotate(300deg) brightness(.7) contrast(2.1)",
};
const HAIR_TINT = {
  chestnut: "none", ink: "saturate(.12) brightness(.51)", honey: "sepia(.5) saturate(.85) brightness(1.65)",
  rose: "sepia(.3) hue-rotate(305deg) saturate(.72) brightness(1.24)",
};
const BOOT_OUTLINE = polygon("14% 3%,63% 0%,85% 9%,85% 36%,90% 65%,100% 91%,94% 98%,15% 100%,1% 95%,0% 81%,7% 46%");
const SNEAKER_OUTLINE = polygon("24% 1%,70% 1%,83% 9%,88% 48%,98% 75%,99% 93%,91% 99%,17% 99%,1% 92%,0% 78%,8% 48%,17% 11%");
const SHOES: Record<PaperDollLook["shoes"], [Sprite, Sprite]> = {
  sneakers: [
    { sheet: "clothes", crop: [47, 735, 133, 168], outline: SNEAKER_OUTLINE },
    { sheet: "clothes", crop: [190, 735, 116, 170], outline: SNEAKER_OUTLINE },
  ],
  loafers: [
    { sheet: "clothes", crop: [342, 751, 124, 152], outline: SNEAKER_OUTLINE },
    { sheet: "clothes", crop: [472, 751, 120, 153], outline: SNEAKER_OUTLINE },
  ],
  boots: [
    { sheet: "clothes", crop: [645, 694, 118, 218], outline: BOOT_OUTLINE },
    { sheet: "clothes", crop: [775, 694, 113, 218], outline: BOOT_OUTLINE },
  ],
  cleats: [
    { sheet: "clothing", crop: [1004, 776, 109, 137] }, { sheet: "clothing", crop: [1137, 776, 101, 137] },
  ],
  sandals: [
    { sheet: "clothing", crop: [25, 1024, 98, 147] }, { sheet: "clothing", crop: [146, 1024, 97, 147] },
  ],
  high_tops: [
    { sheet: "clothing", crop: [276, 996, 96, 175] }, { sheet: "clothing", crop: [387, 996, 95, 175] },
  ],
};
const HEADWEAR: Record<Exclude<PaperDollLook["hat"], "none">, Sprite> = {
  beret: { sheet: "clothes", crop: [931, 731, 264, 159], outline: polygon("8% 30%,46% 10%,47% 0%,56% 1%,59% 14%,81% 28%,98% 47%,97% 70%,90% 86%,68% 99%,32% 93%,13% 76%,0% 53%") },
  cap: { sheet: "clothes", crop: [1218, 717, 266, 200], outline: polygon("16% 32%,27% 15%,48% 4%,49% 0%,61% 0%,63% 5%,77% 9%,90% 23%,94% 34%,98% 62%,88% 72%,66% 77%,54% 100%,35% 92%,16% 84%,1% 86%,0% 76%,15% 54%") },
  bow: { sheet: "hair", crop: [352, 910, 232, 193], outline: polygon("7% 2%,27% 9%,41% 27%,62% 28%,75% 10%,92% 1%,99% 43%,94% 52%,73% 53%,90% 83%,78% 97%,57% 65%,48% 60%,25% 99%,9% 80%,31% 52%,2% 47%,0% 38%") },
  bucket_hat: { sheet: "clothing", crop: [517, 1012, 226, 147] },
  beanie: { sheet: "clothing", crop: [786, 1015, 182, 146] },
  crown: { sheet: "clothing", crop: [1021, 1026, 204, 131] },
};
const BAGS: Record<Exclude<PaperDollLook["bag"], "none">, Sprite> = {
  backpack: { sheet: "bags", crop: [106, 75, 451, 520] },
  crossbody: { sheet: "bags", crop: [760, 49, 378, 559] },
  tote: { sheet: "bags", crop: [114, 650, 410, 519] },
  satchel: { sheet: "bags", crop: [700, 729, 476, 436] },
};
const BAG_LAYOUT: Record<keyof typeof BAGS, Rect> = {
  backpack: [13, 123, 74, 87], crossbody: [62, 123, 77, 116], tote: [119, 181, 50, 68], satchel: [116, 180, 57, 61],
};
const GLASSES: Record<Exclude<PaperDollLook["glasses"], "none">, Sprite> = {
  round_glasses: { sheet: "accessories", crop: [51, 149, 412, 224] },
  square_glasses: { sheet: "accessories", crop: [545, 165, 433, 203] },
  sunglasses: { sheet: "accessories", crop: [1044, 149, 462, 224] },
};
const NECKWEAR: Record<Exclude<PaperDollLook["neckwear"], "none">, Sprite> = {
  scarf: { sheet: "accessories", crop: [92, 550, 347, 377] },
  bandana: { sheet: "accessories", crop: [600, 580, 334, 300] },
  pendant: { sheet: "accessories", crop: [1129, 582, 289, 342] },
};
const NECKWEAR_LAYOUT: Record<keyof typeof NECKWEAR, Rect> = {
  scarf: [68, 118, 47, 62], bandana: [68, 121, 47, 43], pendant: [76, 124, 31, 42],
};

/** Generated raster modules, registered once to a common 180×300 block rig.
 * Legacy v1 atlases use fixed silhouette clips; v3 artwork has real alpha.
 * No runtime canvas, pixel scanning, SVG, remote assets or animation loops. */
export function PaperDoll({ look, size = 240, className }: {
  look: StoredPaperDollLook; size?: number; className?: string;
}) {
  const l = normalizeLook(look);
  const top = l.top;
  const shoes = l.shoes;
  const hat = l.hat === "none" ? null : l.hat;
  const skinColumn = l.face === "human" ? SKIN_COLUMN[l.skin] : l.face === "rabbit" ? 3 : 4;
  const skinX = skinColumn === 4 ? 78 : 70 + skinColumn * 306;
  const skinY = skinColumn === 4 ? 869 : 479;
  const legY = skinColumn === 4 ? 1009 : 634;
  const faceIndex = l.face === "human" ? SKIN_COLUMN[l.skin] : l.face === "rabbit" ? 3 : 4;
  const row = EYE_ROW[l.eyes];
  const head: Sprite = { sheet: "heads", crop: [FACE_COLUMN[faceIndex], FACE_Y[row], 217, 183] };
  const human = l.face === "human";
  const faceLayout: Rect = human ? [56, 48, 69, 81] : [52, 63, 77, 66];
  const coversBottom = TOP_META[top].coversBottom;
  const onePiece = coversBottom && top !== "dress";
  const bottom = coversBottom ? "dress" : l.bottom;
  const shoeHeight = shoes === "boots" ? 40 : shoes === "high_tops" ? 36 : shoes === "sandals" ? 25 : 29;
  // All legacy arm placements stay byte-for-byte unchanged. New short/sleeveless
  // art needs a complete arm under the sleeve rather than a detached hand.
  const newSleeve = TOPS[top].sheet === "clothing" ? TOP_META[top].sleeve : "long";
  const leftArm: Rect = newSleeve === "sleeveless" ? [48, 131, 18, 84] : newSleeve === "short" ? [43, 151, 18, 64] : [43, 180, 18, 35];
  const rightArm: Rect = newSleeve === "sleeveless" ? [115, 131, 18, 84] : newSleeve === "short" ? [121, 151, 18, 64] : [121, 180, 18, 35];
  const hatLayout: Rect | undefined = hat === "bow" ? [113, human ? 34 : 58, 28, 24]
    : hat === "beret" ? [36, human ? 6 : 40, 112, 53] : hat === "cap" ? [42, human ? 9 : 41, 111, 69]
    : hat === "bucket_hat" ? [36, human ? 9 : 26, 109, 59] : hat === "beanie" ? [43, human ? 8 : 28, 97, 58]
    : hat === "crown" ? [46, human ? 0 : 25, 90, 53] : undefined;
  return <span className={className} role="img" aria-label={`${human ? "사람" : l.face === "rabbit" ? "토끼" : "고양이"} 블록 아바타`}
    style={{ position: "relative", display: "inline-block", flexShrink: 0, width: size * .6, height: size, overflow: "visible", maxWidth: "100%", verticalAlign: "bottom" }}>
    {l.bag !== "none" && l.bag !== "crossbody" && <Part slot="bag" sprite={BAGS[l.bag]} at={BAG_LAYOUT[l.bag]} tint={TINT[l.bagColor]} />}
    <Part sprite={{ sheet: "hair", crop: [skinX + 28, skinY + 20, 24, 65] }} at={[83, 113, 15, 28]} />
    <Part sprite={{ sheet: "hair", crop: [skinX + 27, legY + 4, 49, 145] }} at={[67, 209, 22, 77]} />
    <Part sprite={{ sheet: "hair", crop: [skinX + 107, legY + 4, 49, 145] }} at={[94, 209, 22, 77]} />
    <Part sprite={{ sheet: "hair", crop: [skinX + 18, skinY + 8, 44, 133] }} at={leftArm} />
    <Part sprite={{ sheet: "hair", crop: [skinX + 133, skinY + 8, 44, 133] }} at={rightArm} />
    {!onePiece && <Part slot="bottom" sprite={BOTTOMS[bottom]} at={BOTTOM_LAYOUT[bottom]} tint={TINT[coversBottom ? l.topColor : l.bottomColor]} />}
    <Part slot="top" sprite={TOPS[top]} at={TOP_LAYOUT[top]} tint={TINT[l.topColor]} />
    {l.bag === "crossbody" && <Part slot="bag" sprite={BAGS.crossbody} at={BAG_LAYOUT.crossbody} tint={TINT[l.bagColor]} />}
    {l.neckwear !== "none" && <Part slot="neckwear" sprite={NECKWEAR[l.neckwear]} at={NECKWEAR_LAYOUT[l.neckwear]} tint={TINT[l.neckwearColor]} />}
    <Part sprite={head} at={faceLayout} />
    {human && <Part sprite={HAIRS[l.hair]} at={HAIR_LAYOUT[l.hair]} tint={HAIR_TINT[l.hairColor]} />}
    {l.face === "rabbit" && <>
      <Part sprite={{ sheet: "heads", crop: [976, 75, 70, 111] }} at={[58, 12, 23, 54]} />
      <Part sprite={{ sheet: "heads", crop: [1084, 74, 74, 111] }} at={[101, 12, 24, 54]} />
    </>}
    {l.face === "cat" && <>
      <Part sprite={{ sheet: "heads", crop: [1277, 139, 33, 49], outline: polygon("0% 0%,60% 0%,62% 34%,100% 34%,100% 100%,0% 100%") }} at={[58, 47, 16, 20]} />
      <Part sprite={{ sheet: "heads", crop: [1421, 137, 41, 51], outline: polygon("42% 0%,87% 0%,100% 100%,0% 100%,0% 30%,42% 30%") }} at={[108, 46, 16, 21]} />
    </>}
    {l.glasses !== "none" && <Part slot="glasses" sprite={GLASSES[l.glasses]}
      at={[human ? 53 : 50, human ? 72 : 76, human ? 75 : 81, l.glasses === "round_glasses" ? 37 : 34]} tint={TINT[l.glassesColor]} />}
    <Part slot="shoes" sprite={SHOES[shoes][0]} at={[63, 295 - shoeHeight, 28, shoeHeight]} tint={TINT[l.shoeColor]} />
    <Part slot="shoes" sprite={SHOES[shoes][1]} at={[92, 295 - shoeHeight, 28, shoeHeight]} tint={TINT[l.shoeColor]} />
    {hat && hatLayout && <Part slot="hat" sprite={HEADWEAR[hat]}
      at={hatLayout}
      tint={TINT[l.hatColor]} />}
  </span>;
}

/** A card draws only its real item, not another complete layered avatar. */
export function WardrobeItemArt({ look, slot, size = 96 }: {
  look: PaperDollLook;
  slot: "face" | "hair" | "top" | "bottom" | "shoes" | "hat" | "bag" | "glasses" | "neckwear";
  size?: number;
}) {
  const parts: { sprite: Sprite; at: Rect; tint?: string }[] = [];
  if (slot === "face") {
    const index = look.face === "human" ? SKIN_COLUMN[look.skin] : look.face === "rabbit" ? 3 : 4;
    const sprite: Sprite = { sheet: "heads", crop: [FACE_COLUMN[index], FACE_Y[EYE_ROW[look.eyes]], 217, 183] };
    parts.push({ sprite, at: fitItem(sprite) });
  } else if (slot === "hair") {
    const sprite = HAIRS[look.hair];
    parts.push({ sprite, at: fitItem(sprite), tint: HAIR_TINT[look.hairColor] });
  } else if (slot === "top" && Object.hasOwn(TOPS, look.top)) {
    const sprite = TOPS[look.top as keyof typeof TOPS];
    if (look.top === "dress") {
      parts.push({ sprite, at: [24, 21, 132, 158], tint: TINT[look.topColor] });
      parts.push({ sprite: BOTTOMS.dress, at: [50, 166, 81, 113], tint: TINT[look.topColor] });
    } else parts.push({ sprite, at: fitItem(sprite), tint: TINT[look.topColor] });
  } else if (slot === "bottom" && Object.hasOwn(BOTTOMS, look.bottom)) {
    const sprite = BOTTOMS[look.bottom as keyof typeof BOTTOMS];
    parts.push({ sprite, at: fitItem(sprite), tint: TINT[look.bottomColor] });
  } else if (slot === "shoes" && Object.hasOwn(SHOES, look.shoes)) {
    SHOES[look.shoes as keyof typeof SHOES].forEach((sprite, index) =>
      parts.push({ sprite, at: fitItem(sprite, [index === 0 ? 5 : 51, 7, 44, 86]), tint: TINT[look.shoeColor] }));
  } else if (slot === "hat" && look.hat !== "none" && Object.hasOwn(HEADWEAR, look.hat)) {
    const sprite = HEADWEAR[look.hat as keyof typeof HEADWEAR];
    parts.push({ sprite, at: fitItem(sprite), tint: TINT[look.hatColor] });
  } else if (slot === "bag" && look.bag !== "none") {
    const sprite = BAGS[look.bag];
    parts.push({ sprite, at: fitItem(sprite), tint: TINT[look.bagColor] });
  } else if (slot === "glasses" && look.glasses !== "none") {
    const sprite = GLASSES[look.glasses];
    parts.push({ sprite, at: fitItem(sprite), tint: TINT[look.glassesColor] });
  } else if (slot === "neckwear" && look.neckwear !== "none") {
    const sprite = NECKWEAR[look.neckwear];
    parts.push({ sprite, at: fitItem(sprite), tint: TINT[look.neckwearColor] });
  }
  if (parts.length === 0) return null;
  const thumbnail = parts.every(part => part.sprite.sheet === "clothing" || part.sprite.sheet === "bags" || part.sprite.sheet === "accessories") ? look[slot] : null;
  if (thumbnail) return <span aria-hidden="true" data-slot={slot} style={{ position: "relative", display: "inline-block", width: size, height: size, maxWidth: "100%" }}>
    <Image src={`/tree/block-world/wardrobe-thumbs-v3/${thumbnail}.webp`} alt="" width={144} height={144} sizes="96px" unoptimized
      draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain", filter: parts[0].tint, imageRendering: "pixelated", userSelect: "none" }} />
  </span>;
  return <span aria-hidden="true" style={{ position: "relative", display: "inline-block", width: size, height: size, maxWidth: "100%" }}>
    {parts.map((part, index) => <Part key={index} slot={slot} {...part} />)}
  </span>;
}

function fitItem(sprite: Sprite, box: Rect = [7, 7, 86, 86]): Rect {
  const ratio = sprite.crop[2] / sprite.crop[3];
  const width = Math.min(box[2], box[3] * ratio);
  const height = width / ratio;
  return [(box[0] + (box[2] - width) / 2) * 1.8, (box[1] + (box[3] - height) / 2) * 3, width * 1.8, height * 3];
}

function Part({ sprite, at, tint, slot }: { sprite: Sprite; at: Rect; tint?: string; slot?: string }) {
  const sheet = SHEETS[sprite.sheet];
  const [x, y, width, height] = sprite.crop;
  const outer: CSSProperties = {
    position: "absolute", left: `${at[0] / 1.8}%`, top: `${at[1] / 3}%`,
    width: `${at[2] / 1.8}%`, height: `${at[3] / 3}%`, overflow: "hidden",
    clipPath: sprite.outline, filter: tint && tint !== "none" ? tint : undefined,
    pointerEvents: "none",
  };
  return <span aria-hidden="true" data-slot={slot} style={outer}>
    <span style={{ position: "absolute", left: `${-x / width * 100}%`, top: `${-y / height * 100}%`,
      width: `${sheet.width / width * 100}%`, height: `${sheet.height / height * 100}%` }}>
      <Image src={`/tree/_next/image?url=${encodeURIComponent(sheet.src)}&w=640&q=82`} unoptimized alt="" fill sizes="640px" draggable={false}
        loading="eager" style={{ objectFit: "fill", imageRendering: "pixelated", userSelect: "none" }} />
    </span>
  </span>;
}

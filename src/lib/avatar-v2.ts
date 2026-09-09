/** Shared, server-safe block wardrobe catalog. Saved choices contain no image URLs or adjustable coordinates. */
export const LOOK_OPTIONS = {
  face: ["human", "rabbit", "cat"],
  skin: ["peach", "honey", "cocoa"],
  hair: ["short", "bob", "pigtails", "long"],
  hairColor: ["chestnut", "ink", "honey", "rose"],
  eyes: ["bright", "smile", "wink"],
  top: ["sweatshirt", "stripe", "hoodie", "blazer", "dress"],
  topColor: ["cream", "sage", "rose", "lilac", "navy", "apricot"],
  bottom: ["shorts", "skirt", "pants"],
  bottomColor: ["sage", "navy", "cream", "rose", "lilac", "apricot"],
  shoes: ["sneakers", "loafers", "boots"],
  shoeColor: ["apricot", "cream", "navy", "rose", "sage", "lilac"],
  hat: ["none", "beret", "cap", "bow"],
  hatColor: ["sage", "rose", "cream", "lilac", "navy", "apricot"],
} as const;

export type LookField = keyof typeof LOOK_OPTIONS;
export type PaperDollLook = { kind: "paperdoll"; version: 2 } & {
  [K in LookField]: (typeof LOOK_OPTIONS)[K][number];
};


/** Read compatibility only. The wardrobe and new saves use the restored v2 catalog. */
export const SAVED_V3_LOOK_OPTIONS = {
  ...LOOK_OPTIONS,
  top: [...LOOK_OPTIONS.top, "tee", "oversized_tee", "polo", "soccer_jersey", "basketball_jersey", "baseball_jersey", "denim_jacket", "cardigan", "flare_dress", "long_dress"],
  bottom: [...LOOK_OPTIONS.bottom, "sport_shorts", "cargo_pants", "leggings", "long_skirt"],
  shoes: [...LOOK_OPTIONS.shoes, "cleats", "sandals", "high_tops"],
  hat: [...LOOK_OPTIONS.hat, "bucket_hat", "beanie", "crown"],
  bag: ["none", "backpack", "crossbody", "tote", "satchel"],
  bagColor: LOOK_OPTIONS.topColor,
  glasses: ["none", "round_glasses", "square_glasses", "sunglasses"],
  glassesColor: LOOK_OPTIONS.topColor,
  neckwear: ["none", "scarf", "bandana", "pendant"],
  neckwearColor: LOOK_OPTIONS.topColor,
} as const;
export type SavedV3PaperDollLook = { kind: "paperdoll"; version: 3 } & {
  [K in keyof typeof SAVED_V3_LOOK_OPTIONS]: (typeof SAVED_V3_LOOK_OPTIONS)[K][number];
};
export type StoredPaperDollLook = PaperDollLook | SavedV3PaperDollLook;

/** Nearest original garment for choices made during the withdrawn expansion. */
const ORIGINAL_GARMENTS = {
  top: { tee: "sweatshirt", oversized_tee: "sweatshirt", polo: "stripe", soccer_jersey: "stripe",
    basketball_jersey: "sweatshirt", baseball_jersey: "blazer", denim_jacket: "blazer",
    cardigan: "blazer", flare_dress: "dress", long_dress: "dress" },
  bottom: { sport_shorts: "shorts", cargo_pants: "pants", leggings: "pants", long_skirt: "skirt" },
  shoes: { cleats: "sneakers", sandals: "loafers", high_tops: "sneakers" },
  hat: { bucket_hat: "cap", beanie: "beret", crown: "none" },
} satisfies { [K in "top" | "bottom" | "shoes" | "hat"]:
  Record<Exclude<SavedV3PaperDollLook[K], PaperDollLook[K]>, PaperDollLook[K]> };

export const DEFAULT_LOOK: PaperDollLook = {
  kind: "paperdoll", version: 2,
  face: "human", skin: "peach", hair: "pigtails", hairColor: "chestnut", eyes: "bright",
  top: "sweatshirt", topColor: "cream", bottom: "shorts", bottomColor: "sage",
  shoes: "sneakers", shoeColor: "apricot", hat: "none", hatColor: "sage",
};

export const CLOTH_COLORS = {
  cream: { name: "바닐라", fill: "#F3EAD5", shade: "#D9CBB0", light: "#FFF9ED" },
  sage: { name: "세이지", fill: "#91A27D", shade: "#687E61", light: "#BAC9A4" },
  rose: { name: "로즈", fill: "#D9959F", shade: "#B46E7E", light: "#F1BEC5" },
  lilac: { name: "라일락", fill: "#AE9AC5", shade: "#837097", light: "#D4C5E4" },
  navy: { name: "잉크 블루", fill: "#53697E", shade: "#37495D", light: "#8297A9" },
  apricot: { name: "살구", fill: "#DB9267", shade: "#B56E48", light: "#F3BA8D" },
} as const;

export const SKIN_COLORS = {
  peach: { name: "피치", fill: "#F4CFB7", shade: "#DEAB90" },
  honey: { name: "허니", fill: "#D9A77D", shade: "#BE855F" },
  cocoa: { name: "코코아", fill: "#AE785A", shade: "#8A5945" },
} as const;

export const HAIR_COLORS = {
  chestnut: { name: "밤색", fill: "#79513F", shade: "#573C33", light: "#AD7B59" },
  ink: { name: "흑갈색", fill: "#403D40", shade: "#292A30", light: "#6B6065" },
  honey: { name: "꿀빛", fill: "#C29B62", shade: "#927044", light: "#E4C48B" },
  rose: { name: "로즈 브라운", fill: "#B97F88", shade: "#8C5A69", light: "#E0ABB1" },
} as const;

export const LOOK_LABELS: Record<string, string> = {
  human: "사람", rabbit: "토끼", cat: "고양이", short: "블록 쇼트", bob: "반듯한 단발",
  pigtails: "낮은 양갈래", long: "내추럴 롱", bright: "반짝 눈", smile: "활짝 웃음", wink: "윙크",
  sweatshirt: "데일리 맨투맨", stripe: "스트라이프 티", hoodie: "포근한 후디", blazer: "클래식 재킷",
  dress: "피크닉 원피스", shorts: "롤업 쇼츠", skirt: "플리츠 스커트", pants: "스트레이트 팬츠",
  sneakers: "컬러 스니커즈", loafers: "메리제인 로퍼", boots: "레이스업 부츠",
  none: "선택 안 함", beret: "울 베레모", cap: "볼 캡", bow: "작은 리본",
};

/** Strictly validate both stored versions before converting in memory; never mutate saved data. */
export function parsePaperDollLook(raw: unknown): PaperDollLook | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (!Object.hasOwn(value, "kind") || !Object.hasOwn(value, "version")) return null;
  if (value.kind !== "paperdoll" || (value.version !== 2 && value.version !== 3)) return null;
  const options: Record<string, readonly string[]> = value.version === 2 ? LOOK_OPTIONS : SAVED_V3_LOOK_OPTIONS;
  const fields = Object.keys(options);
  const allowed = new Set(["kind", "version", ...fields]);
  const keys = Object.keys(value);
  if (keys.length !== allowed.size || keys.some(key => !allowed.has(key))) return null;
  for (const field of fields) {
    if (!Object.hasOwn(value, field) || !options[field].includes(value[field] as string)) return null;
  }
  const clean: Record<string, unknown> = { kind: "paperdoll", version: 2 };
  for (const field of Object.keys(LOOK_OPTIONS) as LookField[]) {
    const selected = value[field] as string;
    if ((LOOK_OPTIONS[field] as readonly string[]).includes(selected)) clean[field] = selected;
    else {
      const replacements = ORIGINAL_GARMENTS[field as keyof typeof ORIGINAL_GARMENTS] as Record<string, string> | undefined;
      if (!replacements || !Object.hasOwn(replacements, selected)) return null;
      clean[field] = replacements[selected];
    }
  }
  return clean as PaperDollLook;
}

/** Only original choices are offered by the restored wardrobe and canonical saves. */
export function isLookAvailable(look: PaperDollLook): boolean {
  return look.version === 2 && parsePaperDollLook(look) !== null;
}

/** Older image avatars stay untouched; v3 choices use their matching original garments. */
export function normalizeLook(raw: unknown): PaperDollLook {
  return parsePaperDollLook(raw) ?? { ...DEFAULT_LOOK };
}

export const LOOK_PRESETS: Array<{ id: string; name: string; description: string; look: PaperDollLook }> = [
  { id: "daily", name: "느긋한 오후", description: "크림 맨투맨 + 세이지 쇼츠", look: { ...DEFAULT_LOOK } },
  { id: "campus", name: "오늘의 주인공", description: "클래식 재킷 + 플리츠 스커트", look: { ...DEFAULT_LOOK, hair: "bob", hairColor: "ink", top: "blazer", topColor: "navy", bottom: "skirt", bottomColor: "navy", shoes: "loafers", shoeColor: "navy", hat: "bow", hatColor: "rose" } },
  { id: "weekend", name: "주말 산책", description: "스트라이프 + 편안한 팬츠", look: { ...DEFAULT_LOOK, hair: "short", skin: "honey", top: "stripe", topColor: "sage", bottom: "pants", bottomColor: "cream", shoeColor: "navy", hat: "cap" } },
  { id: "bunny", name: "토끼의 피크닉", description: "토끼 얼굴 + 로즈 원피스", look: { ...DEFAULT_LOOK, face: "rabbit", top: "dress", topColor: "rose", bottom: "shorts", shoes: "loafers", shoeColor: "cream", hat: "bow", hatColor: "rose" } },
  { id: "cozy", name: "구름처럼 포근해", description: "라일락 후디 + 스니커즈", look: { ...DEFAULT_LOOK, hair: "long", hairColor: "honey", skin: "cocoa", top: "hoodie", topColor: "lilac", bottom: "pants", bottomColor: "cream", shoeColor: "lilac" } },
  { id: "cat", name: "고양이의 하루", description: "고양이 얼굴 + 살구 맨투맨", look: { ...DEFAULT_LOOK, face: "cat", topColor: "apricot", bottom: "skirt", bottomColor: "cream", shoeColor: "sage", hat: "beret", hatColor: "sage" } },
];

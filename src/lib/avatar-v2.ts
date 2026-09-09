/** Shared, server-safe block wardrobe catalog. Saved choices contain no image URLs or adjustable coordinates. */
/** Frozen v2 vocabulary: new v3 items must never be accepted in a v2 envelope. */
export const LEGACY_LOOK_OPTIONS = {
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

export const LOOK_OPTIONS = {
  ...LEGACY_LOOK_OPTIONS,
  top: [...LEGACY_LOOK_OPTIONS.top, "tee", "oversized_tee", "polo", "soccer_jersey", "basketball_jersey", "baseball_jersey", "denim_jacket", "cardigan", "flare_dress", "long_dress"],
  bottom: [...LEGACY_LOOK_OPTIONS.bottom, "sport_shorts", "cargo_pants", "leggings", "long_skirt"],
  shoes: [...LEGACY_LOOK_OPTIONS.shoes, "cleats", "sandals", "high_tops"],
  hat: [...LEGACY_LOOK_OPTIONS.hat, "bucket_hat", "beanie", "crown"],
  bag: ["none", "backpack", "crossbody", "tote", "satchel"],
  bagColor: LEGACY_LOOK_OPTIONS.topColor,
  glasses: ["none", "round_glasses", "square_glasses", "sunglasses"],
  glassesColor: LEGACY_LOOK_OPTIONS.topColor,
  neckwear: ["none", "scarf", "bandana", "pendant"],
  neckwearColor: LEGACY_LOOK_OPTIONS.topColor,
} as const;

/** Only artwork that is installed and visually checked may be offered or saved.
 * Keep the full v3 read vocabulary above so compatible readers can deploy first. */
export const AVAILABLE_LOOK_OPTIONS = LOOK_OPTIONS;

export type LookField = keyof typeof LOOK_OPTIONS;
export type LegacyPaperDollLook = { kind: "paperdoll"; version: 2 } & {
  [K in keyof typeof LEGACY_LOOK_OPTIONS]: (typeof LEGACY_LOOK_OPTIONS)[K][number];
};
/** The canonical in-memory and newly saved shape. Reading v2 never writes it back. */
export type PaperDollLook = { kind: "paperdoll"; version: 3 } & {
  [K in LookField]: (typeof LOOK_OPTIONS)[K][number];
};
export type StoredPaperDollLook = LegacyPaperDollLook | PaperDollLook;

export const DEFAULT_LOOK_V2: LegacyPaperDollLook = {
  kind: "paperdoll", version: 2,
  face: "human", skin: "peach", hair: "pigtails", hairColor: "chestnut", eyes: "bright",
  top: "sweatshirt", topColor: "cream", bottom: "shorts", bottomColor: "sage",
  shoes: "sneakers", shoeColor: "apricot", hat: "none", hatColor: "sage",
};

export const DEFAULT_LOOK: PaperDollLook = {
  ...DEFAULT_LOOK_V2, version: 3,
  bag: "none", bagColor: "sage", glasses: "none", glassesColor: "navy",
  neckwear: "none", neckwearColor: "rose",
};

export const TOP_META: Record<PaperDollLook["top"], {
  sleeve: "long" | "short" | "sleeveless";
  coversBottom: boolean;
  group: "everyday" | "sport" | "outerwear" | "dress";
}> = {
  sweatshirt: { sleeve: "long", coversBottom: false, group: "everyday" },
  stripe: { sleeve: "long", coversBottom: false, group: "everyday" },
  hoodie: { sleeve: "long", coversBottom: false, group: "outerwear" },
  blazer: { sleeve: "long", coversBottom: false, group: "outerwear" },
  dress: { sleeve: "short", coversBottom: true, group: "dress" },
  tee: { sleeve: "short", coversBottom: false, group: "everyday" },
  oversized_tee: { sleeve: "short", coversBottom: false, group: "everyday" },
  polo: { sleeve: "short", coversBottom: false, group: "everyday" },
  soccer_jersey: { sleeve: "short", coversBottom: false, group: "sport" },
  basketball_jersey: { sleeve: "sleeveless", coversBottom: false, group: "sport" },
  baseball_jersey: { sleeve: "short", coversBottom: false, group: "sport" },
  denim_jacket: { sleeve: "long", coversBottom: false, group: "outerwear" },
  cardigan: { sleeve: "long", coversBottom: false, group: "outerwear" },
  flare_dress: { sleeve: "short", coversBottom: true, group: "dress" },
  long_dress: { sleeve: "sleeveless", coversBottom: true, group: "dress" },
};

export function isDressTop(top: PaperDollLook["top"]): boolean {
  return TOP_META[top].coversBottom;
}

/** One policy for previews and selections; accessories never change another slot. */
export function changeLook<K extends LookField>(look: PaperDollLook, field: K, value: PaperDollLook[K]): PaperDollLook {
  return {
    ...look, [field]: value,
    ...(field === "hair" || field === "hairColor" ? { face: "human" as const } : {}),
    ...((field === "bottom" || field === "bottomColor") && isDressTop(look.top) ? { top: "sweatshirt" as const } : {}),
  };
}

export function isLookAvailable(look: PaperDollLook): boolean {
  return (Object.keys(AVAILABLE_LOOK_OPTIONS) as LookField[]).every(field =>
    (AVAILABLE_LOOK_OPTIONS[field] as readonly string[]).includes(look[field]));
}

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
  tee: "베이직 반팔", oversized_tee: "오버핏 반팔", polo: "카라 반팔",
  soccer_jersey: "축구 유니폼", basketball_jersey: "농구 유니폼", baseball_jersey: "야구 유니폼",
  denim_jacket: "데님 재킷", cardigan: "포근한 카디건", flare_dress: "플레어 드레스", long_dress: "롱 드레스",
  sport_shorts: "스포츠 반바지", cargo_pants: "카고 팬츠", leggings: "편안한 레깅스", long_skirt: "롱 스커트",
  cleats: "축구화", sandals: "여름 샌들", high_tops: "하이탑 운동화",
  bucket_hat: "버킷햇", beanie: "니트 비니", crown: "작은 왕관",
  backpack: "모험 백팩", crossbody: "크로스백", tote: "데일리 토트백", satchel: "사각 책가방",
  round_glasses: "동그란 안경", square_glasses: "네모 안경", sunglasses: "선글라스",
  scarf: "포근한 목도리", bandana: "작은 반다나", pendant: "별 펜던트",
};

/** Strict allowlist: reject malformed, future-version and resource-injection payloads. */
export function parsePaperDollLook(raw: unknown): PaperDollLook | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(value, "kind") || !Object.prototype.hasOwnProperty.call(value, "version")) return null;
  if (value.kind !== "paperdoll" || (value.version !== 2 && value.version !== 3)) return null;
  const options = value.version === 2 ? LEGACY_LOOK_OPTIONS : LOOK_OPTIONS;
  const fields = Object.keys(options) as LookField[];
  const allowed = new Set<string>(["kind", "version", ...fields]);
  const keys = Object.keys(value);
  if (keys.length !== allowed.size || keys.some(key => !allowed.has(key))) return null;
  const clean: Record<string, unknown> = { ...DEFAULT_LOOK };
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(value, field)) return null;
    const choices = (options as Record<string, readonly unknown[]>)[field];
    if (!choices.includes(value[field])) return null;
    clean[field] = value[field];
  }
  return clean as PaperDollLook;
}

/** Valid v2 choices survive unchanged; non-paperdoll legacy art is not overwritten. */
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
  { id: "soccer", name: "오늘의 축구 선수", description: "유니폼 + 스포츠 반바지 + 축구화", look: { ...DEFAULT_LOOK, hair: "short", top: "soccer_jersey", topColor: "sage", bottom: "sport_shorts", bottomColor: "navy", shoes: "cleats", shoeColor: "navy" } },
  { id: "royal", name: "숲속의 작은 왕관", description: "롱 드레스 + 왕관 + 별 펜던트", look: { ...DEFAULT_LOOK, hair: "long", top: "long_dress", topColor: "rose", shoes: "loafers", shoeColor: "cream", hat: "crown", hatColor: "cream", neckwear: "pendant", neckwearColor: "cream" } },
  { id: "explorer", name: "숲길 탐험가", description: "데님 재킷 + 카고 팬츠 + 백팩", look: { ...DEFAULT_LOOK, hair: "short", skin: "honey", top: "denim_jacket", topColor: "navy", bottom: "cargo_pants", bottomColor: "sage", shoes: "boots", shoeColor: "cream", bag: "backpack", bagColor: "sage", hat: "bucket_hat", hatColor: "cream" } },
  { id: "daytrip", name: "가벼운 하루", description: "반팔 + 동그란 안경 + 크로스백", look: { ...DEFAULT_LOOK, top: "tee", topColor: "cream", bottom: "pants", bottomColor: "navy", shoes: "sandals", shoeColor: "cream", bag: "crossbody", bagColor: "sage", glasses: "round_glasses", glassesColor: "navy" } },
];

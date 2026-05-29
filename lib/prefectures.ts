/** 都道府県（加盟店登録・検索フィルタ用） */

export const PREFECTURES = [
  "北海道",
  "青森県",
  "岩手県",
  "宮城県",
  "秋田県",
  "山形県",
  "福島県",
  "茨城県",
  "栃木県",
  "群馬県",
  "埼玉県",
  "千葉県",
  "東京都",
  "神奈川県",
  "新潟県",
  "富山県",
  "石川県",
  "福井県",
  "山梨県",
  "長野県",
  "岐阜県",
  "静岡県",
  "愛知県",
  "三重県",
  "滋賀県",
  "京都府",
  "大阪府",
  "兵庫県",
  "奈良県",
  "和歌山県",
  "鳥取県",
  "島根県",
  "岡山県",
  "広島県",
  "山口県",
  "徳島県",
  "香川県",
  "愛媛県",
  "高知県",
  "福岡県",
  "佐賀県",
  "長崎県",
  "熊本県",
  "大分県",
  "宮崎県",
  "鹿児島県",
  "沖縄県",
] as const;

export type Prefecture = (typeof PREFECTURES)[number];

export const PREFECTURE_PLACEHOLDER = "";

/** 地域別（select の optgroup 用） */
export const PREFECTURE_GROUPS: { label: string; prefectures: readonly string[] }[] = [
  { label: "北海道", prefectures: ["北海道"] },
  {
    label: "東北",
    prefectures: ["青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"],
  },
  {
    label: "関東",
    prefectures: [
      "茨城県",
      "栃木県",
      "群馬県",
      "埼玉県",
      "千葉県",
      "東京都",
      "神奈川県",
    ],
  },
  {
    label: "中部",
    prefectures: [
      "新潟県",
      "富山県",
      "石川県",
      "福井県",
      "山梨県",
      "長野県",
      "岐阜県",
      "静岡県",
      "愛知県",
    ],
  },
  {
    label: "近畿",
    prefectures: ["三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県"],
  },
  {
    label: "中国",
    prefectures: ["鳥取県", "島根県", "岡山県", "広島県", "山口県"],
  },
  { label: "四国", prefectures: ["徳島県", "香川県", "愛媛県", "高知県"] },
  {
    label: "九州・沖縄",
    prefectures: [
      "福岡県",
      "佐賀県",
      "長崎県",
      "熊本県",
      "大分県",
      "宮崎県",
      "鹿児島県",
      "沖縄県",
    ],
  },
];

export function isValidPrefecture(value: string): value is Prefecture {
  return (PREFECTURES as readonly string[]).includes(value);
}

/** 車両検索: 広域エリア（直引き・引取の目安） */
export const LISTING_SEARCH_REGIONS = [
  { slug: "hokkaido", label: "北海道", prefectures: ["北海道"] as const },
  {
    slug: "tohoku",
    label: "東北",
    prefectures: ["青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"] as const,
  },
  {
    slug: "kanto",
    label: "関東",
    prefectures: [
      "茨城県",
      "栃木県",
      "群馬県",
      "埼玉県",
      "千葉県",
      "東京都",
      "神奈川県",
    ] as const,
  },
  {
    slug: "chubu",
    label: "中部",
    prefectures: [
      "新潟県",
      "富山県",
      "石川県",
      "福井県",
      "山梨県",
      "長野県",
      "岐阜県",
      "静岡県",
      "愛知県",
    ] as const,
  },
  {
    slug: "kansai",
    label: "関西",
    prefectures: ["三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県"] as const,
  },
  {
    slug: "chugoku",
    label: "中国",
    prefectures: ["鳥取県", "島根県", "岡山県", "広島県", "山口県"] as const,
  },
  {
    slug: "shikoku",
    label: "四国",
    prefectures: ["徳島県", "香川県", "愛媛県", "高知県"] as const,
  },
  {
    slug: "kyushu",
    label: "九州・沖縄",
    prefectures: [
      "福岡県",
      "佐賀県",
      "長崎県",
      "熊本県",
      "大分県",
      "宮崎県",
      "鹿児島県",
      "沖縄県",
    ] as const,
  },
] as const;

export type ListingSearchRegionSlug = (typeof LISTING_SEARCH_REGIONS)[number]["slug"];

export function parseListingSearchRegion(
  raw: string | undefined,
): ListingSearchRegionSlug | undefined {
  const slug = raw?.trim();
  if (!slug) return undefined;
  return LISTING_SEARCH_REGIONS.some((r) => r.slug === slug)
    ? (slug as ListingSearchRegionSlug)
    : undefined;
}

export function prefecturesInListingSearchRegion(
  slug: ListingSearchRegionSlug,
): readonly string[] {
  return LISTING_SEARCH_REGIONS.find((r) => r.slug === slug)?.prefectures ?? [];
}

export function isPrefectureInListingSearchRegion(
  prefecture: string,
  slug: ListingSearchRegionSlug,
): boolean {
  return (prefecturesInListingSearchRegion(slug) as readonly string[]).includes(prefecture);
}

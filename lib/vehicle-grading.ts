export const GRADING_ITEMS = [
  { key: "total", label: "総合", short: "総合" },
  { key: "engine", label: "E（エンジン）", short: "E" },
  { key: "front", label: "F（フロント足回り）", short: "F" },
  { key: "exterior", label: "外（外装）", short: "外" },
  { key: "rear", label: "R（リア足回り）", short: "R" },
  { key: "electrical", label: "電（電装・保安）", short: "電" },
  { key: "frame", label: "車（車台）", short: "車" },
] as const;

export const GRADE_OPTIONS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as const;

export const GRADE_DB_COLUMNS: Record<
  (typeof GRADING_ITEMS)[number]["key"],
  string
> = {
  total: "grade_total",
  engine: "grade_engine",
  front: "grade_front",
  exterior: "grade_exterior",
  rear: "grade_rear",
  electrical: "grade_electrical",
  frame: "grade_frame",
};

/** 表示例（スライド・サンプル用） */
export const SAMPLE_SCORES: Record<(typeof GRADING_ITEMS)[number]["key"], number> = {
  total: 5,
  engine: 6,
  front: 5,
  exterior: 4,
  rear: 5,
  electrical: 6,
  frame: 5,
};

export const GRADE_SCALE = [
  {
    score: 10,
    title: "未登録新車",
    detail: null,
  },
  {
    score: 9,
    title: "登録済未使用車",
    detail: null,
  },
  {
    score: 8,
    title: "極上美車",
    detail: "ほぼ新車レベル",
  },
  {
    score: 7,
    title: "非常に綺麗な中古車",
    detail: "低走行・状態良好",
  },
  {
    score: 6,
    title: "美車中古",
    detail: "軽微な使用感のみ",
  },
  {
    score: 5,
    title: "良好中古車",
    detail: "立ちゴケ程度・色艶あり・機能面問題なし",
  },
  {
    score: 4,
    title: "経年中古車",
    detail: "消耗・傷・サビあり",
  },
  {
    score: 3,
    title: "ダメージ大",
    detail: "加修前提",
  },
  {
    score: 2,
    title: "ジャンク",
    detail: "不動・部品取りベース",
  },
  {
    score: 1,
    title: "書付きフレームレベル",
    detail: "大幅欠品あり",
  },
] as const;

import type { CardRank, Role4 } from "@/types/game";

export const DECK_SIZE = 80;
export const JESTER_RANK = 13 as const;
export const MVP_PLAYER_COUNT = 4;

/** rank → 해당 숫자 카드 장수 (조커 제외) */
export const RANK_COUNTS: Record<Exclude<CardRank, 13>, number> = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  10: 10,
  11: 11,
  12: 12,
};

export const RANK_LABELS_KO: Record<CardRank, string> = {
  1: "달무티",
  2: "대주교",
  3: "시종장",
  4: "남작부인",
  5: "수녀원장",
  6: "기사",
  7: "재봉사",
  8: "석공",
  9: "요리사",
  10: "양치기",
  11: "광부",
  12: "농노",
  13: "어릿광대",
};

export const ROLE_LABELS_KO: Record<Role4, string> = {
  dalmuti: "달무티",
  chancellor: "총리대신",
  merchant: "평민",
  peasant: "농노",
};

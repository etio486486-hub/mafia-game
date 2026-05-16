import { JESTER_RANK } from "@/lib/constants";
import type { Card, CardRank } from "@/types/game";

export type PlayAnalysisError =
  | "EMPTY_PLAY"
  | "MULTIPLE_JESTERS_ALONE"
  | "MIXED_RANKS";

export interface PlayAnalysis {
  isValid: boolean;
  effectiveRank: CardRank | null;
  count: number;
  reason?: PlayAnalysisError;
}

/**
 * 낼 카드 묶음 해석.
 * - 비조커는 모두 같은 rank여야 함
 * - 조커 단독 1장 → 13 (최약)
 * - 조커만 2장 이상 → invalid
 * - 조커 + 숫자 카드 → 숫자 rank로 와일드
 */
export function analyzePlay(cards: Card[]): PlayAnalysis {
  const count = cards.length;

  if (count === 0) {
    return { isValid: false, effectiveRank: null, count: 0, reason: "EMPTY_PLAY" };
  }

  const nonJesters = cards.filter((c) => c.rank !== JESTER_RANK);

  if (nonJesters.length === 0) {
    if (count === 1) {
      return { isValid: true, effectiveRank: JESTER_RANK, count: 1 };
    }
    return {
      isValid: false,
      effectiveRank: null,
      count,
      reason: "MULTIPLE_JESTERS_ALONE",
    };
  }

  const ranks = new Set(nonJesters.map((c) => c.rank));
  if (ranks.size > 1) {
    return {
      isValid: false,
      effectiveRank: null,
      count,
      reason: "MIXED_RANKS",
    };
  }

  return {
    isValid: true,
    effectiveRank: nonJesters[0].rank,
    count,
  };
}

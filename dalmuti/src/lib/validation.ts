import { analyzePlay, type PlayAnalysisError } from "@/lib/playAnalysis";
import type { Card, CardRank, Play } from "@/types/game";

/** 가장 강한 카드(달무티). 이 rank를 내면 같은 트릭에서 이길 수 없음 */
export const STRONGEST_RANK: CardRank = 1;

export type ValidatePlayError =
  | PlayAnalysisError
  | "CANNOT_BEAT"
  | "INVALID_PLAY";

/** 숫자가 작을수록 강함 */
export function isStrongerRank(rank: CardRank, than: CardRank): boolean {
  return rank < than;
}

/** topPlay를 이기는지 (장수 일치 + 더 강한 rank) */
export function canBeat(previous: Play, next: Play): boolean {
  if (next.count !== previous.count) {
    return false;
  }
  if (previous.effectiveRank === STRONGEST_RANK) {
    return false;
  }
  return isStrongerRank(next.effectiveRank, previous.effectiveRank);
}

export interface ValidatePlayResult {
  ok: boolean;
  play?: Play;
  reason?: ValidatePlayError;
}

/**
 * 카드 내기 검증.
 * @param topPlay null이면 선(리드) — 유효한 세트면 통과
 */
export function validatePlay(
  cards: Card[],
  topPlay: Play | null,
  playerId = "",
): ValidatePlayResult {
  const analysis = analyzePlay(cards);

  if (!analysis.isValid || analysis.effectiveRank === null) {
    return {
      ok: false,
      reason: analysis.reason ?? "INVALID_PLAY",
    };
  }

  const play: Play = {
    playerId,
    cards,
    effectiveRank: analysis.effectiveRank,
    count: analysis.count,
  };

  if (topPlay === null) {
    return { ok: true, play };
  }

  if (!canBeat(topPlay, play)) {
    return { ok: false, reason: "CANNOT_BEAT" };
  }

  return { ok: true, play };
}

export function canPlayCards(
  cards: Card[],
  topPlay: Play | null,
  playerId = "",
): boolean {
  return validatePlay(cards, topPlay, playerId).ok;
}

export function buildPlay(
  playerId: string,
  cards: Card[],
): Play | null {
  const result = validatePlay(cards, null, playerId);
  return result.ok && result.play ? result.play : null;
}

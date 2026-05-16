import type { Card } from "@/types/game";

/** 강한 카드(작은 숫자)가 왼쪽 */
export function sortHand(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
}

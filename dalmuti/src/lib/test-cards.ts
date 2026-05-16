import type { Card, CardRank } from "@/types/game";

let sequence = 0;

/** 테스트용 카드 팩토리 */
export function testCard(rank: CardRank, id?: string): Card {
  sequence += 1;
  return { id: id ?? `test-${sequence}`, rank };
}

export function resetTestCardSequence(): void {
  sequence = 0;
}

import { analyzePlay } from "@/lib/playAnalysis";
import { JESTER_RANK } from "@/lib/constants";
import { validatePlay } from "@/lib/validation";
import type { Card, Play } from "@/types/game";

function playKey(cards: Card[]): string {
  return cards
    .map((c) => c.id)
    .sort()
    .join(",");
}

/** hand에서 size장짜리 유효한 플레이 후보 */
export function enumeratePlays(
  hand: Card[],
  size: number,
  topPlay: Play | null,
): Card[][] {
  const results: Card[][] = [];
  const seen = new Set<string>();

  const jokers = hand.filter((c) => c.rank === JESTER_RANK);
  const byRank = new Map<number, Card[]>();

  for (const card of hand) {
    if (card.rank === JESTER_RANK) continue;
    const list = byRank.get(card.rank) ?? [];
    list.push(card);
    byRank.set(card.rank, list);
  }

  const tryAdd = (cards: Card[]) => {
    if (cards.length !== size) return;
    const key = playKey(cards);
    if (seen.has(key)) return;
    if (!validatePlay(cards, topPlay).ok) return;
    seen.add(key);
    results.push(cards);
  };

  if (size === 1 && jokers.length > 0) {
    tryAdd([jokers[0]]);
  }

  for (const cards of byRank.values()) {
    for (let j = 0; j <= jokers.length; j++) {
      const fromRank = size - j;
      if (fromRank < 1 || fromRank > cards.length) continue;
      tryAdd([...cards.slice(0, fromRank), ...jokers.slice(0, j)]);
    }
  }

  return results;
}

export function enumerateAllPlays(
  hand: Card[],
  topPlay: Play | null,
): Card[][] {
  if (topPlay) {
    return enumeratePlays(hand, topPlay.count, topPlay);
  }

  const all: Card[][] = [];
  const seen = new Set<string>();
  const maxSize = Math.min(hand.length, 12);

  for (let size = 1; size <= maxSize; size++) {
    for (const play of enumeratePlays(hand, size, null)) {
      const key = playKey(play);
      if (!seen.has(key)) {
        seen.add(key);
        all.push(play);
      }
    }
  }
  return all;
}

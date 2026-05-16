import {
  DECK_SIZE,
  JESTER_RANK,
  MVP_PLAYER_COUNT,
  RANK_COUNTS,
} from "@/lib/constants";
import type { Card, CardRank } from "@/types/game";

export type RandomFn = () => number;

function nextCardId(sequence: number): string {
  return `card-${sequence}`;
}

/** 80장 덱 생성: rank N은 N장, 어릿광대 2장 */
export function createDeck(): Card[] {
  const cards: Card[] = [];
  let sequence = 0;

  for (const [rankKey, count] of Object.entries(RANK_COUNTS)) {
    const rank = Number(rankKey) as CardRank;
    for (let i = 0; i < count; i++) {
      cards.push({ id: nextCardId(sequence++), rank });
    }
  }

  for (let i = 0; i < 2; i++) {
    cards.push({ id: nextCardId(sequence++), rank: JESTER_RANK });
  }

  if (cards.length !== DECK_SIZE) {
    throw new Error(`Expected ${DECK_SIZE} cards, got ${cards.length}`);
  }

  return cards;
}

/** Fisher–Yates 셔플 (기본: Math.random) */
export function shuffle<T>(items: T[], random: RandomFn = Math.random): T[] {
  const deck = [...items];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/**
 * 셔플된 덱을 시계 방향으로 균등 분배.
 * 4인·80장이면 각 20장.
 */
export function dealEven(
  deck: Card[],
  playerCount: number = MVP_PLAYER_COUNT,
): Card[][] {
  if (playerCount < 1) {
    throw new Error("playerCount must be at least 1");
  }
  if (deck.length % playerCount !== 0) {
    throw new Error(
      `Cannot deal ${deck.length} cards evenly to ${playerCount} players`,
    );
  }

  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  deck.forEach((card, index) => {
    hands[index % playerCount].push(card);
  });
  return hands;
}

export function createShuffledDeck(random: RandomFn = Math.random): Card[] {
  return shuffle(createDeck(), random);
}

export function createAndDeal(
  playerCount: number = MVP_PLAYER_COUNT,
  random: RandomFn = Math.random,
): { deck: Card[]; hands: Card[][] } {
  const deck = createShuffledDeck(random);
  const hands = dealEven(deck, playerCount);
  return { deck, hands };
}

/** 테스트·검증용: rank별 장수 집계 */
export function countByRank(cards: Card[]): Map<CardRank, number> {
  const counts = new Map<CardRank, number>();
  for (const card of cards) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }
  return counts;
}

/** 모든 카드 id가 유일한지 */
export function hasUniqueIds(cards: Card[]): boolean {
  return new Set(cards.map((c) => c.id)).size === cards.length;
}

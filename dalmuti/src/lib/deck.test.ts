import { describe, expect, it } from "vitest";
import {
  countByRank,
  createAndDeal,
  createDeck,
  dealEven,
  hasUniqueIds,
  shuffle,
} from "@/lib/deck";
import { DECK_SIZE, MVP_PLAYER_COUNT, RANK_COUNTS } from "@/lib/constants";
import type { CardRank } from "@/types/game";

describe("createDeck", () => {
  it("creates exactly 80 cards with correct rank distribution", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(DECK_SIZE);
    expect(hasUniqueIds(deck)).toBe(true);

    const counts = countByRank(deck);
    for (const [rankKey, expected] of Object.entries(RANK_COUNTS)) {
      const rank = Number(rankKey) as CardRank;
      expect(counts.get(rank)).toBe(expected);
    }
    expect(counts.get(13)).toBe(2);
  });
});

describe("shuffle", () => {
  it("preserves multiset while changing order (deterministic seed)", () => {
    const original = createDeck();
    const ranksBefore = original.map((c) => c.rank).join(",");
    const shuffled = shuffle(original, () => 0.99);
    expect(shuffled).toHaveLength(DECK_SIZE);
    expect(shuffled.map((c) => c.rank).sort().join(",")).toBe(
      ranksBefore.split(",").sort().join(","),
    );
    expect(hasUniqueIds(shuffled)).toBe(true);
  });
});

describe("dealEven", () => {
  it("deals 20 cards each to 4 players from full deck", () => {
    const deck = shuffle(createDeck());
    const hands = dealEven(deck, MVP_PLAYER_COUNT);

    expect(hands).toHaveLength(4);
    hands.forEach((hand) => expect(hand).toHaveLength(20));

    const merged = hands.flat();
    expect(merged).toHaveLength(DECK_SIZE);
    expect(hasUniqueIds(merged)).toBe(true);
    expect(new Set(merged.map((c) => c.id)).size).toBe(DECK_SIZE);
  });

  it("throws when deck size is not divisible by player count", () => {
    const partial = createDeck().slice(0, 79);
    expect(() => dealEven(partial, 4)).toThrow(/evenly/);
  });
});

describe("createAndDeal", () => {
  it("returns a full shuffled deck and four equal hands", () => {
    let call = 0;
    const random = () => {
      call += 1;
      return (call * 0.37) % 1;
    };

    const { deck, hands } = createAndDeal(4, random);
    expect(deck).toHaveLength(DECK_SIZE);
    expect(hands).toHaveLength(4);
    expect(hands.every((h) => h.length === 20)).toBe(true);

    const allIds = new Set([...deck.map((c) => c.id), ...hands.flat().map((c) => c.id)]);
    expect(allIds.size).toBe(DECK_SIZE);
  });
});

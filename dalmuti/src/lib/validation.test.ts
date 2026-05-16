import { beforeEach, describe, expect, it } from "vitest";
import {
  buildPlay,
  canBeat,
  canPlayCards,
  isStrongerRank,
  STRONGEST_RANK,
  validatePlay,
} from "@/lib/validation";
import { JESTER_RANK } from "@/lib/constants";
import { resetTestCardSequence, testCard } from "@/lib/test-cards";
import type { Play } from "@/types/game";

function play(
  rank: Play["effectiveRank"],
  count: number,
  playerId = "p1",
): Play {
  const cards = Array.from({ length: count }, () => testCard(rank));
  return {
    playerId,
    cards,
    effectiveRank: rank,
    count,
  };
}

describe("isStrongerRank", () => {
  it("lower number beats higher number", () => {
    expect(isStrongerRank(8, 9)).toBe(true);
    expect(isStrongerRank(9, 8)).toBe(false);
    expect(isStrongerRank(12, 13)).toBe(true);
  });
});

describe("canBeat", () => {
  beforeEach(() => resetTestCardSequence());

  it("requires matching count", () => {
    const lead = play(9, 4);
    const wrongCount = play(8, 3);
    expect(canBeat(lead, wrongCount)).toBe(false);
  });

  it("allows beating with lower rank number", () => {
    const lead = play(9, 4);
    const beat = play(8, 4);
    expect(canBeat(lead, beat)).toBe(true);
  });

  it("rejects equal or weaker rank", () => {
    const lead = play(6, 2);
    expect(canBeat(lead, play(6, 2))).toBe(false);
    expect(canBeat(lead, play(7, 2))).toBe(false);
  });

  it("cannot beat dalmuti (rank 1)", () => {
    const lead = play(STRONGEST_RANK, 1);
    expect(canBeat(lead, play(2, 1))).toBe(false);
    expect(canBeat(lead, play(13, 1))).toBe(false);
  });

  it("jester-led play can be beaten by rank 12", () => {
    const lead = play(13, 1);
    expect(canBeat(lead, play(12, 1))).toBe(true);
    expect(canBeat(lead, play(13, 1))).toBe(false);
  });

  it("wild jester set uses effective rank for comparison", () => {
    const lead = play(6, 3);
    const beatCards = [testCard(5), testCard(5), testCard(JESTER_RANK)];
    const beat = buildPlay("p2", beatCards);
    expect(beat).not.toBeNull();
    expect(canBeat(lead, beat!)).toBe(true);
  });
});

describe("validatePlay", () => {
  beforeEach(() => resetTestCardSequence());

  it("allows any valid set as lead", () => {
    const result = validatePlay([testCard(4), testCard(4)], null, "p1");
    expect(result.ok).toBe(true);
    expect(result.play?.effectiveRank).toBe(4);
    expect(result.play?.count).toBe(2);
  });

  it("rejects invalid sets on lead", () => {
    expect(validatePlay([], null).ok).toBe(false);
    expect(validatePlay([testCard(5), testCard(6)], null).reason).toBe(
      "MIXED_RANKS",
    );
  });

  it("requires beating top play when following", () => {
    const top = play(9, 4);
    expect(
      canPlayCards(
        [testCard(8), testCard(8), testCard(8), testCard(8)],
        top,
      ),
    ).toBe(true);
    expect(
      canPlayCards(
        [testCard(10), testCard(10), testCard(10), testCard(10)],
        top,
      ),
    ).toBe(false);
    expect(
      canPlayCards(
        [testCard(8), testCard(8), testCard(8)],
        top,
      ),
    ).toBe(false);
  });

  it("allows 1 + jester as unbeatable lead", () => {
    const cards = [testCard(1), testCard(JESTER_RANK)];
    const lead = buildPlay("p1", cards);
    expect(lead?.effectiveRank).toBe(1);
    expect(lead?.count).toBe(2);

    const top = lead!;
    expect(canPlayCards([testCard(2), testCard(2)], top)).toBe(false);
    expect(
      validatePlay([testCard(2), testCard(2)], top).reason,
    ).toBe("CANNOT_BEAT");
  });

  it("allows beating 3x2 with 2 + jester", () => {
    const top = play(3, 2);
    const cards = [testCard(2), testCard(JESTER_RANK)];
    expect(validatePlay(cards, top).ok).toBe(true);
  });
});

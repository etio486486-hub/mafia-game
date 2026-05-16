import { describe, expect, it } from "vitest";
import {
  applyPassToTrick,
  applyPlayToTrick,
  createEmptyTrick,
  shouldEndTrick,
} from "@/lib/trick";
import type { Card, Play, Player } from "@/types/game";

function stubPlayers(outIds: string[] = []): Player[] {
  return ["a", "b", "c", "d"].map((id) => ({
    id,
    name: id,
    hand: [],
    role: null,
    isOut: outIds.includes(id),
    finishOrder: null,
  }));
}

const samplePlay: Play = {
  playerId: "a",
  cards: [{ id: "c1", rank: 9 }],
  effectiveRank: 9,
  count: 1,
};

describe("shouldEndTrick", () => {
  it("ends after active-1 passes following a play", () => {
    let trick = createEmptyTrick();
    trick = applyPlayToTrick(trick, samplePlay);
    trick = applyPassToTrick(trick, "b");
    trick = applyPassToTrick(trick, "c");
    expect(shouldEndTrick(trick, stubPlayers())).toBe(false);
    trick = applyPassToTrick(trick, "d");
    expect(shouldEndTrick(trick, stubPlayers())).toBe(true);
  });

  it("ignores when no top play", () => {
    expect(shouldEndTrick(createEmptyTrick(), stubPlayers())).toBe(false);
  });
});

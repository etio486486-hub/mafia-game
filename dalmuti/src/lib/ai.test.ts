import { describe, expect, it } from "vitest";
import { decideBotPlayAction } from "@/lib/ai";
import { validatePlay } from "@/lib/validation";
import type { Card, Player, Play } from "@/types/game";

const c = (rank: Card["rank"], id: string): Card => ({ id, rank });

function bot(hand: Card[]): Player {
  return {
    id: "bot",
    name: "AI",
    hand,
    role: null,
    isOut: false,
    finishOrder: null,
    isHuman: false,
  };
}

describe("decideBotPlayAction", () => {
  it("leads a valid set", () => {
    const hand = [c(12, "a"), c(12, "b"), c(12, "c"), c(5, "d")];
    const action = decideBotPlayAction(bot(hand), null);
    expect(action.type).toBe("play");
    if (action.type === "play") {
      expect(validatePlay(action.cards, null).ok).toBe(true);
    }
  });

  it("passes when cannot beat dalmuti", () => {
    const top: Play = {
      playerId: "x",
      cards: [c(1, "t")],
      effectiveRank: 1,
      count: 1,
    };
    const hand = [c(2, "a"), c(3, "b")];
    const action = decideBotPlayAction(bot(hand), top);
    expect(action.type).toBe("pass");
  });
});

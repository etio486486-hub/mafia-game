import { describe, expect, it } from "vitest";
import {
  applyMerchantChancellorExchange,
  applyPeasantDalmutiExchange,
  createEmptyTax,
  pickSmallestCards,
  TAX_REQUIRED_COUNT,
} from "@/lib/tax";
import type { Card, Player } from "@/types/game";

function player(id: string, role: Player["role"], hand: Card[]): Player {
  return {
    id,
    name: id,
    hand,
    role,
    isOut: false,
    finishOrder: null,
  };
}

const c = (rank: Card["rank"], id: string): Card => ({ id, rank });

describe("pickSmallestCards", () => {
  it("picks lowest rank numbers first", () => {
    const hand = [c(9, "a"), c(2, "b"), c(5, "c"), c(1, "d")];
    const picked = pickSmallestCards(hand, 2);
    expect(picked.map((x) => x.rank)).toEqual([1, 2]);
  });
});

describe("tax exchanges", () => {
  it("transfers peasant and dalmuti buffers", () => {
    const tax = {
      ...createEmptyTax(),
      peasantToDalmuti: [c(1, "t1"), c(2, "t2")],
      dalmutiToPeasant: [c(11, "g1"), c(12, "g2")],
    };
    let players = [
      player("d", "dalmuti", [c(10, "d1")]),
      player("p", "peasant", [c(3, "p1")]),
    ];
    players = applyPeasantDalmutiExchange(players, tax);
    expect(players.find((x) => x.id === "d")!.hand).toHaveLength(3);
    expect(players.find((x) => x.id === "p")!.hand).toHaveLength(3);
  });

  it("defines 2+2+1+1 card flow", () => {
    expect(TAX_REQUIRED_COUNT["peasant-pick"]).toBe(2);
    expect(TAX_REQUIRED_COUNT["chancellor-pick"]).toBe(1);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { useGameStore } from "@/store/gameStore";
import { ROLE_ORDER_4 } from "@/types/game";

function endRoundWithRoles() {
  const roles = ROLE_ORDER_4;
  useGameStore.setState({
    phase: "roundEnd",
    roundNumber: 1,
    players: roles.map((role, i) => ({
      id: `player-${i}`,
      name: String.fromCharCode(65 + i),
      hand: [],
      role,
      isOut: true,
      finishOrder: i,
      isHuman: true,
    })),
    seatOrder: roles.map((_, i) => `player-${i}`),
  });
}

describe("tax phase after round end", () => {
  beforeEach(() => {
    useGameStore.getState().startNewGame([
      { isHuman: true, name: "A" },
      { isHuman: true, name: "B" },
      { isHuman: true, name: "C" },
      { isHuman: true, name: "D" },
    ]);
  });

  it("enters tax phase with peasant leading selection", () => {
    endRoundWithRoles();
    useGameStore.getState().proceedFromRoundEnd();

    const s = useGameStore.getState();
    expect(s.phase).toBe("tax");
    expect(s.roundNumber).toBe(2);
    expect(s.tax?.step).toBe("peasant-pick");
    expect(s.players.every((p) => p.hand.length === 20)).toBe(true);

    const peasant = s.players.find((p) => p.role === "peasant");
    expect(peasant).toBeDefined();
  });

  it("runs full tax flow into playing", () => {
    endRoundWithRoles();
    useGameStore.getState().proceedFromRoundEnd();

    const steps: Array<{
      step: string;
      role: (typeof ROLE_ORDER_4)[number];
      count: number;
      tribute: boolean;
    }> = [
      { step: "peasant-pick", role: "peasant", count: 2, tribute: true },
      { step: "dalmuti-pick", role: "dalmuti", count: 2, tribute: false },
      { step: "merchant-pick", role: "merchant", count: 1, tribute: true },
      { step: "chancellor-pick", role: "chancellor", count: 1, tribute: false },
    ];

    for (const { step, role, count, tribute } of steps) {
      const s = useGameStore.getState();
      expect(s.tax?.step).toBe(step);

      const actor = s.players.find((p) => p.role === role)!;
      const seat = s.seatOrder.indexOf(actor.id);
      useGameStore.setState({ viewingPlayerIndex: seat });

      const sorted = [...actor.hand].sort((a, b) =>
        tribute ? a.rank - b.rank : b.rank - a.rank,
      );
      useGameStore.setState({
        selectedCardIds: sorted.slice(0, count).map((c) => c.id),
      });
      useGameStore.getState().confirmTaxStep();
    }

    const final = useGameStore.getState();
    expect(final.phase).toBe("playing");
    expect(final.tax).toBeNull();
    expect(final.players.every((p) => p.hand.length === 20)).toBe(true);
  });
});

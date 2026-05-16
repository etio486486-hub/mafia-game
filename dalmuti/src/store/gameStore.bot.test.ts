import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGameStore } from "@/store/gameStore";

describe("AI bot turns", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGameStore.getState().startNewGame([
      { isHuman: true, name: "나" },
      { isHuman: false, name: "AI1" },
      { isHuman: false, name: "AI2" },
      { isHuman: false, name: "AI3" },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("AI plays when seat 0 is bot", () => {
    useGameStore.setState({ activeSeatIndex: 1 });
    const before = useGameStore.getState().players[1].hand.length;
    useGameStore.getState().executeBotTurn();
    const after = useGameStore.getState().players[1].hand.length;
    expect(after).toBeLessThanOrEqual(before);
  });

  it("schedules bot after human play", () => {
    const human = useGameStore.getState().players[0];
    const card = human.hand[0];
    useGameStore.getState().playCardsFor(human.id, [card]);
    const seatAfterHuman = useGameStore.getState().activeSeatIndex;
    expect(seatAfterHuman).not.toBe(0);
    vi.advanceTimersByTime(600);
    const active = useGameStore.getState().activeSeatIndex;
    const p = useGameStore.getState().players[active];
    if (!p.isHuman) {
      expect(useGameStore.getState().trick.topPlay).not.toBeNull();
    }
  });
});

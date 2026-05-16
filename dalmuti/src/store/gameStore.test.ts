import { beforeEach, describe, expect, it } from "vitest";
import { useGameStore } from "@/store/gameStore";

describe("gameStore playing loop", () => {
  beforeEach(() => {
    useGameStore.getState().startNewGame([
      { isHuman: true, name: "A" },
      { isHuman: true, name: "B" },
      { isHuman: true, name: "C" },
      { isHuman: true, name: "D" },
    ]);
  });

  it("starts with 20 cards each and player 0 to lead", () => {
    const s = useGameStore.getState();
    expect(s.phase).toBe("playing");
    expect(s.players.every((p) => p.hand.length === 20)).toBe(true);
    expect(s.activeSeatIndex).toBe(0);
    expect(s.trick.topPlay).toBeNull();
  });

  it("rejects pass on lead", () => {
    useGameStore.getState().pass();
    expect(useGameStore.getState().errorMessage).toMatch(/패스/);
  });

  it("advances turn after valid lead", () => {
    const lead = useGameStore.getState().players[0].hand[0];
    useGameStore.setState({ selectedCardIds: [lead.id] });
    useGameStore.getState().playSelectedCards();
    const s = useGameStore.getState();
    expect(s.trick.topPlay).not.toBeNull();
    expect(s.activeSeatIndex).toBe(1);
    expect(s.players[0].hand.length).toBe(19);
  });
});

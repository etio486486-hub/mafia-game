import type { GameStore } from "@/store/gameStore";
import { playerAtSeat } from "@/lib/seats";
import { validatePlay } from "@/lib/validation";

export function activePlayer(state: GameStore) {
  return playerAtSeat(state.players, state.seatOrder, state.activeSeatIndex);
}

export function viewingPlayer(state: GameStore) {
  return playerAtSeat(state.players, state.seatOrder, state.viewingPlayerIndex);
}

export function isViewingPlayersTurn(state: GameStore): boolean {
  const active = activePlayer(state);
  if (!active?.isHuman || active.isOut) return false;

  if (state.mode === "online") {
    if (state.mySeatIndex === null) return false;
    if (state.viewingPlayerIndex !== state.mySeatIndex) return false;
    if (state.activeSeatIndex !== state.mySeatIndex) return false;
    return state.phase === "playing";
  }

  return (
    state.phase === "playing" &&
    state.viewingPlayerIndex === state.activeSeatIndex
  );
}

export function isBotThinking(state: GameStore): boolean {
  if (state.phase === "playing") {
    const active = activePlayer(state);
    return Boolean(active && !active.isHuman && !active.isOut);
  }
  if (state.phase === "tax" && state.tax) {
    const step = state.tax.step;
    if (step === "done") return false;
    const roleMap = {
      "peasant-pick": "peasant",
      "dalmuti-pick": "dalmuti",
      "merchant-pick": "merchant",
      "chancellor-pick": "chancellor",
    } as const;
    const role = roleMap[step];
    const actor = state.players.find((p) => p.role === role);
    return Boolean(actor && !actor.isHuman);
  }
  return false;
}

export function selectedCards(state: GameStore) {
  const viewer = viewingPlayer(state);
  if (!viewer) return [];
  const ids = new Set(state.selectedCardIds);
  return viewer.hand.filter((c) => ids.has(c.id));
}

export function canSubmitPlay(state: GameStore): boolean {
  if (!isViewingPlayersTurn(state)) return false;
  const cards = selectedCards(state);
  if (cards.length === 0) return false;
  return validatePlay(cards, state.trick.topPlay).ok;
}

export function canSubmitPass(state: GameStore): boolean {
  return isViewingPlayersTurn(state) && state.trick.topPlay !== null;
}

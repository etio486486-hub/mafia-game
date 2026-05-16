import type { GameStore } from "@/store/gameStore";
import {
  isTaxActorStep,
  playerWithRole,
  TAX_ACTOR_ROLE,
  TAX_REQUIRED_COUNT,
  TAX_STEP_TITLE_KO,
} from "@/lib/tax";
import { seatIndexOf } from "@/lib/seats";

export function taxStepTitle(state: GameStore): string | null {
  if (!state.tax || !isTaxActorStep(state.tax.step)) return null;
  return TAX_STEP_TITLE_KO[state.tax.step];
}

export function taxActorPlayer(state: GameStore) {
  if (!state.tax || !isTaxActorStep(state.tax.step)) return undefined;
  return playerWithRole(state.players, TAX_ACTOR_ROLE[state.tax.step]);
}

export function taxActorSeatIndex(state: GameStore): number | null {
  const actor = taxActorPlayer(state);
  if (!actor) return null;
  const idx = seatIndexOf(state.seatOrder, actor.id);
  return idx >= 0 ? idx : null;
}

export function isViewingTaxActor(state: GameStore): boolean {
  const seat = taxActorSeatIndex(state);
  if (seat === null) return false;
  if (state.viewingPlayerIndex !== seat) return false;
  if (state.mode === "online" && state.mySeatIndex !== null) {
    return seat === state.mySeatIndex;
  }
  return true;
}

export function taxRequiredSelectionCount(state: GameStore): number {
  if (!state.tax || !isTaxActorStep(state.tax.step)) return 0;
  return TAX_REQUIRED_COUNT[state.tax.step];
}

export function canConfirmTaxStep(state: GameStore): boolean {
  if (state.phase !== "tax" || !state.tax || !isTaxActorStep(state.tax.step)) {
    return false;
  }
  if (!isViewingTaxActor(state)) return false;
  return (
    state.selectedCardIds.length === TAX_REQUIRED_COUNT[state.tax.step]
  );
}

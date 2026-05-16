import { createAndDeal } from "@/lib/deck";
import { sortHand } from "@/lib/hands";
import { assignRolesFromFinishOrder, finishOrderIds } from "@/lib/ranking";
import { nextActiveSeatIndex, seatIndexOf } from "@/lib/seats";
import {
  applyPassToTrick,
  applyPlayToTrick,
  createEmptyTrick,
  resolveTrickEnd,
  shouldEndTrick,
} from "@/lib/trick";
import {
  applyMerchantChancellorExchange,
  applyPeasantDalmutiExchange,
  createEmptyTax,
  isTaxActorStep,
  nextTaxStep,
  playerWithRole,
  removeCardsFromPlayer,
  TAX_ACTOR_ROLE,
  TAX_REQUIRED_COUNT,
} from "@/lib/tax";
import { validatePlay } from "@/lib/validation";
import type { Card, GameState, Player, Role4 } from "@/types/game";
import { MVP_PLAYER_COUNT } from "@/lib/constants";

function markPlayerOut(
  players: Player[],
  playerId: string,
  finishOrder: number,
): Player[] {
  return players.map((p) =>
    p.id === playerId
      ? { ...p, hand: [], isOut: true, finishOrder }
      : p,
  );
}

function removeCardsFromHand(hand: Card[], cardIds: string[]): Card[] {
  const idSet = new Set(cardIds);
  return hand.filter((c) => !idSet.has(c.id));
}

function nextFinishOrder(players: Player[]): number {
  return players.filter((p) => p.finishOrder !== null).length;
}

function allPlayersOut(players: Player[]): boolean {
  return players.every((p) => p.isOut);
}

function seatIndexForRole(
  players: Player[],
  seatOrder: string[],
  role: Role4,
): number {
  const p = playerWithRole(players, role);
  if (!p) return 0;
  const idx = seatIndexOf(seatOrder, p.id);
  return idx >= 0 ? idx : 0;
}

function beginPlayingFromTax(
  players: Player[],
  seatOrder: string[],
  roundNumber: number,
): Pick<
  GameState,
  | "phase"
  | "players"
  | "activeSeatIndex"
  | "viewingPlayerIndex"
  | "trick"
  | "tax"
  | "selectedCardIds"
  | "errorMessage"
> {
  const dalmutiSeat = seatIndexForRole(players, seatOrder, "dalmuti");
  return {
    phase: "playing",
    players: players.map((p) => ({ ...p, hand: sortHand(p.hand) })),
    activeSeatIndex: dalmutiSeat,
    viewingPlayerIndex: dalmutiSeat,
    trick: createEmptyTrick(),
    tax: null,
    selectedCardIds: [],
    errorMessage: null,
  };
}

export type TransitionResult =
  | { ok: true; state: GameState }
  | { ok: false; code: string };

export function transitionPlayCards(
  state: GameState,
  playerId: string,
  cards: Card[],
): TransitionResult {
  if (state.phase !== "playing") {
    return { ok: false, code: "NOT_PLAYING_PHASE" };
  }

  const seatIdx = seatIndexOf(state.seatOrder, playerId);
  if (seatIdx !== state.activeSeatIndex) {
    return { ok: false, code: "WRONG_TURN" };
  }

  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.isOut) {
    return { ok: false, code: "INVALID_PLAYER" };
  }

  const result = validatePlay(cards, state.trick.topPlay, playerId);
  if (!result.ok || !result.play) {
    return {
      ok: false,
      code: result.reason ?? "INVALID_PLAY",
    };
  }

  let players = state.players.map((p) =>
    p.id === playerId
      ? {
          ...p,
          hand: sortHand(
            removeCardsFromHand(
              p.hand,
              result.play!.cards.map((c) => c.id),
            ),
          ),
        }
      : p,
  );

  let finishCount = nextFinishOrder(players);
  if (players.find((p) => p.id === playerId)!.hand.length === 0) {
    players = markPlayerOut(players, playerId, finishCount);
    finishCount += 1;
  }

  let trick = applyPlayToTrick(state.trick, result.play);
  let discardPile = state.discardPile;
  let activeSeatIndex = state.activeSeatIndex;

  if (allPlayersOut(players)) {
    const withRoles = assignRolesFromFinishOrder(players);
    return {
      ok: true,
      state: {
        ...state,
        players: withRoles,
        trick,
        discardPile,
        phase: "roundEnd",
        lastRoundFinishOrder: finishOrderIds(withRoles),
        selectedCardIds: [],
        errorMessage: null,
      },
    };
  }

  if (shouldEndTrick(trick, players)) {
    const resolved = resolveTrickEnd(trick, discardPile);
    trick = resolved.trick;
    discardPile = resolved.discardPile;
    activeSeatIndex = seatIndexOf(state.seatOrder, resolved.winnerPlayerId);
  } else {
    activeSeatIndex = nextActiveSeatIndex(
      state.seatOrder,
      players,
      activeSeatIndex,
    );
  }

  return {
    ok: true,
    state: {
      ...state,
      players,
      trick,
      discardPile,
      activeSeatIndex,
      selectedCardIds: [],
      errorMessage: null,
    },
  };
}

export function transitionPass(
  state: GameState,
  playerId: string,
): TransitionResult {
  if (state.phase !== "playing") {
    return { ok: false, code: "NOT_PLAYING_PHASE" };
  }

  const seatIdx = seatIndexOf(state.seatOrder, playerId);
  if (seatIdx !== state.activeSeatIndex) {
    return { ok: false, code: "WRONG_TURN" };
  }

  if (!state.trick.topPlay) {
    return { ok: false, code: "PASS_ON_LEAD" };
  }

  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.isOut) {
    return { ok: false, code: "INVALID_PLAYER" };
  }

  if (state.trick.passedPlayerIds.includes(playerId)) {
    return { ok: false, code: "ALREADY_PASSED" };
  }

  let trick = applyPassToTrick(state.trick, playerId);
  let discardPile = state.discardPile;
  let activeSeatIndex = state.activeSeatIndex;
  const players = state.players;

  if (shouldEndTrick(trick, players)) {
    const resolved = resolveTrickEnd(trick, discardPile);
    trick = resolved.trick;
    discardPile = resolved.discardPile;
    activeSeatIndex = seatIndexOf(
      state.seatOrder,
      resolved.winnerPlayerId,
    );
  } else {
    activeSeatIndex = nextActiveSeatIndex(
      state.seatOrder,
      players,
      activeSeatIndex,
    );
  }

  return {
    ok: true,
    state: {
      ...state,
      trick,
      discardPile,
      activeSeatIndex,
      selectedCardIds: [],
      errorMessage: null,
    },
  };
}

/** 라운드 종료 다음: 세금 페이즈로 */
export function transitionProceedFromRoundEnd(
  state: GameState,
): TransitionResult {
  if (state.phase !== "roundEnd") {
    return { ok: false, code: "NOT_ROUND_END" };
  }

  const { hands } = createAndDeal(MVP_PLAYER_COUNT);
  const nextRound = state.roundNumber + 1;

  const players = state.seatOrder.map((id, seatIdx) => {
    const p = state.players.find((pp) => pp.id === id)!;
    return {
      ...p,
      hand: sortHand(hands[seatIdx]),
      isOut: false,
      finishOrder: null,
    };
  });

  const peasantSeat = seatIndexForRole(players, state.seatOrder, "peasant");
  const peasant = players.find((p) => p.role === "peasant");

  const humanSeat = players.findIndex((p) => p.isHuman);

  return {
    ok: true,
    state: {
      ...state,
      phase: "tax",
      roundNumber: nextRound,
      players,
      tax: createEmptyTax(),
      viewingPlayerIndex: peasant?.isHuman
        ? peasantSeat
        : humanSeat >= 0
          ? humanSeat
          : peasantSeat,
      discardPile: [],
      trick: createEmptyTrick(),
      selectedCardIds: [],
      errorMessage: null,
      mode: state.mode,
      mySeatIndex: state.mySeatIndex,
    },
  };
}

export function transitionConfirmTax(
  state: GameState,
  playerId: string,
  cards: Card[],
): TransitionResult {
  if (state.phase !== "tax" || !state.tax || !isTaxActorStep(state.tax.step)) {
    return { ok: false, code: "NOT_TAX_PHASE" };
  }

  const step = state.tax.step;
  const actorRole = TAX_ACTOR_ROLE[step];
  const actor = playerWithRole(state.players, actorRole);
  if (!actor || actor.id !== playerId) {
    return { ok: false, code: "NOT_TAX_ACTOR" };
  }

  const required = TAX_REQUIRED_COUNT[step];
  if (cards.length !== required) {
    return { ok: false, code: "WRONG_CARD_COUNT" };
  }

  const cardIds = cards.map((c) => c.id);
  let players = removeCardsFromPlayer(state.players, actor.id, cardIds);
  let tax = { ...state.tax };

  switch (step) {
    case "peasant-pick":
      tax = { ...tax, peasantToDalmuti: cards };
      break;
    case "dalmuti-pick":
      tax = { ...tax, dalmutiToPeasant: cards };
      players = applyPeasantDalmutiExchange(players, tax);
      break;
    case "merchant-pick":
      tax = { ...tax, merchantToChancellor: cards };
      break;
    case "chancellor-pick":
      tax = { ...tax, chancellorToMerchant: cards };
      players = applyMerchantChancellorExchange(players, tax);
      break;
  }

  const nextStep = nextTaxStep(step);
  tax = { ...tax, step: nextStep };

  if (nextStep === "done") {
    const fromTax = beginPlayingFromTax(
      players,
      state.seatOrder,
      state.roundNumber,
    );
    return {
      ok: true,
      state: {
        ...state,
        ...fromTax,
      },
    };
  }

  const nextRole = TAX_ACTOR_ROLE[nextStep as keyof typeof TAX_ACTOR_ROLE];
  const nextSeat = seatIndexForRole(players, state.seatOrder, nextRole);
  const nextActor = playerWithRole(players, nextRole);
  const humanSeat = players.findIndex((p) => p.isHuman);

  return {
    ok: true,
    state: {
      ...state,
      players,
      tax,
      viewingPlayerIndex: nextActor?.isHuman
        ? nextSeat
        : humanSeat >= 0
          ? humanSeat
          : nextSeat,
      selectedCardIds: [],
      errorMessage: null,
    },
  };
}

/** 온라인 첫 라운드 시작 (순 사람 4인) */
export function createOnlineInitialState(
  displayNames: string[],
): TransitionResult {
  if (displayNames.length !== MVP_PLAYER_COUNT) {
    return { ok: false, code: "NEED_FOUR_PLAYERS" };
  }
  const players: Player[] = displayNames.map((name, i) => ({
    id: `player-${i}`,
    name,
    hand: [],
    role: null,
    isOut: false,
    finishOrder: null,
    isHuman: true,
  }));
  const seatOrder = players.map((p) => p.id);
  const { hands } = createAndDeal(MVP_PLAYER_COUNT);
  const dealt = players.map((p, i) => ({
    ...p,
    hand: sortHand(hands[i]),
  }));

    return {
      ok: true,
      state: {
        phase: "playing",
        roundNumber: 1,
        players: dealt,
        seatOrder,
        activeSeatIndex: 0,
        trick: createEmptyTrick(),
        discardPile: [],
        viewingPlayerIndex: 0,
        tax: null,
        lastRoundFinishOrder: null,
        selectedCardIds: [],
        errorMessage: null,
        mode: "local",
        mySeatIndex: null,
      },
    };
}

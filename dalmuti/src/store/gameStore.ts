import { create } from "zustand";
import { createAndDeal } from "@/lib/deck";
import { sortHand } from "@/lib/hands";
import { chooseBotTaxCards, decideBotPlayAction } from "@/lib/ai";
import {
  transitionConfirmTax,
  transitionPass as enginePass,
  transitionPlayCards,
  transitionProceedFromRoundEnd,
} from "@/lib/gameTransitions";
import { seatIndexOf } from "@/lib/seats";
import { createEmptyTrick } from "@/lib/trick";
import {
  createEmptyTax,
  isTaxActorStep,
  pickSmallestCards,
  pickWeakestCards,
  playerWithRole,
  TAX_ACTOR_ROLE,
  TAX_REQUIRED_COUNT,
} from "@/lib/tax";
import type {
  Card,
  GameMode,
  GameState,
  Player,
  Role4,
  SeatConfig,
} from "@/types/game";
import { MVP_PLAYER_COUNT } from "@/lib/constants";
import { cancelBotTurn, scheduleBotTurn } from "@/store/botRunner";
import {
  clearOnlineEmitters,
  getOnlineEmitters,
} from "@/multiplayer/onlineEmitters";

interface GameActions {
  startNewGame: (seats?: SeatConfig[]) => void;
  playCardsFor: (playerId: string, cards: Card[]) => void;
  passFor: (playerId: string) => void;
  confirmTaxFor: (playerId: string, cards: Card[]) => void;
  executeBotTurn: () => void;
  setGameMode: (mode: GameMode) => void;
  applyServerSync: (
    strippedState: GameState,
    opts: { mySeatIndex: number; myHand: Card[] },
  ) => void;
  resetToLocalLobby: () => void;
  setViewingPlayer: (index: number) => void;
  confirmTurnHandoff: () => void;
  toggleCardSelection: (cardId: string) => void;
  clearSelection: () => void;
  playSelectedCards: () => void;
  pass: () => void;
  proceedFromRoundEnd: () => void;
  suggestTaxCards: () => void;
  confirmTaxStep: () => void;
  clearError: () => void;
}

export type GameStore = GameState & GameActions;

const AI_NAMES = ["김 과장", "이 대리", "박 사원"];

function defaultSeats(): SeatConfig[] {
  return [
    { isHuman: true, name: "나" },
    ...AI_NAMES.map((name) => ({ isHuman: false, name })),
  ];
}

function createPlayers(seats: SeatConfig[]): Player[] {
  return seats.map((seat, i) => ({
    id: `player-${i}`,
    name: seat.isHuman
      ? (seat.name?.trim() || "나")
      : (seat.name?.trim() || `AI ${i + 1}`),
    hand: [],
    role: null,
    isOut: false,
    finishOrder: null,
    isHuman: seat.isHuman,
  }));
}

function initialState(): GameState {
  return {
    phase: "lobby",
    roundNumber: 0,
    players: [],
    seatOrder: [],
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
  };
}

function seatIndexForRole(players: Player[], seatOrder: string[], role: Role4): number {
  const p = playerWithRole(players, role);
  if (!p) return 0;
  const idx = seatIndexOf(seatOrder, p.id);
  return idx >= 0 ? idx : 0;
}

function humanPlayErrorMessage(code: string): string {
  switch (code) {
    case "CANNOT_BEAT":
      return "이 카드로는 이길 수 없습니다.";
    case "MIXED_RANKS":
      return "같은 숫자의 카드만 낼 수 있습니다.";
    case "MULTIPLE_JESTERS_ALONE":
      return "어릿광대만 여러 장 낼 수 없습니다.";
    case "PASS_ON_LEAD":
      return "선(리드)에는 패스할 수 없습니다. 카드를 내세요.";
    case "WRONG_TURN":
      return "지금은 내 차례가 아닙니다.";
    default:
      return "낼 수 없는 조합입니다.";
  }
}

export const useGameStore = create<GameStore>((set, get) => ({
  ...initialState(),

  startNewGame: (seats) => {
    cancelBotTurn();
    if (typeof window !== "undefined") {
      void import("@/multiplayer/socketClient").then((m) =>
        m.disconnectOnline(),
      );
    }
    const seatConfigs =
      seats && seats.length === MVP_PLAYER_COUNT ? seats : defaultSeats();
    const players = createPlayers(seatConfigs);
    const seatOrder = players.map((p) => p.id);
    const { hands } = createAndDeal(MVP_PLAYER_COUNT);

    const dealt = players.map((p, i) => ({
      ...p,
      hand: sortHand(hands[i]),
    }));

    const firstHuman = dealt.findIndex((p) => p.isHuman);

    set({
      ...initialState(),
      phase: "playing",
      roundNumber: 1,
      players: dealt,
      seatOrder,
      activeSeatIndex: 0,
      viewingPlayerIndex: firstHuman >= 0 ? firstHuman : 0,
      trick: createEmptyTrick(),
    });
    scheduleBotTurn(get);
  },

  setViewingPlayer: (index) => {
    const { seatOrder } = get();
    if (index < 0 || index >= seatOrder.length) return;
    set({ viewingPlayerIndex: index, selectedCardIds: [], errorMessage: null });
  },

  confirmTurnHandoff: () => {
    const { activeSeatIndex } = get();
    set({
      viewingPlayerIndex: activeSeatIndex,
      selectedCardIds: [],
      errorMessage: null,
    });
  },

  toggleCardSelection: (cardId) => {
    const state = get();
    const { selectedCardIds, phase, viewingPlayerIndex, activeSeatIndex } =
      state;

    if (phase === "playing") {
      if (viewingPlayerIndex !== activeSeatIndex) return;
      set({
        selectedCardIds: selectedCardIds.includes(cardId)
          ? selectedCardIds.filter((id) => id !== cardId)
          : [...selectedCardIds, cardId],
        errorMessage: null,
      });
      return;
    }

    if (phase === "tax" && state.tax && isTaxActorStep(state.tax.step)) {
      const actorRole = TAX_ACTOR_ROLE[state.tax.step];
      const actorSeat = seatIndexForRole(
        state.players,
        state.seatOrder,
        actorRole,
      );
      if (viewingPlayerIndex !== actorSeat) return;

      const required = TAX_REQUIRED_COUNT[state.tax.step];
      if (
        !selectedCardIds.includes(cardId) &&
        selectedCardIds.length >= required
      ) {
        set({
          errorMessage: `${required}장만 선택할 수 있습니다.`,
        });
        return;
      }

      set({
        selectedCardIds: selectedCardIds.includes(cardId)
          ? selectedCardIds.filter((id) => id !== cardId)
          : [...selectedCardIds, cardId],
        errorMessage: null,
      });
    }
  },

  clearSelection: () => set({ selectedCardIds: [], errorMessage: null }),

  clearError: () => set({ errorMessage: null }),

  playSelectedCards: () => {
    const state = get();
    if (state.phase !== "playing") return;

    const activeId = state.seatOrder[state.activeSeatIndex];
    const player = state.players.find((p) => p.id === activeId);
    if (!player || player.isOut) return;

    if (player.isHuman && state.viewingPlayerIndex !== state.activeSeatIndex) {
      set({ errorMessage: "지금은 내 차례가 아닙니다." });
      return;
    }

    const cards = player.hand.filter((c) =>
      state.selectedCardIds.includes(c.id),
    );
    if (cards.length === 0) {
      set({ errorMessage: "낼 카드를 선택하세요." });
      return;
    }

    if (state.mode === "online") {
      const emit = getOnlineEmitters();
      if (!emit) {
        set({ errorMessage: "네트워크에 연결되지 않았습니다." });
        return;
      }
      emit.submitPlay(cards.map((c) => c.id));
      return;
    }

    get().playCardsFor(activeId, cards);
  },

  playCardsFor: (playerId, cards) => {
    const state = get();
    const player = state.players.find((p) => p.id === playerId);
    const outcome = transitionPlayCards(state, playerId, cards);
    if (!outcome.ok) {
      if (player?.isHuman) {
        set({ errorMessage: humanPlayErrorMessage(outcome.code) });
      }
      return;
    }
    cancelBotTurn();
    set(outcome.state);
    if (get().mode === "local") scheduleBotTurn(get);
  },

  pass: () => {
    const state = get();
    if (state.phase !== "playing") return;

    const activeId = state.seatOrder[state.activeSeatIndex];
    const player = state.players.find((p) => p.id === activeId);
    if (!player) return;

    if (player.isHuman && state.viewingPlayerIndex !== state.activeSeatIndex) {
      set({ errorMessage: "지금은 내 차례가 아닙니다." });
      return;
    }

    if (state.mode === "online") {
      const emit = getOnlineEmitters();
      if (!emit) {
        set({ errorMessage: "네트워크에 연결되지 않았습니다." });
        return;
      }
      emit.submitPass();
      return;
    }

    get().passFor(activeId);
  },

  passFor: (playerId) => {
    const state = get();
    const player = state.players.find((p) => p.id === playerId);
    const outcome = enginePass(state, playerId);
    if (!outcome.ok) {
      if (player?.isHuman && outcome.code === "PASS_ON_LEAD") {
        set({ errorMessage: humanPlayErrorMessage("PASS_ON_LEAD") });
      }
      return;
    }
    cancelBotTurn();
    set(outcome.state);
    if (get().mode === "local") scheduleBotTurn(get);
  },

  executeBotTurn: () => {
    const state = get();
    if (state.mode === "online") return;

    if (state.phase === "playing") {
      const activeId = state.seatOrder[state.activeSeatIndex];
      const player = state.players.find((p) => p.id === activeId);
      if (!player || player.isHuman || player.isOut) return;

      const action = decideBotPlayAction(player, state.trick.topPlay);
      if (action.type === "play") {
        get().playCardsFor(player.id, action.cards);
      } else {
        get().passFor(player.id);
      }
      return;
    }

    if (state.phase === "tax" && state.tax && isTaxActorStep(state.tax.step)) {
      const role = TAX_ACTOR_ROLE[state.tax.step];
      const actor = playerWithRole(state.players, role);
      if (!actor || actor.isHuman) return;

      const cards = chooseBotTaxCards(actor, state.tax);
      if (cards.length > 0) {
        get().confirmTaxFor(actor.id, cards);
      }
    }
  },

  proceedFromRoundEnd: () => {
    const state = get();
    if (state.mode === "online") {
      const emit = getOnlineEmitters();
      if (!emit) {
        set({ errorMessage: "네트워크에 연결되지 않았습니다." });
        return;
      }
      emit.requestNextRound();
      return;
    }

    const outcome = transitionProceedFromRoundEnd(get());
    if (!outcome.ok) return;
    cancelBotTurn();
    set(outcome.state);
    scheduleBotTurn(get);
  },

  suggestTaxCards: () => {
    const state = get();
    if (state.phase !== "tax" || !state.tax || !isTaxActorStep(state.tax.step)) {
      return;
    }

    const actorRole = TAX_ACTOR_ROLE[state.tax.step];
    const actor = playerWithRole(state.players, actorRole);
    if (!actor) return;

    const actorSeat = seatIndexForRole(
      state.players,
      state.seatOrder,
      actorRole,
    );
    if (state.viewingPlayerIndex !== actorSeat) {
      set({ errorMessage: "지금 단계의 계급 플레이어만 선택할 수 있습니다." });
      return;
    }

    const required = TAX_REQUIRED_COUNT[state.tax.step];
    const isTribute =
      state.tax.step === "peasant-pick" || state.tax.step === "merchant-pick";
    const suggested = isTribute
      ? pickSmallestCards(actor.hand, required)
      : pickWeakestCards(actor.hand, required);

    set({
      selectedCardIds: suggested.map((c) => c.id),
      errorMessage: null,
    });
  },

  confirmTaxStep: () => {
    const state = get();
    if (state.phase !== "tax" || !state.tax || !isTaxActorStep(state.tax.step)) {
      return;
    }

    const step = state.tax.step;
    const actorRole = TAX_ACTOR_ROLE[step];
    const actor = playerWithRole(state.players, actorRole);
    if (!actor) {
      set({ errorMessage: "계급 정보가 없습니다. 새 게임을 시작하세요." });
      return;
    }

    const actorSeat = seatIndexForRole(
      state.players,
      state.seatOrder,
      actorRole,
    );
    if (actor.isHuman && state.viewingPlayerIndex !== actorSeat) {
      set({ errorMessage: "이 단계의 당사자만 확인할 수 있습니다." });
      return;
    }

    const required = TAX_REQUIRED_COUNT[step];
    const cards = actor.hand.filter((c) =>
      state.selectedCardIds.includes(c.id),
    );

    if (cards.length !== required) {
      set({ errorMessage: `${required}장을 선택하세요.` });
      return;
    }

    if (state.mode === "online") {
      const emit = getOnlineEmitters();
      if (!emit) {
        set({ errorMessage: "네트워크에 연결되지 않았습니다." });
        return;
      }
      emit.submitTax(cards.map((c) => c.id));
      return;
    }

    get().confirmTaxFor(actor.id, cards);
  },

  confirmTaxFor: (playerId, cards) => {
    const outcome = transitionConfirmTax(get(), playerId, cards);
    if (!outcome.ok) return;
    cancelBotTurn();
    set(outcome.state);
    if (get().mode === "local") scheduleBotTurn(get);
  },

  setGameMode: (mode) => set({ mode }),

  applyServerSync: (stripped, opts) => {
    cancelBotTurn();
    set({
      ...stripped,
      players: stripped.players.map((p, i) =>
        i === opts.mySeatIndex
          ? { ...p, hand: sortHand(opts.myHand) }
          : { ...p, hand: [] },
      ),
      viewingPlayerIndex: opts.mySeatIndex,
      selectedCardIds: [],
      errorMessage: null,
      mode: "online",
      mySeatIndex: opts.mySeatIndex,
    });
  },

  resetToLocalLobby: () => {
    cancelBotTurn();
    clearOnlineEmitters();
    set(initialState());
  },
}));

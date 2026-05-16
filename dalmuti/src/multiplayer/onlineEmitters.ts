import type { GameState } from "@/types/game";

export interface OnlineEmitters {
  submitPlay: (cardIds: string[]) => void;
  submitPass: () => void;
  submitTax: (cardIds: string[]) => void;
  requestNextRound: () => void;
}

let impl: OnlineEmitters | null = null;

export function setOnlineEmitters(next: OnlineEmitters | null): void {
  impl = next;
}

export function getOnlineEmitters(): OnlineEmitters | null {
  return impl;
}

export function clearOnlineEmitters(): void {
  impl = null;
}

export function stripHandsForBroadcast(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, hand: [] })),
  };
}

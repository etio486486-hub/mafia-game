/** 1=달무티(최강) … 12=농노(최약), 13=어릿광대 */
export type CardRank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export interface Card {
  id: string;
  rank: CardRank;
}

/** 4인 기준 계급 */
export type Role4 = "dalmuti" | "chancellor" | "merchant" | "peasant";

export const ROLE_ORDER_4: Role4[] = [
  "dalmuti",
  "chancellor",
  "merchant",
  "peasant",
];

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  role: Role4 | null;
  isOut: boolean;
  finishOrder: number | null;
  /** false면 AI가 자동 플레이 */
  isHuman: boolean;
}

/** 로비 좌석 설정 */
export interface SeatConfig {
  isHuman: boolean;
  name?: string;
}

export interface Play {
  playerId: string;
  cards: Card[];
  effectiveRank: CardRank;
  count: number;
}

export type GamePhase =
  | "lobby"
  | "dealing"
  | "tax"
  | "playing"
  | "roundEnd"
  | "gameOver";

export interface TrickState {
  leaderPlayerId: string | null;
  topPlay: Play | null;
  consecutivePasses: number;
  passedPlayerIds: string[];
  pile: Card[];
}

export interface TaxExchangeState {
  peasantToDalmuti: Card[];
  dalmutiToPeasant: Card[];
  merchantToChancellor: Card[];
  chancellorToMerchant: Card[];
  step:
    | "peasant-pick"
    | "dalmuti-pick"
    | "merchant-pick"
    | "chancellor-pick"
    | "done";
}

export type GameMode = "local" | "online";

export interface GameState {
  phase: GamePhase;
  roundNumber: number;
  players: Player[];
  seatOrder: string[];
  activeSeatIndex: number;
  trick: TrickState;
  discardPile: Card[];
  viewingPlayerIndex: number;
  tax: TaxExchangeState | null;
  lastRoundFinishOrder: string[] | null;
  selectedCardIds: string[];
  errorMessage: string | null;
  mode: GameMode;
  /** 온라인일 때 내 좌석(0–3). 로컬은 null */
  mySeatIndex: number | null;
}

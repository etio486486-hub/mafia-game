import type { Card, Player, Role4, TaxExchangeState } from "@/types/game";

export type TaxStep = TaxExchangeState["step"];

export function createEmptyTax(): TaxExchangeState {
  return {
    peasantToDalmuti: [],
    dalmutiToPeasant: [],
    merchantToChancellor: [],
    chancellorToMerchant: [],
    step: "peasant-pick",
  };
}

export const TAX_REQUIRED_COUNT: Record<
  Exclude<TaxStep, "done">,
  number
> = {
  "peasant-pick": 2,
  "dalmuti-pick": 2,
  "merchant-pick": 1,
  "chancellor-pick": 1,
};

export const TAX_ACTOR_ROLE: Record<Exclude<TaxStep, "done">, Role4> = {
  "peasant-pick": "peasant",
  "dalmuti-pick": "dalmuti",
  "merchant-pick": "merchant",
  "chancellor-pick": "chancellor",
};

export const TAX_STEP_TITLE_KO: Record<Exclude<TaxStep, "done">, string> = {
  "peasant-pick": "농노 → 달무티 조공 (2장)",
  "dalmuti-pick": "달무티 → 농노 회신 (2장)",
  "merchant-pick": "평민 → 총리대신 조공 (1장)",
  "chancellor-pick": "총리대신 → 평민 회신 (1장)",
};

export function nextTaxStep(step: TaxStep): TaxStep {
  const order: TaxStep[] = [
    "peasant-pick",
    "dalmuti-pick",
    "merchant-pick",
    "chancellor-pick",
    "done",
  ];
  const idx = order.indexOf(step);
  return order[idx + 1] ?? "done";
}

/** 조공: 적힌 수가 가장 작은 카드 (rank 숫자 오름차순) */
export function pickSmallestCards(hand: Card[], count: number): Card[] {
  return [...hand]
    .sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id))
    .slice(0, count);
}

/** 회신: 가장 쓸모없는 카드 (rank 숫자 내림차순) */
export function pickWeakestCards(hand: Card[], count: number): Card[] {
  return [...hand]
    .sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id))
    .slice(0, count);
}

export function playerWithRole(
  players: Player[],
  role: Role4,
): Player | undefined {
  return players.find((p) => p.role === role);
}

export function removeCardsFromPlayer(
  players: Player[],
  playerId: string,
  cardIds: string[],
): Player[] {
  const idSet = new Set(cardIds);
  return players.map((p) =>
    p.id === playerId
      ? { ...p, hand: p.hand.filter((c) => !idSet.has(c.id)) }
      : p,
  );
}

export function addCardsToPlayer(
  players: Player[],
  playerId: string,
  cards: Card[],
): Player[] {
  return players.map((p) =>
    p.id === playerId ? { ...p, hand: [...p.hand, ...cards] } : p,
  );
}

/** 농노↔달무티 교환 적용 (버퍼에 카드가 쌓인 뒤) */
export function applyPeasantDalmutiExchange(
  players: Player[],
  tax: TaxExchangeState,
): Player[] {
  const peasant = playerWithRole(players, "peasant");
  const dalmuti = playerWithRole(players, "dalmuti");
  if (!peasant || !dalmuti) return players;

  let next = addCardsToPlayer(players, dalmuti.id, tax.peasantToDalmuti);
  next = addCardsToPlayer(next, peasant.id, tax.dalmutiToPeasant);
  return next;
}

/** 평민↔총리대신 교환 적용 */
export function applyMerchantChancellorExchange(
  players: Player[],
  tax: TaxExchangeState,
): Player[] {
  const merchant = playerWithRole(players, "merchant");
  const chancellor = playerWithRole(players, "chancellor");
  if (!merchant || !chancellor) return players;

  let next = addCardsToPlayer(players, chancellor.id, tax.merchantToChancellor);
  next = addCardsToPlayer(next, merchant.id, tax.chancellorToMerchant);
  return next;
}

export function isTaxActorStep(
  step: TaxStep,
): step is Exclude<TaxStep, "done"> {
  return step !== "done";
}

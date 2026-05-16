import { enumerateAllPlays } from "@/lib/aiPlays";
import { analyzePlay } from "@/lib/playAnalysis";
import { pickSmallestCards, pickWeakestCards } from "@/lib/tax";
import type { TaxExchangeState } from "@/types/game";
import type { Card, Play, Player } from "@/types/game";
import { TAX_ACTOR_ROLE, TAX_REQUIRED_COUNT } from "@/lib/tax";
import { isTaxActorStep } from "@/lib/tax";

export type BotAction =
  | { type: "play"; cards: Card[] }
  | { type: "pass" };

/** 선: 약한 카드를 많이 한 번에 비우기 */
function chooseLeadPlay(hand: Card[]): Card[] {
  const candidates = enumerateAllPlays(hand, null);
  if (candidates.length === 0) {
    return [hand[0]];
  }

  let best = candidates[0];
  let bestScore = -Infinity;

  for (const play of candidates) {
    const analysis = analyzePlay(play);
    if (!analysis.isValid || analysis.effectiveRank === null) continue;
    const score = play.length * 12 + analysis.effectiveRank;
    if (score > bestScore) {
      bestScore = score;
      best = play;
    }
  }
  return best;
}

/** 따라가기: 이길 수 있는 조합 중 가장 약한 카드 사용 */
function chooseBeatPlay(hand: Card[], topPlay: Play): Card[] | null {
  const candidates = enumerateAllPlays(hand, topPlay);
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const ra = analyzePlay(a).effectiveRank ?? 99;
    const rb = analyzePlay(b).effectiveRank ?? 99;
    return rb - ra;
  });
  return candidates[0];
}

export function decideBotPlayAction(
  player: Player,
  topPlay: Play | null,
): BotAction {
  if (player.isOut || player.hand.length === 0) {
    return { type: "pass" };
  }

  if (!topPlay) {
    return { type: "play", cards: chooseLeadPlay(player.hand) };
  }

  const beat = chooseBeatPlay(player.hand, topPlay);
  if (!beat) {
    return { type: "pass" };
  }

  return { type: "play", cards: beat };
}

export function chooseBotTaxCards(
  player: Player,
  tax: TaxExchangeState,
): Card[] {
  if (!isTaxActorStep(tax.step)) return [];
  const required = TAX_REQUIRED_COUNT[tax.step];
  const role = TAX_ACTOR_ROLE[tax.step];
  if (player.role !== role) return [];

  const isTribute =
    tax.step === "peasant-pick" || tax.step === "merchant-pick";
  return isTribute
    ? pickSmallestCards(player.hand, required)
    : pickWeakestCards(player.hand, required);
}

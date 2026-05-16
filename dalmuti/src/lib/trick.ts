import { countActivePlayers } from "@/lib/seats";
import type { Card, Play, Player, TrickState } from "@/types/game";

export function createEmptyTrick(): TrickState {
  return {
    leaderPlayerId: null,
    topPlay: null,
    consecutivePasses: 0,
    passedPlayerIds: [],
    pile: [],
  };
}

/** 마지막 플레이 이후 나머지 활성 인원이 모두 패스했는지 */
export function shouldEndTrick(
  trick: TrickState,
  players: Player[],
): boolean {
  if (!trick.topPlay || !trick.leaderPlayerId) {
    return false;
  }
  const active = countActivePlayers(players);
  return trick.consecutivePasses >= active - 1;
}

export function applyPlayToTrick(trick: TrickState, play: Play): TrickState {
  return {
    leaderPlayerId: play.playerId,
    topPlay: play,
    consecutivePasses: 0,
    passedPlayerIds: [],
    pile: [...trick.pile, ...play.cards],
  };
}

export function applyPassToTrick(
  trick: TrickState,
  playerId: string,
): TrickState {
  return {
    ...trick,
    consecutivePasses: trick.consecutivePasses + 1,
    passedPlayerIds: [...trick.passedPlayerIds, playerId],
  };
}

export interface TrickResolution {
  trick: TrickState;
  discardPile: Card[];
  winnerPlayerId: string;
}

export function resolveTrickEnd(
  trick: TrickState,
  discardPile: Card[],
): TrickResolution {
  const winnerPlayerId = trick.leaderPlayerId ?? trick.topPlay?.playerId;
  if (!winnerPlayerId) {
    throw new Error("Cannot resolve trick without a leader");
  }

  return {
    winnerPlayerId,
    discardPile: [...discardPile, ...trick.pile],
    trick: createEmptyTrick(),
  };
}

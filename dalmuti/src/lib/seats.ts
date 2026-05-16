import type { Player } from "@/types/game";

export function seatIndexOf(
  seatOrder: string[],
  playerId: string,
): number {
  return seatOrder.indexOf(playerId);
}

export function playerAtSeat(
  players: Player[],
  seatOrder: string[],
  seatIndex: number,
): Player | undefined {
  const id = seatOrder[seatIndex];
  return players.find((p) => p.id === id);
}

export function countActivePlayers(players: Player[]): number {
  return players.filter((p) => !p.isOut).length;
}

/** 시계 방향 다음 좌석 (탈락자 스킵) */
export function nextActiveSeatIndex(
  seatOrder: string[],
  players: Player[],
  fromSeat: number,
): number {
  const n = seatOrder.length;
  for (let step = 1; step <= n; step++) {
    const idx = (fromSeat + step) % n;
    const player = playerAtSeat(players, seatOrder, idx);
    if (player && !player.isOut) {
      return idx;
    }
  }
  return fromSeat;
}

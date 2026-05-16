import { ROLE_ORDER_4 } from "@/types/game";
import type { Player, Role4 } from "@/types/game";

export function assignRolesFromFinishOrder(players: Player[]): Player[] {
  return players.map((player) => {
    const order = player.finishOrder;
    if (order === null || order >= ROLE_ORDER_4.length) {
      return { ...player, role: player.role };
    }
    return { ...player, role: ROLE_ORDER_4[order] as Role4 };
  });
}

export function finishOrderIds(players: Player[]): string[] {
  return [...players]
    .filter((p) => p.finishOrder !== null)
    .sort((a, b) => (a.finishOrder ?? 0) - (b.finishOrder ?? 0))
    .map((p) => p.id);
}

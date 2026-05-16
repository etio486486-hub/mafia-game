"use client";

import { RANK_LABELS_KO, ROLE_LABELS_KO } from "@/lib/constants";
import type { Play, Player } from "@/types/game";

interface TableAreaProps {
  players: Player[];
  seatOrder: string[];
  activeSeatIndex: number;
  topPlay: Play | null;
  passedPlayerIds: string[];
}

export function TableArea({
  players,
  seatOrder,
  activeSeatIndex,
  topPlay,
  passedPlayerIds,
}: TableAreaProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {seatOrder.map((id, seatIdx) => {
        const player = players.find((p) => p.id === id);
        if (!player) return null;
        const isActive = seatIdx === activeSeatIndex;
        const passed = passedPlayerIds.includes(id);
        const isLeader = topPlay?.playerId === id;

        return (
          <div
            key={id}
            className={[
              "rounded-xl border p-3 text-sm transition",
              isActive
                ? "border-amber-400 bg-amber-400/10 ring-1 ring-amber-400/50"
                : "border-slate-700 bg-slate-800/50",
              player.isOut ? "opacity-50" : "",
            ].join(" ")}
          >
            <div className="font-semibold">{player.name}</div>
            {player.role && (
              <p className="text-xs text-amber-200/80">
                {ROLE_LABELS_KO[player.role]}
              </p>
            )}
            <p className="mt-1 text-xs text-slate-400">
              {player.isOut
                ? `${(player.finishOrder ?? 0) + 1}등 탈락`
                : `패 ${player.hand.length}장`}
            </p>
            {passed && (
              <span className="mt-2 inline-block rounded bg-slate-700 px-2 py-0.5 text-xs">
                패스
              </span>
            )}
            {isLeader && topPlay && !player.isOut && (
              <p className="mt-2 text-xs text-emerald-300">
                리드: {topPlay.count}장 ·{" "}
                {RANK_LABELS_KO[topPlay.effectiveRank]}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

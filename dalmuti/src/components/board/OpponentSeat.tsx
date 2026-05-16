"use client";

import { CardBack } from "@/components/hand/CardBack";
import { ROLE_LABELS_KO } from "@/lib/constants";
import type { SeatPosition } from "@/lib/seatLayout";
import type { Play, Player } from "@/types/game";

interface OpponentSeatProps {
  player: Player;
  position: Exclude<SeatPosition, "self">;
  isActive: boolean;
  passed: boolean;
  isTrickLeader: boolean;
  topPlay: Play | null;
}

const positionClass: Record<Exclude<SeatPosition, "self">, string> = {
  top: "left-1/2 top-2 -translate-x-1/2 flex-col items-center",
  left: "left-2 top-1/2 -translate-y-1/2 flex-col items-center",
  right: "right-2 top-1/2 -translate-y-1/2 flex-col items-center",
};

export function OpponentSeat({
  player,
  position,
  isActive,
  passed,
  isTrickLeader,
  topPlay,
}: OpponentSeatProps) {
  const visibleBacks = Math.min(player.hand.length, 7);
  const stackOffset = position === "top" ? "horizontal" : "vertical";

  return (
    <div
      className={[
        "absolute z-10 flex gap-2",
        positionClass[position],
        player.isOut ? "opacity-45" : "",
      ].join(" ")}
    >
      <div
        className={[
          "rounded-2xl border px-3 py-2 backdrop-blur-sm transition",
          isActive
            ? "border-amber-400 bg-amber-500/15 shadow-[0_0_24px_rgba(251,191,36,0.25)]"
            : "border-slate-600/80 bg-slate-900/70",
        ].join(" ")}
      >
        <p className="flex items-center justify-center gap-1 whitespace-nowrap text-center text-sm font-semibold text-slate-100">
          {player.name}
          {!player.isHuman && (
            <span className="rounded bg-indigo-600/80 px-1.5 py-0.5 text-[9px] font-medium text-indigo-100">
              AI
            </span>
          )}
        </p>
        {player.role && (
          <p className="text-center text-[10px] text-amber-200/90">
            {ROLE_LABELS_KO[player.role]}
          </p>
        )}
        <p className="mt-0.5 text-center text-xs text-slate-400">
          {player.isOut
            ? `${(player.finishOrder ?? 0) + 1}등`
            : `${player.hand.length}장`}
        </p>
        {passed && (
          <span className="mt-1 block rounded bg-slate-700 px-2 py-0.5 text-center text-[10px] text-slate-200">
            패스
          </span>
        )}
        {isTrickLeader && topPlay && !player.isOut && (
          <span className="mt-1 block text-center text-[10px] text-emerald-300">
            {topPlay.count}장 리드
          </span>
        )}
      </div>

      {!player.isOut && (
        <div
          className={[
            "relative flex",
            stackOffset === "horizontal" ? "flex-row" : "flex-col",
          ].join(" ")}
        >
          {Array.from({ length: visibleBacks }).map((_, i) => (
            <CardBack
              key={i}
              size="sm"
              className={[
                stackOffset === "horizontal" ? "-ml-3 first:ml-0" : "-mt-2 first:mt-0",
              ].join(" ")}
            />
          ))}
          {player.hand.length > visibleBacks && (
            <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-slate-500">
              +{player.hand.length - visibleBacks}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

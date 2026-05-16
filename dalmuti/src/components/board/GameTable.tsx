"use client";

import { OpponentSeat } from "@/components/board/OpponentSeat";
import { TrickCenter } from "@/components/board/TrickCenter";
import { layoutSeatsFromView } from "@/lib/seatLayout";
import type { Play, Player, TrickState } from "@/types/game";

interface GameTableProps {
  players: Player[];
  seatOrder: string[];
  viewingSeatIndex: number;
  activeSeatIndex: number;
  trick: TrickState;
}

export function GameTable({
  players,
  seatOrder,
  viewingSeatIndex,
  activeSeatIndex,
  trick,
}: GameTableProps) {
  const slots = layoutSeatsFromView(seatOrder, viewingSeatIndex);

  return (
    <div className="game-felt relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-emerald-900/60 shadow-inner">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.04)_0%,transparent_55%)]" />

      {slots.map(({ playerId, seatIndex, position }) => {
        if (position === "self") return null;

        const player = players.find((p) => p.id === playerId);
        if (!player) return null;

        return (
          <OpponentSeat
            key={playerId}
            player={player}
            position={position}
            isActive={seatIndex === activeSeatIndex}
            passed={trick.passedPlayerIds.includes(playerId)}
            isTrickLeader={trick.topPlay?.playerId === playerId}
            topPlay={trick.topPlay}
          />
        );
      })}

      <TrickCenter topPlay={trick.topPlay} />
    </div>
  );
}

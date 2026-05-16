"use client";

import { PlayingCard } from "@/components/hand/PlayingCard";
import { RANK_LABELS_KO } from "@/lib/constants";
import type { Play } from "@/types/game";

interface TrickCenterProps {
  topPlay: Play | null;
}

export function TrickCenter({ topPlay }: TrickCenterProps) {
  if (!topPlay) {
    return (
      <div className="pointer-events-none absolute left-1/2 top-[42%] z-20 -translate-x-1/2 -translate-y-1/2 text-center">
        <p className="text-sm text-slate-500/90">카드를 내세요</p>
      </div>
    );
  }

  return (
    <div className="absolute left-1/2 top-[40%] z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
      <p className="rounded-full border border-emerald-500/30 bg-slate-900/80 px-3 py-1 text-xs text-emerald-200 backdrop-blur">
        {topPlay.count}장 · {RANK_LABELS_KO[topPlay.effectiveRank]}
      </p>
      <div className="flex -space-x-4">
        {topPlay.cards.map((card) => (
          <PlayingCard
            key={card.id}
            card={card}
            size="sm"
            disabled
          />
        ))}
      </div>
    </div>
  );
}

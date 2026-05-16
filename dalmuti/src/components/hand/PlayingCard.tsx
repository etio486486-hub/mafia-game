"use client";

import { RANK_LABELS_KO } from "@/lib/constants";
import type { Card } from "@/types/game";

export type CardSize = "sm" | "md" | "lg";

const sizeStyles: Record<
  CardSize,
  { box: string; rank: string; label: string }
> = {
  sm: { box: "h-16 w-11", rank: "text-lg", label: "text-[8px]" },
  md: { box: "h-24 w-16", rank: "text-2xl", label: "text-[10px]" },
  lg: { box: "h-28 w-[4.25rem]", rank: "text-2xl", label: "text-[10px]" },
};

interface PlayingCardProps {
  card: Card;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  size?: CardSize;
}

export function PlayingCard({
  card,
  selected,
  onClick,
  disabled,
  size = "md",
}: PlayingCardProps) {
  const isJester = card.rank === 13;
  const s = sizeStyles[size];
  const tier =
    card.rank <= 3
      ? "from-amber-600 to-amber-800"
      : card.rank <= 8
        ? "from-slate-600 to-slate-800"
        : "from-stone-700 to-stone-900";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "flex shrink-0 flex-col items-center justify-center rounded-lg border-2 bg-gradient-to-b text-white shadow-md transition",
        s.box,
        tier,
        isJester ? "border-fuchsia-400" : "border-white/20",
        selected ? "-translate-y-3 border-amber-300 ring-2 ring-amber-300" : "",
        disabled ? "cursor-not-allowed opacity-50" : "hover:-translate-y-1",
      ].join(" ")}
    >
      <span className={`font-bold ${s.rank}`}>{card.rank}</span>
      <span
        className={`mt-0.5 max-w-[90%] truncate leading-tight opacity-90 ${s.label}`}
      >
        {RANK_LABELS_KO[card.rank]}
      </span>
    </button>
  );
}

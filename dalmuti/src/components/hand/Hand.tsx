"use client";

import { PlayingCard } from "@/components/hand/PlayingCard";
import type { Card } from "@/types/game";

interface HandProps {
  cards: Card[];
  selectedIds: string[];
  onToggle: (cardId: string) => void;
  disabled?: boolean;
}

export function Hand({ cards, selectedIds, onToggle, disabled }: HandProps) {
  if (cards.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">손패 없음 (탈락)</p>
    );
  }

  return (
    <div className="flex flex-wrap justify-center gap-2 px-2">
      {cards.map((card) => (
        <PlayingCard
          key={card.id}
          card={card}
          selected={selectedIds.includes(card.id)}
          disabled={disabled}
          onClick={() => onToggle(card.id)}
        />
      ))}
    </div>
  );
}

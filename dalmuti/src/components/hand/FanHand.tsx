"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { PlayingCard } from "@/components/hand/PlayingCard";
import { computeFanLayout } from "@/lib/fanLayout";
import type { Card } from "@/types/game";

interface FanHandProps {
  cards: Card[];
  selectedIds: string[];
  onToggle: (cardId: string) => void;
  disabled?: boolean;
}

export function FanHand({
  cards,
  selectedIds,
  onToggle,
  disabled,
}: FanHandProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1024);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => setContainerWidth(el.clientWidth);
    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (cards.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500">
        손패를 모두 냈습니다
      </p>
    );
  }

  const layout = computeFanLayout(cards.length, containerWidth);

  return (
    <div
      ref={containerRef}
      className={[
        "mx-auto w-full max-w-5xl px-2",
        layout.scrollable
          ? "overflow-x-auto overflow-y-visible pb-1 [scrollbar-width:thin]"
          : "overflow-visible",
      ].join(" ")}
    >
      <div
        className="relative mx-auto"
        style={{
          width: layout.scrollable ? layout.innerWidth : "100%",
          height: layout.height,
          minWidth: layout.scrollable ? layout.innerWidth : undefined,
        }}
      >
        {cards.map((card, i) => {
          const pos = layout.positions[i];
          const selected = selectedIds.includes(card.id);
          const hovered = hoveredId === card.id;
          const lift = selected ? -32 : hovered ? -18 : 0;
          const z =
            selected ? 200 + i : hovered ? 150 + i : 10 + i;

          return (
            <div
              key={card.id}
              className="absolute bottom-0 origin-bottom transition-transform duration-150 ease-out"
              style={{
                left: pos.x,
                zIndex: z,
                transform: `translateX(-50%) rotate(${pos.angle}deg) translateY(${lift}px)`,
              }}
              onMouseEnter={() => setHoveredId(card.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <PlayingCard
                card={card}
                size={layout.size}
                selected={selected}
                disabled={disabled}
                onClick={() => onToggle(card.id)}
              />
            </div>
          );
        })}
      </div>
      {layout.scrollable && (
        <p className="mt-1 text-center text-[10px] text-slate-500">
          ← 손패가 많습니다. 좌우로 스크롤하세요 →
        </p>
      )}
    </div>
  );
}

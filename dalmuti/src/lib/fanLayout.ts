import type { CardSize } from "@/components/hand/PlayingCard";

export const CARD_WIDTH_PX: Record<CardSize, number> = {
  sm: 44,
  md: 64,
  lg: 68,
};

export const CARD_HEIGHT_PX: Record<CardSize, number> = {
  sm: 88,
  md: 112,
  lg: 128,
};

export function cardSizeForHand(count: number): CardSize {
  if (count > 16) return "sm";
  if (count > 10) return "md";
  return "lg";
}

export interface FanCardLayout {
  /** inner 컨테이너 기준 카드 중심 x (px) */
  x: number;
  angle: number;
}

export interface FanLayoutResult {
  size: CardSize;
  positions: FanCardLayout[];
  height: number;
  innerWidth: number;
  scrollable: boolean;
}

export function computeFanLayout(
  count: number,
  containerWidth: number,
): FanLayoutResult {
  const size = cardSizeForHand(count);
  const cardW = CARD_WIDTH_PX[size];
  const height = CARD_HEIGHT_PX[size] + 28;
  const padding = 16;
  const avail = Math.max(containerWidth - padding, cardW);

  if (count <= 1) {
    return {
      size,
      positions: [{ x: avail / 2, angle: 0 }],
      height,
      innerWidth: avail,
      scrollable: false,
    };
  }

  const minPeek = size === "sm" ? 30 : size === "md" ? 34 : 38;
  const maxPeek = size === "sm" ? 44 : 50;

  let peek = (avail - cardW) / (count - 1);
  let scrollable = false;

  if (peek < minPeek) {
    peek = minPeek;
    scrollable = cardW + peek * (count - 1) > avail;
  } else {
    peek = Math.min(maxPeek, peek);
  }

  const totalSpan = cardW + peek * (count - 1);
  const innerWidth = Math.max(avail, totalSpan + 24);
  const startX = (innerWidth - totalSpan) / 2;

  const maxRot =
    count > 16 ? 1.5 : count > 12 ? 2.5 : count > 8 ? 4 : 6;

  const positions: FanCardLayout[] = Array.from({ length: count }, (_, i) => ({
    x: startX + i * peek + cardW / 2,
    angle: -maxRot + (2 * maxRot * i) / (count - 1),
  }));

  return {
    size,
    positions,
    height,
    innerWidth,
    scrollable,
  };
}

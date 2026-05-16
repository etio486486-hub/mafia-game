export type SeatPosition = "self" | "left" | "top" | "right";

export interface SeatSlot {
  playerId: string;
  seatIndex: number;
  position: SeatPosition;
}

/** 시청자 기준 1인칭 배치: 나=아래, 좌·상·우=상대 */
export function layoutSeatsFromView(
  seatOrder: string[],
  viewingSeatIndex: number,
): SeatSlot[] {
  const n = seatOrder.length;
  const positions: SeatPosition[] = ["self", "left", "top", "right"];

  return seatOrder.map((playerId, seatIndex) => {
    const relative = (seatIndex - viewingSeatIndex + n) % n;
    return {
      playerId,
      seatIndex,
      position: positions[relative] ?? "top",
    };
  });
}

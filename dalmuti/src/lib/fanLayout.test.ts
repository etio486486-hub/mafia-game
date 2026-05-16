import { describe, expect, it } from "vitest";
import { computeFanLayout } from "@/lib/fanLayout";

describe("computeFanLayout", () => {
  it("uses wider peek for few cards", () => {
    const few = computeFanLayout(5, 800);
    const many = computeFanLayout(20, 800);
    const fewPeek =
      (few.positions[1].x - few.positions[0].x) /
      (few.positions.length > 1 ? 1 : 1);
    const manyPeek = many.positions[1].x - many.positions[0].x;
    expect(manyPeek).toBeGreaterThanOrEqual(28);
    expect(fewPeek).toBeGreaterThan(manyPeek);
  });

  it("enables scroll when hand cannot fit at min peek", () => {
    const layout = computeFanLayout(20, 320);
    expect(layout.scrollable).toBe(true);
    expect(layout.innerWidth).toBeGreaterThan(320);
  });
});

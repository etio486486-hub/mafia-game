import { describe, expect, it, beforeEach } from "vitest";
import { analyzePlay } from "@/lib/playAnalysis";
import { JESTER_RANK } from "@/lib/constants";
import { resetTestCardSequence, testCard } from "@/lib/test-cards";

describe("analyzePlay", () => {
  beforeEach(() => resetTestCardSequence());

  it("rejects empty play", () => {
    expect(analyzePlay([])).toMatchObject({
      isValid: false,
      reason: "EMPTY_PLAY",
    });
  });

  it("treats lone jester as rank 13", () => {
    expect(analyzePlay([testCard(JESTER_RANK)])).toEqual({
      isValid: true,
      effectiveRank: 13,
      count: 1,
    });
  });

  it("rejects two jesters with no other cards", () => {
    expect(analyzePlay([testCard(13), testCard(13)])).toMatchObject({
      isValid: false,
      reason: "MULTIPLE_JESTERS_ALONE",
    });
  });

  it("accepts jokers as wild for a single rank", () => {
    expect(
      analyzePlay([testCard(5), testCard(5), testCard(JESTER_RANK)]),
    ).toEqual({
      isValid: true,
      effectiveRank: 5,
      count: 3,
    });

    expect(
      analyzePlay([
        testCard(3),
        testCard(JESTER_RANK),
        testCard(JESTER_RANK),
      ]),
    ).toEqual({
      isValid: true,
      effectiveRank: 3,
      count: 3,
    });
  });

  it("rejects mixed non-jester ranks", () => {
    expect(analyzePlay([testCard(5), testCard(6)])).toMatchObject({
      isValid: false,
      reason: "MIXED_RANKS",
    });

    expect(
      analyzePlay([testCard(5), testCard(6), testCard(JESTER_RANK)]),
    ).toMatchObject({
      isValid: false,
      reason: "MIXED_RANKS",
    });
  });

  it("accepts pure same-rank sets without jesters", () => {
    expect(analyzePlay([testCard(9), testCard(9), testCard(9), testCard(9)]))
      .toEqual({
        isValid: true,
        effectiveRank: 9,
        count: 4,
      });
  });
});

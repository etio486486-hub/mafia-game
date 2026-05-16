"use client";

import { LobbyScreen } from "@/components/game/LobbyScreen";
import { PlayScreen } from "@/components/game/PlayScreen";
import { RoundEndScreen } from "@/components/game/RoundEndScreen";
import { TaxScreen } from "@/components/game/TaxScreen";
import { useGameStore } from "@/store/gameStore";

export function GameShell() {
  const phase = useGameStore((s) => s.phase);

  if (phase === "lobby") {
    return <LobbyScreen />;
  }
  if (phase === "roundEnd") {
    return <RoundEndScreen />;
  }
  if (phase === "tax") {
    return <TaxScreen />;
  }
  if (phase === "playing") {
    return <PlayScreen />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6 text-slate-400">
      준비 중… ({phase})
    </main>
  );
}

"use client";

import { ROLE_LABELS_KO } from "@/lib/constants";
import { useGameStore } from "@/store/gameStore";

export function RoundEndScreen() {
  const players = useGameStore((s) => s.players);
  const roundNumber = useGameStore((s) => s.roundNumber);
  const proceedFromRoundEnd = useGameStore((s) => s.proceedFromRoundEnd);

  const ranked = [...players]
    .filter((p) => p.finishOrder !== null)
    .sort((a, b) => (a.finishOrder ?? 0) - (b.finishOrder ?? 0));

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-6 p-6">
      <h2 className="text-2xl font-bold">라운드 {roundNumber} 종료</h2>
      <ol className="w-full space-y-2 rounded-xl border border-slate-700 bg-slate-800/50 p-4 text-left">
        {ranked.map((p, i) => (
          <li key={p.id} className="flex justify-between text-sm">
            <span>
              {i + 1}등 · {p.name}
            </span>
            <span className="text-amber-200">
              {p.role ? ROLE_LABELS_KO[p.role] : "—"}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-center text-xs text-slate-500">
        다음 단계에서 농노·달무티·평민·총리대신 세금 교환이 진행됩니다.
      </p>
      <button
        type="button"
        onClick={proceedFromRoundEnd}
        className="rounded-xl bg-amber-600 px-8 py-3 font-semibold text-white hover:bg-amber-500"
      >
        다음 라운드
      </button>
    </main>
  );
}

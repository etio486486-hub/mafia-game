"use client";

import { ActionBar } from "@/components/actions/ActionBar";
import { GameTable } from "@/components/board/GameTable";
import { FanHand } from "@/components/hand/FanHand";
import { PlayerSwitcher } from "@/components/game/PlayerSwitcher";
import { ROLE_LABELS_KO } from "@/lib/constants";
import { useGameStore } from "@/store/gameStore";
import {
  canSubmitPass,
  canSubmitPlay,
  isBotThinking,
  isViewingPlayersTurn,
  viewingPlayer,
} from "@/store/selectors";

export function PlayScreen() {
  const phase = useGameStore((s) => s.phase);
  const roundNumber = useGameStore((s) => s.roundNumber);
  const players = useGameStore((s) => s.players);
  const seatOrder = useGameStore((s) => s.seatOrder);
  const activeSeatIndex = useGameStore((s) => s.activeSeatIndex);
  const viewingPlayerIndex = useGameStore((s) => s.viewingPlayerIndex);
  const trick = useGameStore((s) => s.trick);
  const selectedCardIds = useGameStore((s) => s.selectedCardIds);
  const mode = useGameStore((s) => s.mode);
  const errorMessage = useGameStore((s) => s.errorMessage);

  const toggleCardSelection = useGameStore((s) => s.toggleCardSelection);
  const clearSelection = useGameStore((s) => s.clearSelection);
  const playSelectedCards = useGameStore((s) => s.playSelectedCards);
  const pass = useGameStore((s) => s.pass);
  const setViewingPlayer = useGameStore((s) => s.setViewingPlayer);
  const confirmTurnHandoff = useGameStore((s) => s.confirmTurnHandoff);

  const state = useGameStore();
  const viewer = viewingPlayer(state);
  const myTurn = isViewingPlayersTurn(state);
  const botThinking = isBotThinking(state);
  const active = players.find((p) => p.id === seatOrder[activeSeatIndex]);

  const switcherLabels = players.map((p, i) => {
    const short = p.name.replace(/\s+/g, "");
    return short.length > 4 ? `P${i + 1}` : short;
  });

  return (
    <main className="game-viewport flex h-[100dvh] w-full flex-col overflow-hidden">
      <header className="z-30 flex shrink-0 items-center justify-between gap-3 border-b border-slate-800/80 bg-slate-950/90 px-4 py-2 backdrop-blur">
        <div>
          <h1 className="text-base font-bold tracking-tight text-slate-100">
            달무티
            {mode === "online" && (
              <span className="ml-2 rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-normal text-white">
                온라인
              </span>
            )}
          </h1>
          <p className="text-[11px] text-slate-500">라운드 {roundNumber}</p>
        </div>
        {mode === "local" ? (
          <PlayerSwitcher
            labels={switcherLabels}
            activeIndex={viewingPlayerIndex}
            onSelect={setViewingPlayer}
          />
        ) : (
          <span className="text-[11px] text-slate-500">내 자리 고정</span>
        )}
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col px-2 pb-2 pt-2 sm:px-4">
        <div className="mb-2 text-center">
          {myTurn ? (
            <p className="text-sm font-medium text-amber-300">
              내 차례 — 카드를 선택하고 내기 또는 패스
            </p>
          ) : botThinking ? (
            <p className="text-sm text-indigo-300">
              {active?.name} AI가 생각 중…
            </p>
          ) : (
            <p className="text-sm text-slate-400">
              <span className="text-slate-200">{active?.name}</span> 차례
              {viewer && viewer.id !== active?.id && (
                <span className="text-slate-500"> · {viewer.name} 시점</span>
              )}
            </p>
          )}
          {viewer?.role && (
            <p className="mt-0.5 text-[11px] text-amber-200/70">
              {ROLE_LABELS_KO[viewer.role]}
            </p>
          )}
        </div>

        <GameTable
          players={players}
          seatOrder={seatOrder}
          viewingSeatIndex={viewingPlayerIndex}
          activeSeatIndex={activeSeatIndex}
          trick={trick}
        />

        {errorMessage && (
          <p
            className="pointer-events-none absolute left-1/2 top-[58%] z-30 -translate-x-1/2 rounded-lg bg-red-950/90 px-3 py-1.5 text-sm text-red-300"
            role="alert"
          >
            {errorMessage}
          </p>
        )}

        <section className="relative z-30 mt-auto shrink-0 pt-2">
          <FanHand
            cards={viewer?.hand ?? []}
            selectedIds={selectedCardIds}
            onToggle={toggleCardSelection}
            disabled={!myTurn || viewer?.isOut}
          />

          <div className="mt-3 flex flex-col items-center gap-2 pb-2">
            {myTurn && !viewer?.isOut && (
              <ActionBar
                canPlay={canSubmitPlay(state)}
                canPass={canSubmitPass(state)}
                onPlay={playSelectedCards}
                onPass={pass}
                onClear={clearSelection}
              />
            )}

            {!myTurn &&
              !botThinking &&
              mode === "local" &&
              phase === "playing" &&
              active?.isHuman && (
                <button
                  type="button"
                  onClick={confirmTurnHandoff}
                  className="rounded-full border border-amber-500/40 bg-slate-900/90 px-5 py-2 text-sm text-amber-200 hover:bg-amber-600/20"
                >
                  {active?.name} 차례로 기기 넘기기
                </button>
              )}
          </div>
        </section>
      </div>
    </main>
  );
}

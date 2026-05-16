"use client";

import { GameTable } from "@/components/board/GameTable";
import { FanHand } from "@/components/hand/FanHand";
import { PlayerSwitcher } from "@/components/game/PlayerSwitcher";
import { createEmptyTrick } from "@/lib/trick";
import { ROLE_LABELS_KO } from "@/lib/constants";
import { useGameStore } from "@/store/gameStore";
import { isBotThinking, viewingPlayer } from "@/store/selectors";
import {
  canConfirmTaxStep,
  isViewingTaxActor,
  taxActorPlayer,
  taxRequiredSelectionCount,
  taxStepTitle,
} from "@/store/taxSelectors";

export function TaxScreen() {
  const roundNumber = useGameStore((s) => s.roundNumber);
  const players = useGameStore((s) => s.players);
  const seatOrder = useGameStore((s) => s.seatOrder);
  const viewingPlayerIndex = useGameStore((s) => s.viewingPlayerIndex);
  const selectedCardIds = useGameStore((s) => s.selectedCardIds);
  const errorMessage = useGameStore((s) => s.errorMessage);
  const tax = useGameStore((s) => s.tax);

  const setViewingPlayer = useGameStore((s) => s.setViewingPlayer);
  const toggleCardSelection = useGameStore((s) => s.toggleCardSelection);
  const clearSelection = useGameStore((s) => s.clearSelection);
  const suggestTaxCards = useGameStore((s) => s.suggestTaxCards);
  const confirmTaxStep = useGameStore((s) => s.confirmTaxStep);

  const state = useGameStore();
  const viewer = viewingPlayer(state);
  const actor = taxActorPlayer(state);
  const title = taxStepTitle(state);
  const required = taxRequiredSelectionCount(state);
  const isActor = isViewingTaxActor(state);
  const canConfirm = canConfirmTaxStep(state);
  const botThinking = isBotThinking(state);

  const actorSeat = actor
    ? seatOrder.indexOf(actor.id)
    : viewingPlayerIndex;

  const switcherLabels = players.map((p, i) => `P${i + 1}`);

  return (
    <main className="game-viewport flex h-[100dvh] w-full flex-col overflow-hidden">
      <header className="z-30 flex shrink-0 items-center justify-between gap-3 border-b border-slate-800/80 bg-slate-950/90 px-4 py-2 backdrop-blur">
        <div>
          <h1 className="text-base font-bold">세금 교환</h1>
          <p className="text-[11px] text-slate-500">라운드 {roundNumber}</p>
        </div>
        <PlayerSwitcher
          labels={switcherLabels}
          activeIndex={viewingPlayerIndex}
          onSelect={setViewingPlayer}
        />
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-2 pb-2 pt-2 sm:px-4">
        <div className="mb-2 text-center">
          <p className="text-sm font-medium text-amber-200">{title}</p>
          <p className="mt-1 text-xs text-slate-400">
            {actor?.name}
            {actor?.role ? ` · ${ROLE_LABELS_KO[actor.role]}` : ""} · {required}
            장
          </p>
        {botThinking ? (
          <p className="mt-1 text-[11px] text-indigo-300">
            {actor?.name} AI가 카드를 고르는 중…
          </p>
        ) : (
          !isActor && (
            <p className="mt-1 text-[11px] text-slate-500">
              담당자 시점으로 전환한 뒤 카드를 고르세요
            </p>
          )
        )}
        </div>

        <GameTable
          players={players}
          seatOrder={seatOrder}
          viewingSeatIndex={viewingPlayerIndex}
          activeSeatIndex={actorSeat >= 0 ? actorSeat : 0}
          trick={createEmptyTrick()}
        />

        {errorMessage && (
          <p className="mt-2 text-center text-sm text-red-400" role="alert">
            {errorMessage}
          </p>
        )}

        <section className="relative z-30 mt-auto shrink-0 pt-2">
          <FanHand
            cards={viewer?.hand ?? []}
            selectedIds={selectedCardIds}
            onToggle={toggleCardSelection}
            disabled={!isActor}
          />

          {isActor && (
            <div className="mt-3 flex flex-wrap justify-center gap-2 pb-2">
              <button
                type="button"
                onClick={suggestTaxCards}
                className="rounded-full border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                {tax?.step === "peasant-pick" || tax?.step === "merchant-pick"
                  ? "좋은 카드 자동"
                  : "약한 카드 자동"}
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-full border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                선택 해제
              </button>
              <button
                type="button"
                onClick={confirmTaxStep}
                disabled={!canConfirm}
                className="rounded-full bg-amber-600 px-6 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-40"
              >
                확인
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

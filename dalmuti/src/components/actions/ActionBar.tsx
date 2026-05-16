"use client";

interface ActionBarProps {
  canPlay: boolean;
  canPass: boolean;
  onPlay: () => void;
  onPass: () => void;
  onClear: () => void;
}

export function ActionBar({
  canPlay,
  canPass,
  onPlay,
  onPass,
  onClear,
}: ActionBarProps) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      <button
        type="button"
        onClick={onPlay}
        disabled={!canPlay}
        className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        내기
      </button>
      <button
        type="button"
        onClick={onPass}
        disabled={!canPass}
        className="rounded-lg bg-slate-600 px-5 py-2 text-sm font-medium text-white hover:bg-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        패스
      </button>
      <button
        type="button"
        onClick={onClear}
        className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
      >
        선택 해제
      </button>
    </div>
  );
}

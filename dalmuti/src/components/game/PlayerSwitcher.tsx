"use client";

interface PlayerSwitcherProps {
  labels: string[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

export function PlayerSwitcher({
  labels,
  activeIndex,
  onSelect,
}: PlayerSwitcherProps) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-slate-600/80 bg-slate-900/90 p-1 backdrop-blur">
      <span className="hidden px-2 text-[10px] text-slate-500 sm:inline">
        시점
      </span>
      {labels.map((label, idx) => (
        <button
          key={label}
          type="button"
          onClick={() => onSelect(idx)}
          className={[
            "rounded-full px-2.5 py-1 text-xs font-medium transition",
            idx === activeIndex
              ? "bg-amber-600 text-white shadow"
              : "text-slate-400 hover:bg-slate-800 hover:text-slate-200",
          ].join(" ")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

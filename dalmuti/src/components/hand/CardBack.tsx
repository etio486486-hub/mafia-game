"use client";

interface CardBackProps {
  size?: "sm" | "md";
  className?: string;
}

const sizeClass = {
  sm: "h-10 w-7",
  md: "h-14 w-10",
};

export function CardBack({ size = "md", className = "" }: CardBackProps) {
  return (
    <div
      className={[
        "rounded-md border border-indigo-400/40 bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 shadow-md",
        sizeClass[size],
        className,
      ].join(" ")}
      aria-hidden
    >
      <span className="sr-only">카드 뒷면</span>
      <div className="flex h-full w-full items-center justify-center p-1">
        <div className="h-full w-full rounded-sm border border-indigo-300/25 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.07)_0_3px,transparent_3px_6px)]" />
      </div>
    </div>
  );
}

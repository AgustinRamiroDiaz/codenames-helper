"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type CellColor = "yellow" | "green" | "black";

const TOTAL_CELLS = 25;
const STORAGE_KEY = "codenames-helper:v1";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function shuffleArray<T>(array: T[]): T[] {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function generateGrid(numGood: number, numBad: number): CellColor[] {
  const clampedGood = clamp(numGood, 0, TOTAL_CELLS);
  const clampedBad = clamp(numBad, 0, TOTAL_CELLS - clampedGood);
  const numNeutral = TOTAL_CELLS - clampedGood - clampedBad;

  const cells: CellColor[] = [];
  for (let i = 0; i < clampedGood; i += 1) cells.push("green");
  for (let i = 0; i < clampedBad; i += 1) cells.push("black");
  for (let i = 0; i < numNeutral; i += 1) cells.push("yellow");

  return shuffleArray(cells);
}

export default function CodenamesGrid() {
  const [numGood, setNumGood] = useState<number>(9);
  const [numBad, setNumBad] = useState<number>(3);
  const [cells, setCells] = useState<CellColor[]>(Array.from({ length: TOTAL_CELLS }, () => "yellow" as CellColor));
  const [revealed, setRevealed] = useState<boolean[]>(() => Array(TOTAL_CELLS).fill(false));
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  const numNeutral = useMemo(() => {
    const remaining = TOTAL_CELLS - numGood - numBad;
    return remaining >= 0 ? remaining : 0;
  }, [numGood, numBad]);

  // Load saved state on mount; if none, generate fresh and mark loaded
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as {
          cells?: CellColor[];
          revealed?: boolean[];
          numGood?: number;
          numBad?: number;
        };
        if (
          parsed &&
          Array.isArray(parsed.cells) &&
          parsed.cells.length === TOTAL_CELLS &&
          Array.isArray(parsed.revealed) &&
          parsed.revealed.length === TOTAL_CELLS
        ) {
          setCells(parsed.cells);
          setRevealed(parsed.revealed);
          const good = parsed.cells.filter((c) => c === "green").length;
          const bad = parsed.cells.filter((c) => c === "black").length;
          setNumGood(good);
          setNumBad(bad);
          setIsLoaded(true);
          return;
        }
      }
      // Fallback: generate a new grid when nothing valid is saved
      const fresh = generateGrid(numGood, numBad);
      setCells(fresh);
      setRevealed(Array(TOTAL_CELLS).fill(false));
      setIsLoaded(true);
    } catch {
      const fresh = generateGrid(numGood, numBad);
      setCells(fresh);
      setRevealed(Array(TOTAL_CELLS).fill(false));
      setIsLoaded(true);
    }
  }, [numGood, numBad]);

  // Persist state whenever it changes after initial load
  useEffect(() => {
    if (!isLoaded) return;
    try {
      const payload = JSON.stringify({ cells, revealed, numGood, numBad });
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, payload);
      }
    } catch {
      // ignore quota/json errors
    }
  }, [isLoaded, cells, revealed, numGood, numBad]);

  const resetMarks = useCallback(() => {
    setRevealed(Array(TOTAL_CELLS).fill(false));
  }, []);

  const regenerate = useCallback(() => {
    setCells(generateGrid(numGood, numBad));
    resetMarks();
  }, [numGood, numBad, resetMarks]);

  function onChangeGood(value: string) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return;
    const clamped = clamp(parsed, 0, TOTAL_CELLS);
    const maxGoodGivenBad = TOTAL_CELLS - numBad;
    setNumGood(clamp(clamped, 0, maxGoodGivenBad));
  }

  function onChangeBad(value: string) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return;
    const clamped = clamp(parsed, 0, TOTAL_CELLS);
    const maxBadGivenGood = TOTAL_CELLS - numGood;
    setNumBad(clamp(clamped, 0, maxBadGivenGood));
  }

  function toggleCell(index: number) {
    setRevealed((prev) => {
      const next = prev.slice();
      next[index] = !next[index];
      return next;
    });
  }

  return (
    <div className="w-full max-w-[720px] flex flex-col gap-6 items-center">
      <details className="w-full">
        <summary className="cursor-pointer select-none h-10 px-4 rounded border border-black/[.08] dark:border-white/[.145] inline-flex items-center justify-between text-sm font-medium">
          Options
        </summary>
        <div className="mt-4 flex flex-wrap gap-4 items-end justify-center">
          <div className="flex flex-col gap-1">
            <label className="text-sm">Good (green)</label>
            <input
              type="number"
              min={0}
              max={TOTAL_CELLS}
              value={numGood}
              onChange={(e) => onChangeGood(e.target.value)}
              className="w-24 h-10 rounded border border-black/[.08] dark:border-white/[.145] bg-transparent px-3"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm">Bad (red)</label>
            <input
              type="number"
              min={0}
              max={TOTAL_CELLS}
              value={numBad}
              onChange={(e) => onChangeBad(e.target.value)}
              className="w-24 h-10 rounded border border-black/[.08] dark:border-white/[.145] bg-transparent px-3"
            />
          </div>
          <div className="flex flex-col gap-1 min-w-24">
            <span className="text-sm">Neutral (yellow)</span>
            <div className="h-10 flex items-center px-3 rounded border border-dashed border-black/[.08] dark:border-white/[.145]">
              {numNeutral}
            </div>
          </div>
          <button
            type="button"
            onClick={regenerate}
            className="h-10 px-4 rounded bg-foreground text-background text-sm font-medium hover:opacity-90"
          >
            Regenerate
          </button>
          <button
            type="button"
            onClick={resetMarks}
            className="h-10 px-4 rounded border border-black/[.08] dark:border-white/[.145] text-sm font-medium hover:bg-black/[.04] dark:hover:bg-white/[.06]"
          >
            Reset marks
          </button>
        </div>
      </details>

      {!isLoaded ? (
        <div className="grid grid-cols-5 gap-2 sm:gap-3 opacity-40 select-none">
          {Array.from({ length: TOTAL_CELLS }).map((_, i) => (
            <div key={i} className="bg-zinc-300 w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-2 sm:gap-3">
          {cells.map((color, index) => {
            const bgClass =
              color === "green"
                ? "bg-green-500"
                : color === "black"
                ? "bg-red-500"
                : "bg-yellow-400";
            const stateClass = revealed[index]
              ? "opacity-55 ring-2 ring-white/70 dark:ring-white/40"
              : "hover:opacity-90";

            return (
              <button
                key={index}
                type="button"
                aria-pressed={revealed[index]}
                onClick={() => toggleCell(index)}
                className={`${bgClass} ${stateClass} w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded shadow-sm border border-black/[.08] dark:border-white/[.145] transition`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
} 
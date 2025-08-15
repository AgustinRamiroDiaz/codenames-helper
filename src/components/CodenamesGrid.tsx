"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type CellColor = "yellow" | "green" | "black";

type PersistedState = {
  cells?: CellColor[];
  revealed?: boolean[];
  numGood?: number;
  numBad?: number;
  gridSize?: number;
  seed?: string;
};

const STORAGE_KEY = "codenames-helper:v1";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function shuffleArraySeeded<T>(array: T[], rnd: () => number): T[] {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function xfnv1a(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number): () => number {
  let t = a >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function seedToRng(seed: string): () => number {
  const h = xfnv1a(seed || "default");
  return mulberry32(h);
}

function randomSeed(): string {
  try {
    const a = new Uint32Array(2);
    if (typeof window !== "undefined" && window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(a);
      return (a[0].toString(36) + a[1].toString(36)).slice(0, 12);
    }
  } catch {}
  return Math.random().toString(36).slice(2, 14);
}

function generateGrid(numGood: number, numBad: number, totalCells: number, seed: string): CellColor[] {
  const clampedGood = clamp(numGood, 0, totalCells);
  const clampedBad = clamp(numBad, 0, totalCells - clampedGood);
  const numNeutral = totalCells - clampedGood - clampedBad;

  const cells: CellColor[] = [];
  for (let i = 0; i < clampedGood; i += 1) cells.push("green");
  for (let i = 0; i < clampedBad; i += 1) cells.push("black");
  for (let i = 0; i < numNeutral; i += 1) cells.push("yellow");

  const rng = seedToRng(seed);
  return shuffleArraySeeded(cells, rng);
}

function inferGridSizeFromCells(cells?: CellColor[]): number | null {
  if (!cells || !Array.isArray(cells)) return null;
  const length = cells.length;
  const size = Math.sqrt(length);
  if (Number.isInteger(size)) return size as number;
  return null;
}

export default function CodenamesGrid() {
  const [gridSize, setGridSize] = useState<number>(5);
  const totalCells = gridSize * gridSize;

  const [numGood, setNumGood] = useState<number>(9);
  const [numBad, setNumBad] = useState<number>(3);
  const [seed, setSeed] = useState<string>("");
  const [cells, setCells] = useState<CellColor[]>(() => Array.from({ length: 25 }, () => "yellow" as CellColor));
  const [revealed, setRevealed] = useState<boolean[]>(() => Array(25).fill(false));
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  const numNeutral = useMemo(() => {
    const remaining = totalCells - numGood - numBad;
    return remaining >= 0 ? remaining : 0;
  }, [totalCells, numGood, numBad]);

  // Load saved state on mount; if none, generate fresh and mark loaded
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedState;
        const savedSize = parsed.gridSize ?? inferGridSizeFromCells(parsed.cells) ?? 5;
        const expected = savedSize * savedSize;
        if (
          parsed &&
          Array.isArray(parsed.cells) &&
          parsed.cells.length === expected &&
          Array.isArray(parsed.revealed) &&
          parsed.revealed.length === expected
        ) {
          setGridSize(savedSize);
          setSeed(parsed.seed ?? randomSeed());
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
      const s = randomSeed();
      setSeed(s);
      setCells(generateGrid(numGood, numBad, totalCells, s));
      setRevealed(Array(totalCells).fill(false));
      setIsLoaded(true);
    } catch {
      const s = randomSeed();
      setSeed(s);
      setCells(generateGrid(numGood, numBad, totalCells, s));
      setRevealed(Array(totalCells).fill(false));
      setIsLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist state whenever it changes after initial load
  useEffect(() => {
    if (!isLoaded) return;
    try {
      const payload: PersistedState = { cells, revealed, numGood, numBad, gridSize, seed };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      }
    } catch {
      // ignore quota/json errors
    }
  }, [isLoaded, cells, revealed, numGood, numBad, gridSize, seed]);

  const resetMarks = useCallback(() => {
    setRevealed(Array(totalCells).fill(false));
  }, [totalCells]);

  const regenerate = useCallback(() => {
    setCells(generateGrid(numGood, numBad, totalCells, seed || "default"));
    setRevealed(Array(totalCells).fill(false));
  }, [numGood, numBad, totalCells, seed]);

  function onChangeGood(value: string) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return;
    const clamped = clamp(parsed, 0, totalCells);
    const maxGoodGivenBad = totalCells - numBad;
    setNumGood(clamp(clamped, 0, maxGoodGivenBad));
  }

  function onChangeBad(value: string) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return;
    const clamped = clamp(parsed, 0, totalCells);
    const maxBadGivenGood = totalCells - numGood;
    setNumBad(clamp(clamped, 0, maxBadGivenGood));
  }

  function onChangeGridSize(value: string) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return;
    const nextSize = clamp(parsed, 2, 10);
    const nextTotal = nextSize * nextSize;
    // Clamp counts to new capacity
    const nextGood = clamp(numGood, 0, nextTotal);
    const nextBad = clamp(numBad, 0, nextTotal - nextGood);
    setGridSize(nextSize);
    setNumGood(nextGood);
    setNumBad(nextBad);
    setCells(generateGrid(nextGood, nextBad, nextTotal, seed || "default"));
    setRevealed(Array(nextTotal).fill(false));
  }

  function onRandomizeSeed() {
    const s = randomSeed();
    setSeed(s);
    setCells(generateGrid(numGood, numBad, totalCells, s));
    setRevealed(Array(totalCells).fill(false));
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
            <label className="text-sm">Grid size (N×N)</label>
            <input
              type="number"
              min={2}
              max={10}
              value={gridSize}
              onChange={(e) => onChangeGridSize(e.target.value)}
              className="w-24 h-10 rounded border border-black/[.08] dark:border-white/[.145] bg-transparent px-3"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm">Seed</label>
            <input
              type="text"
              inputMode="text"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              className="w-40 h-10 rounded border border-black/[.08] dark:border-white/[.145] bg-transparent px-3"
              placeholder="e.g. game-night-1"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm">Good (green)</label>
            <input
              type="number"
              min={0}
              max={totalCells}
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
              max={totalCells}
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
            onClick={onRandomizeSeed}
            className="h-10 px-4 rounded border border-black/[.08] dark:border-white/[.145] text-sm font-medium hover:bg-black/[.04] dark:hover:bg-white/[.06]"
          >
            Randomize seed
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
        <div className="grid gap-2 sm:gap-3 opacity-40 select-none" style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))` }}>
          {Array.from({ length: totalCells }).map((_, i) => (
            <div key={i} className="bg-zinc-300 w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded" />
          ))}
        </div>
      ) : (
        <div className="grid gap-2 sm:gap-3" style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))` }}>
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
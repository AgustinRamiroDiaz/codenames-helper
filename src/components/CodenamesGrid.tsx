"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type CellColor = "yellow" | "green" | "black";

type Side = "A" | "B";

type BoardConfig = {
  gridSize: number;
  numGood: number;
  numBad: number;
  seed: string;
  side: Side;
};

type PersistedStateV2 = {
  config: BoardConfig;
  cells: CellColor[];
  revealed: boolean[];
};

type PersistedStateLegacy = {
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

function generateSideA(numGood: number, numBad: number, totalCells: number, seed: string): CellColor[] {
  const clampedGood = clamp(numGood, 0, totalCells);
  const clampedBad = clamp(numBad, 0, totalCells - clampedGood);
  const numNeutral = totalCells - clampedGood - clampedBad;

  const cells: CellColor[] = [];
  for (let i = 0; i < clampedGood; i += 1) cells.push("green");
  for (let i = 0; i < clampedBad; i += 1) cells.push("black");
  for (let i = 0; i < numNeutral; i += 1) cells.push("yellow");

  const rng = seedToRng(seed + "|A");
  return shuffleArraySeeded(cells, rng);
}

function generateSideB(numGood: number, numBad: number, totalCells: number, seed: string): CellColor[] {
  const base = generateSideA(numGood, numBad, totalCells, seed);
  let pool: CellColor[] = base.slice();

  const greenIndices: number[] = [];
  for (let i = 0; i < base.length; i += 1) {
    if (base[i] === "green") greenIndices.push(i);
  }
  const pinsToSelect = Math.min(3, greenIndices.length);
  const rngPins = seedToRng(seed + "|pins");
  const pinnedIndices = shuffleArraySeeded(greenIndices, rngPins).slice(0, pinsToSelect);
  const pinnedIndexSet = new Set(pinnedIndices);

  const result: (CellColor | undefined)[] = new Array(totalCells).fill(undefined);

  for (const idx of pinnedIndices) {
    result[idx] = "green";
    const poolGreenIdx = pool.findIndex((c) => c === "green");
    if (poolGreenIdx !== -1) pool.splice(poolGreenIdx, 1);
  }

  const rngPool1 = seedToRng(seed + "|pool1");
  pool = shuffleArraySeeded(pool, rngPool1);

  for (let i = 0; i < base.length; i += 1) {
    if (base[i] === "green" && !pinnedIndexSet.has(i)) {
      let takeIdx = pool.findIndex((c) => c !== "green");
      if (takeIdx === -1) takeIdx = 0;
      const item = pool.splice(takeIdx, 1)[0];
      result[i] = item;
    }
  }

  const rngPool2 = seedToRng(seed + "|pool2");
  pool = shuffleArraySeeded(pool, rngPool2);

  for (let i = 0; i < result.length; i += 1) {
    if (result[i] === undefined) {
      const item = pool.shift();
      result[i] = (item ?? "yellow");
    }
  }

  return result as CellColor[];
}

function generateGrid(numGood: number, numBad: number, totalCells: number, seed: string, side: Side): CellColor[] {
  return side === "B"
    ? generateSideB(numGood, numBad, totalCells, seed)
    : generateSideA(numGood, numBad, totalCells, seed);
}

function inferGridSizeFromCells(cells?: CellColor[]): number | null {
  if (!cells || !Array.isArray(cells)) return null;
  const length = cells.length;
  const size = Math.sqrt(length);
  if (Number.isInteger(size)) return size as number;
  return null;
}

export default function CodenamesGrid() {
  const [config, setConfig] = useState<BoardConfig>({ gridSize: 5, numGood: 9, numBad: 3, seed: "", side: "A" });
  const totalCells = config.gridSize * config.gridSize;

  const [cells, setCells] = useState<CellColor[]>(() => Array.from({ length: 25 }, () => "yellow" as CellColor));
  const [revealed, setRevealed] = useState<boolean[]>(() => Array(25).fill(false));
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [skipNextRegen, setSkipNextRegen] = useState<boolean>(false);

  const numNeutral = useMemo(() => {
    const remaining = totalCells - config.numGood - config.numBad;
    return remaining >= 0 ? remaining : 0;
  }, [totalCells, config.numGood, config.numBad]);

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedStateV2 | PersistedStateLegacy;
        if (parsed && (parsed as PersistedStateV2).config) {
          const v2 = parsed as PersistedStateV2;
          const cfg: BoardConfig = { ...v2.config, side: (v2.config as Partial<BoardConfig>).side ?? "A" };
          const expected = cfg.gridSize * cfg.gridSize;
          if (Array.isArray(v2.cells) && v2.cells.length === expected && Array.isArray(v2.revealed) && v2.revealed.length === expected) {
            setConfig(cfg);
            setCells(v2.cells);
            setRevealed(v2.revealed);
            setSkipNextRegen(true);
            setIsLoaded(true);
            return;
          }
        } else {
          const legacy = parsed as PersistedStateLegacy;
          const savedSize = legacy.gridSize ?? inferGridSizeFromCells(legacy.cells) ?? 5;
          const expected = savedSize * savedSize;
          if (
            legacy &&
            Array.isArray(legacy.cells) && legacy.cells.length === expected &&
            Array.isArray(legacy.revealed) && legacy.revealed.length === expected
          ) {
            const seed = legacy.seed ?? randomSeed();
            const numGood = legacy.numGood ?? legacy.cells.filter((c) => c === "green").length;
            const numBad = legacy.numBad ?? legacy.cells.filter((c) => c === "black").length;
            setConfig({ gridSize: savedSize, numGood, numBad, seed, side: "A" });
            setCells(legacy.cells);
            setRevealed(legacy.revealed);
            setSkipNextRegen(true);
            setIsLoaded(true);
            return;
          }
        }
      }
      const seed = randomSeed();
      const initial: BoardConfig = { gridSize: 5, numGood: 9, numBad: 3, seed, side: "A" };
      setConfig(initial);
      setCells(generateGrid(initial.numGood, initial.numBad, initial.gridSize * initial.gridSize, initial.seed, initial.side));
      setRevealed(Array(initial.gridSize * initial.gridSize).fill(false));
      setSkipNextRegen(true);
      setIsLoaded(true);
    } catch {
      const seed = randomSeed();
      const initial: BoardConfig = { gridSize: 5, numGood: 9, numBad: 3, seed, side: "A" };
      setConfig(initial);
      setCells(generateGrid(initial.numGood, initial.numBad, initial.gridSize * initial.gridSize, initial.seed, initial.side));
      setRevealed(Array(initial.gridSize * initial.gridSize).fill(false));
      setSkipNextRegen(true);
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (skipNextRegen) {
      setSkipNextRegen(false);
      return;
    }
    setCells(generateGrid(config.numGood, config.numBad, totalCells, config.seed || "default", config.side));
    setRevealed(Array(totalCells).fill(false));
  }, [isLoaded, skipNextRegen, config, totalCells]);

  useEffect(() => {
    if (!isLoaded) return;
    try {
      const payload: PersistedStateV2 = { config, cells, revealed };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      }
    } catch {}
  }, [isLoaded, config, cells, revealed]);

  const resetMarks = useCallback(() => {
    setRevealed(Array(totalCells).fill(false));
  }, [totalCells]);

  function onChangeGood(value: string) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return;
    const clamped = clamp(parsed, 0, totalCells);
    const maxGoodGivenBad = totalCells - config.numBad;
    const nextGood = clamp(clamped, 0, maxGoodGivenBad);
    setConfig((c) => ({ ...c, numGood: nextGood }));
  }

  function onChangeBad(value: string) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return;
    const clamped = clamp(parsed, 0, totalCells);
    const maxBadGivenGood = totalCells - config.numGood;
    const nextBad = clamp(clamped, 0, maxBadGivenGood);
    setConfig((c) => ({ ...c, numBad: nextBad }));
  }

  function onChangeGridSize(value: string) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return;
    const nextSize = clamp(parsed, 2, 10);
    const nextTotal = nextSize * nextSize;
    const nextGood = clamp(config.numGood, 0, nextTotal);
    const nextBad = clamp(config.numBad, 0, nextTotal - nextGood);
    setConfig((c) => ({ ...c, gridSize: nextSize, numGood: nextGood, numBad: nextBad }));
  }

  function onSeedChange(nextSeed: string) {
    setConfig((c) => ({ ...c, seed: nextSeed }));
  }

  function onRandomizeSeed() {
    const s = randomSeed();
    setConfig((c) => ({ ...c, seed: s }));
  }

  function onChangeSide(nextSide: string) {
    const side = nextSide === "B" ? "B" : "A";
    setConfig((c) => ({ ...c, side }));
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
      <div className="w-full flex flex-wrap gap-4 items-end justify-center">
        <div className="flex flex-col gap-1">
          <label className="text-sm">Seed</label>
          <input
            type="text"
            inputMode="text"
            value={config.seed}
            onChange={(e) => onSeedChange(e.target.value)}
            className="w-40 h-10 rounded border border-black/[.08] dark:border-white/[.145] bg-transparent px-3"
            placeholder="e.g. game-night-1"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm">Side</label>
          <div className="flex items-center gap-3">
            <span className="text-xs opacity-70">A</span>
            <input
              type="range"
              min={0}
              max={1}
              step={1}
              value={config.side === "A" ? 0 : 1}
              onChange={(e) => onChangeSide(e.target.value === "1" ? "B" : "A")}
              className="w-36 h-2 accent-foreground"
            />
            <span className="text-xs opacity-70">B</span>
            <div className="text-sm w-5 text-center">{config.side}</div>
          </div>
        </div>
      </div>

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
              value={config.gridSize}
              onChange={(e) => onChangeGridSize(e.target.value)}
              className="w-24 h-10 rounded border border-black/[.08] dark:border-white/[.145] bg-transparent px-3"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm">Good (green)</label>
            <input
              type="number"
              min={0}
              max={totalCells}
              value={config.numGood}
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
              value={config.numBad}
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
        <div className="grid gap-2 sm:gap-3 opacity-40 select-none" style={{ gridTemplateColumns: `repeat(${config.gridSize}, minmax(0, 1fr))` }}>
          {Array.from({ length: totalCells }).map((_, i) => (
            <div key={i} className="bg-zinc-300 w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded" />
          ))}
        </div>
      ) : (
        <div className="grid gap-2 sm:gap-3" style={{ gridTemplateColumns: `repeat(${config.gridSize}, minmax(0, 1fr))` }}>
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { fetchSlice, fetchWindowStats } from "@/api/client";
import type { Orientation } from "@/types";
import { ReglCanvas } from "./ReglCanvas";
import { ViewerControls } from "./ViewerControls";
import type { ColormapName } from "./colormaps";

interface VolumeViewerProps {
  jobId: string;
  resultShape: number[];
}

interface SliceEntry {
  key: string;
  index: number;
  width: number;
  height: number;
  data: Float32Array;
}

interface InflightEntry {
  controller: AbortController;
  promise: Promise<SliceEntry | null>;
}

const SLICE_CACHE_SIZE = 7;

function touchLru<K, V>(map: Map<K, V>, key: K): V | undefined {
  const value = map.get(key);
  if (value === undefined) return undefined;
  map.delete(key);
  map.set(key, value);
  return value;
}

export function VolumeViewer({ jobId, resultShape }: VolumeViewerProps) {
  const batchDims = resultShape.slice(0, -3);
  const spatialDims = resultShape.slice(-3) as [number, number, number];
  const [zSize, ySize, xSize] = spatialDims;

  const [orientation, setOrientation] = useState<Orientation>("yx");
  const [batchIndices, setBatchIndices] = useState<number[]>(batchDims.map(() => 0));
  const [sliceIndex, setSliceIndex] = useState(0);
  const [vmin, setVmin] = useState(0);
  const [vmax, setVmax] = useState(1);
  const [colormap, setColormap] = useState<ColormapName>("gray");

  const [displayedSlice, setDisplayedSlice] = useState<SliceEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pendingUpdate = useRef(false);
  const cacheRef = useRef<Map<string, SliceEntry>>(new Map());
  const inflightRef = useRef<Map<string, InflightEntry>>(new Map());
  const contextTokenRef = useRef(0);
  const targetIndexRef = useRef(0);

  const getScrollAxis = useCallback(
    (orient: Orientation): { axis: "z" | "y" | "x"; max: number } => {
      switch (orient) {
        case "zy":
          return { axis: "x", max: xSize };
        case "zx":
          return { axis: "y", max: ySize };
        case "yx":
          return { axis: "z", max: zSize };
      }
      return { axis: "z", max: zSize };
    },
    [xSize, ySize, zSize]
  );

  const contextKey = useMemo(
    () => `${jobId}|${orientation}|${batchIndices.join(",")}`,
    [jobId, orientation, batchIndices]
  );

  const makeSliceKey = useCallback(
    (index: number) => `${jobId}|${orientation}|${batchIndices.join(",")}|${index}`,
    [jobId, orientation, batchIndices]
  );

  const clearTransientState = useCallback(() => {
    cacheRef.current.clear();
    for (const entry of inflightRef.current.values()) {
      entry.controller.abort();
    }
    inflightRef.current.clear();
  }, []);

  const cacheSlice = useCallback((entry: SliceEntry) => {
    const cache = cacheRef.current;
    cache.delete(entry.key);
    cache.set(entry.key, entry);
    while (cache.size > SLICE_CACHE_SIZE) {
      const oldestKey = cache.keys().next().value;
      if (typeof oldestKey !== "string") break;
      cache.delete(oldestKey);
    }
  }, []);

  const loadSlice = useCallback(
    (index: number, token: number): Promise<SliceEntry | null> => {
      const scrollMax = getScrollAxis(orientation).max;
      if (index < 0 || index >= scrollMax) return Promise.resolve(null);

      const key = makeSliceKey(index);
      const cached = touchLru(cacheRef.current, key);
      if (cached) return Promise.resolve(cached);

      const existing = inflightRef.current.get(key);
      if (existing) return existing.promise;

      const controller = new AbortController();

      const promise = (async (): Promise<SliceEntry | null> => {
        try {
          const { data, metadata } = await fetchSlice(
            jobId,
            orientation,
            index,
            batchIndices,
            controller.signal
          );
          if (contextTokenRef.current !== token) return null;

          const entry: SliceEntry = {
            key,
            index,
            width: metadata.shape[1],
            height: metadata.shape[0],
            data,
          };
          cacheSlice(entry);
          return entry;
        } catch (err) {
          if ((err as Error).name === "AbortError") return null;
          throw err;
        } finally {
          inflightRef.current.delete(key);
        }
      })();

      inflightRef.current.set(key, { controller, promise });
      return promise;
    },
    [batchIndices, cacheSlice, getScrollAxis, jobId, makeSliceKey, orientation]
  );

  const requestSliceSet = useCallback(
    async (targetIndex: number) => {
      const token = contextTokenRef.current;
      targetIndexRef.current = targetIndex;
      const scrollMax = getScrollAxis(orientation).max;
      const prefetchOrder = [
        targetIndex,
        targetIndex + 1,
        targetIndex - 1,
        targetIndex + 2,
        targetIndex - 2,
      ].filter((idx) => idx >= 0 && idx < scrollMax);

      const desiredKeys = new Set(prefetchOrder.map((idx) => makeSliceKey(idx)));

      for (const [key, entry] of inflightRef.current.entries()) {
        if (!desiredKeys.has(key)) {
          entry.controller.abort();
          inflightRef.current.delete(key);
        }
      }

      const immediateKey = makeSliceKey(targetIndex);
      const cachedTarget = touchLru(cacheRef.current, immediateKey);
      if (cachedTarget) {
        setDisplayedSlice(cachedTarget);
        setIsLoading(false);
      }

      // Load target slice first (highest priority)
      try {
        const targetEntry = await loadSlice(targetIndex, token);
        if (targetEntry && targetIndex === targetIndexRef.current && token === contextTokenRef.current) {
          setDisplayedSlice(targetEntry);
          setIsLoading(false);
        }
      } catch (err) {
        if (token === contextTokenRef.current && targetIndex === targetIndexRef.current) {
          setError((err as Error).message);
          setIsLoading(false);
        }
        return;
      }

      // Prefetch neighbors in parallel (bounded by browser connection limits)
      const neighbors = prefetchOrder.slice(1);
      await Promise.allSettled(neighbors.map((idx) => loadSlice(idx, token)));
    },
    [getScrollAxis, loadSlice, makeSliceKey, orientation]
  );

  useEffect(() => {
    contextTokenRef.current += 1;
    const token = contextTokenRef.current;
    clearTransientState();
    setError(null);
    setIsLoading(true);
    setDisplayedSlice(null);
    void requestSliceSet(0);

    const controller = new AbortController();
    void fetchWindowStats(jobId, batchIndices, controller.signal)
      .then((stats) => {
        if (contextTokenRef.current !== token) return;
        setVmin(stats.p01);
        setVmax(stats.p99);
      })
      .catch(() => {
        // window stats are best-effort; slice loading handles real errors
      });

    return () => {
      controller.abort();
      clearTransientState();
    };
  }, [contextKey, clearTransientState, requestSliceSet, jobId, batchIndices]);

  useEffect(() => {
    void requestSliceSet(sliceIndex);
  }, [sliceIndex, requestSliceSet]);

  const handleOrientationChange = useCallback(
    (o: Orientation) => {
      setOrientation(o);
      setSliceIndex(0);
    },
    []
  );

  const setSliceIndexClamped = useCallback(
    (next: number) => {
      const { max } = getScrollAxis(orientation);
      setSliceIndex(Math.max(0, Math.min(next, max - 1)));
    },
    [getScrollAxis, orientation]
  );

  const handleOdometerScroll = useCallback(
    (delta: number) => {
      if (pendingUpdate.current) return;
      pendingUpdate.current = true;

      requestAnimationFrame(() => {
        pendingUpdate.current = false;

        const scrollInfo = getScrollAxis(orientation);
        const scrollMaxes = [...batchDims, scrollInfo.max];
        const scrollValues = [...batchIndices, sliceIndex];

        let carry = delta > 0 ? 1 : -1;
        const newValues = [...scrollValues];

        for (let i = newValues.length - 1; i >= 0 && carry !== 0; i--) {
          newValues[i] += carry;
          if (newValues[i] >= scrollMaxes[i]) {
            newValues[i] = 0;
            carry = 1;
          } else if (newValues[i] < 0) {
            newValues[i] = scrollMaxes[i] - 1;
            carry = -1;
          } else {
            carry = 0;
          }
        }

        const nextBatch = newValues.slice(0, batchDims.length);
        const nextSlice = newValues[newValues.length - 1];
        const batchChanged = nextBatch.some((value, index) => value !== batchIndices[index]);
        if (batchChanged) setBatchIndices(nextBatch);
        setSliceIndexClamped(nextSlice);
      });
    },
    [batchDims, batchIndices, getScrollAxis, orientation, sliceIndex, setSliceIndexClamped]
  );

  const handleAxisScroll = useCallback(
    (axisIndex: number, delta: number) => {
      if (pendingUpdate.current) return;
      pendingUpdate.current = true;

      requestAnimationFrame(() => {
        pendingUpdate.current = false;
        const scrollInfo = getScrollAxis(orientation);
        const scrollMaxes = [...batchDims, scrollInfo.max];

        if (axisIndex < batchDims.length) {
          const next = [...batchIndices];
          next[axisIndex] = Math.max(
            0,
            Math.min(next[axisIndex] + (delta > 0 ? 1 : -1), scrollMaxes[axisIndex] - 1)
          );
          setBatchIndices(next);
          return;
        }

        setSliceIndexClamped(sliceIndex + (delta > 0 ? 1 : -1));
      });
    },
    [batchDims, batchIndices, getScrollAxis, orientation, sliceIndex, setSliceIndexClamped]
  );

  const handleAxisValueChange = useCallback(
    (axisIndex: number, value: number) => {
      if (axisIndex < batchDims.length) {
        const next = [...batchIndices];
        next[axisIndex] = Math.max(0, Math.min(value, batchDims[axisIndex] - 1));
        setBatchIndices(next);
      } else {
        setSliceIndexClamped(value);
      }
    },
    [batchDims, batchIndices, setSliceIndexClamped]
  );

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center gradient-mesh">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--color-accent)]" />
          <span className="text-sm text-[var(--color-muted-foreground)]">Loading volume...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center gradient-mesh">
        <div className="flex flex-col items-center gap-2 text-center px-4">
          <div className="w-10 h-10 rounded-full bg-[var(--color-destructive)]/10 flex items-center justify-center">
            <span className="text-[var(--color-destructive)] text-lg">!</span>
          </div>
          <span className="text-[var(--color-destructive)] text-sm">{error}</span>
        </div>
      </div>
    );
  }

  const scrollInfo = getScrollAxis(orientation);
  
  const dimensionLabel = `${xSize}×${ySize}×${zSize}`;
  const sliceLabel = `${scrollInfo.axis.toUpperCase()}:${sliceIndex + 1}/${scrollInfo.max}`;

  return (
    <div className="h-full relative gradient-mesh">
      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <div className="text-[10px] font-mono text-[var(--color-muted-foreground)] opacity-70">
          {dimensionLabel}
        </div>
      </div>

      <div className="absolute top-4 right-4 z-10 pointer-events-none">
        <div className="text-[10px] font-mono text-[var(--color-muted-foreground)] opacity-70">
          {sliceLabel}
        </div>
      </div>

      <div className="absolute inset-0 pointer-events-none" style={{
        background: "radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.4) 100%)",
        opacity: 0.3,
      }} />

      <div className="absolute inset-4 bottom-20 rounded-lg overflow-hidden ring-1 ring-white/5">
        {displayedSlice && (
          <ReglCanvas
            sliceData={displayedSlice.data}
            width={displayedSlice.width}
            height={displayedSlice.height}
            sliceIndex={displayedSlice.index}
            vmin={vmin}
            vmax={vmax}
            colormap={colormap}
            onWheelSlice={handleOdometerScroll}
          />
        )}
      </div>

      <ViewerControls
        orientation={orientation}
        onOrientationChange={handleOrientationChange}
        batchDims={batchDims}
        batchIndices={batchIndices}
        spatialScrollAxis={scrollInfo.axis}
        spatialScrollMax={scrollInfo.max}
        spatialScrollIndex={sliceIndex}
        vmin={vmin}
        vmax={vmax}
        colormap={colormap}
        onColormapChange={setColormap}
        onVminChange={setVmin}
        onVmaxChange={setVmax}
        onAxisScroll={handleAxisScroll}
        onAxisValueChange={handleAxisValueChange}
      />
    </div>
  );
}

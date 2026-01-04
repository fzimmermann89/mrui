import { useState, useEffect, useCallback, useRef } from "react";
import { fetchVolume } from "@/api/client";
import type { Orientation } from "@/types";
import { ReglCanvas } from "./ReglCanvas";
import { ViewerControls } from "./ViewerControls";
import { Loader2 } from "lucide-react";

interface VolumeViewerProps {
  jobId: string;
  resultShape: number[]; // Full shape including batch dims, e.g. [2, 3, 1, 64, 64, 64]
}

// Compute percentiles for auto windowing
function computePercentiles(
  data: Float32Array,
  p1: number,
  p2: number
): [number, number] {
  const sorted = Float32Array.from(data).sort((a, b) => a - b);
  const i1 = Math.floor((sorted.length - 1) * p1);
  const i2 = Math.floor((sorted.length - 1) * p2);
  return [sorted[i1], sorted[i2]];
}

export function VolumeViewer({ jobId, resultShape }: VolumeViewerProps) {
  const batchDims = resultShape.slice(0, -3);
  const [volumeShape, setVolumeShape] = useState<[number, number, number] | null>(
    null
  );
  const spatialDims = volumeShape ?? (resultShape.slice(-3) as [number, number, number]);
  const [zSize, ySize, xSize] = spatialDims;

  const [orientation, setOrientation] = useState<Orientation>("yx");
  const [batchIndices, setBatchIndices] = useState<number[]>(
    batchDims.map(() => 0)
  );
  const [sliceIndex, setSliceIndex] = useState(0); // Index along the scroll spatial axis
  const [vmin, setVmin] = useState(0);
  const [vmax, setVmax] = useState(1);

  const [volumeData, setVolumeData] = useState<Float32Array | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [slice, setSlice] = useState<
    { data: Float32Array; width: number; height: number } | null
  >(null);

  const pendingUpdate = useRef(false);

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

  // Get displayed dimensions for current orientation
  const getDisplayDims = useCallback(
    (orient: Orientation): { width: number; height: number } => {
      switch (orient) {
        case "zy":
          return { width: ySize, height: zSize };
        case "zx":
          return { width: xSize, height: zSize };
        case "yx":
          return { width: xSize, height: ySize };
      }
      return { width: xSize, height: ySize };
    },
    [xSize, ySize, zSize]
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setSlice(null);
    setVolumeData(null);
    setVolumeShape(null);
    fetchVolume(jobId, batchIndices)
      .then(({ data, metadata }) => {
        if (cancelled) return;
        if (metadata.shape.length === 3) {
          setVolumeShape([
            metadata.shape[0],
            metadata.shape[1],
            metadata.shape[2],
          ]);
        }
        setVolumeData(data);
        // Auto-compute vmin/vmax from percentiles
        const [p1, p99] = computePercentiles(data, 0.01, 0.99);
        setVmin(p1);
        setVmax(p99);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [jobId, batchIndices]);

  useEffect(() => {
    setSliceIndex(0);
  }, [orientation]);

  const extractSlice = useCallback(
    (
      volume: Float32Array,
      orient: Orientation,
      idx: number
    ): { data: Float32Array; width: number; height: number } => {
      const dims = getDisplayDims(orient);
      const { width, height } = dims;
      const slice = new Float32Array(width * height);

      // Volume is stored in C-order: z, y, x
      // stride_x = 1, stride_y = xSize, stride_z = xSize * ySize
      const strideX = 1;
      const strideY = xSize;
      const strideZ = xSize * ySize;

      for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
          let offset = 0;
          switch (orient) {
            case "yx":
              // Display y (row) vs x (col), scroll z
              offset = idx * strideZ + row * strideY + col * strideX;
              break;
            case "zx":
              // Display z (row) vs x (col), scroll y
              offset = row * strideZ + idx * strideY + col * strideX;
              break;
            case "zy":
              // Display z (row) vs y (col), scroll x
              offset = row * strideZ + col * strideY + idx * strideX;
              break;
          }
          slice[row * width + col] = volume[offset];
        }
      }

      return { data: slice, width, height };
    },
    [xSize, ySize, getDisplayDims]
  );

  useEffect(() => {
    if (!volumeData) return;
    const expectedLength = zSize * ySize * xSize;
    if (volumeData.length !== expectedLength) {
      setError("Volume shape mismatch");
      if (isLoading) {
        setIsLoading(false);
      }
      return;
    }

    const scrollInfo = getScrollAxis(orientation);
    const clampedIndex = Math.max(
      0,
      Math.min(sliceIndex, scrollInfo.max - 1)
    );

    if (clampedIndex !== sliceIndex) {
      setSliceIndex(clampedIndex);
      return;
    }

    const nextSlice = extractSlice(volumeData, orientation, clampedIndex);
    setSlice(nextSlice);
    if (isLoading) {
      setIsLoading(false);
    }
  }, [volumeData, orientation, sliceIndex, extractSlice, getScrollAxis, isLoading]);

  const handleOdometerScroll = useCallback(
    (delta: number) => {
      if (pendingUpdate.current) return;
      pendingUpdate.current = true;

      requestAnimationFrame(() => {
        pendingUpdate.current = false;

        const scrollInfo = getScrollAxis(orientation);

        // All scroll axes: batch dims + the spatial scroll axis
        // Order: batch dims first, then spatial scroll axis (rightmost = fastest)
        const scrollMaxes = [...batchDims, scrollInfo.max];
        const scrollValues = [...batchIndices, sliceIndex];

        // Odometer increment/decrement
        let carry = delta > 0 ? 1 : -1;
        const newValues = [...scrollValues];

        // Start from rightmost (fastest changing)
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

        // Update state
        const newBatchIndices = newValues.slice(0, batchDims.length);
        const newSliceIndex = newValues[newValues.length - 1];

        // Only update batch indices if they changed (triggers fetch)
        const batchChanged = newBatchIndices.some(
          (v, i) => v !== batchIndices[i]
        );
        if (batchChanged) {
          setBatchIndices(newBatchIndices);
        }
        setSliceIndex(newSliceIndex);
      });
    },
    [orientation, batchDims, batchIndices, sliceIndex, getScrollAxis]
  );

  // Handle single axis scroll (no carry)
  const handleAxisScroll = useCallback(
    (axisIndex: number, delta: number) => {
      if (pendingUpdate.current) return;
      pendingUpdate.current = true;

      requestAnimationFrame(() => {
        pendingUpdate.current = false;

        const scrollInfo = getScrollAxis(orientation);
        const scrollMaxes = [...batchDims, scrollInfo.max];

        if (axisIndex < batchDims.length) {
          // Batch axis
          const newBatchIndices = [...batchIndices];
          newBatchIndices[axisIndex] = Math.max(
            0,
            Math.min(
              newBatchIndices[axisIndex] + (delta > 0 ? 1 : -1),
              scrollMaxes[axisIndex] - 1
            )
          );
          setBatchIndices(newBatchIndices);
        } else {
          // Spatial scroll axis
          setSliceIndex((prev) =>
            Math.max(0, Math.min(prev + (delta > 0 ? 1 : -1), scrollInfo.max - 1))
          );
        }
      });
    },
    [orientation, batchDims, batchIndices, getScrollAxis]
  );

  // Handle direct value change
  const handleAxisValueChange = useCallback(
    (axisIndex: number, value: number) => {
      const scrollInfo = getScrollAxis(orientation);
      const scrollMaxes = [...batchDims, scrollInfo.max];

      const clampedValue = Math.max(0, Math.min(value, scrollMaxes[axisIndex] - 1));

      if (axisIndex < batchDims.length) {
        const newBatchIndices = [...batchIndices];
        newBatchIndices[axisIndex] = clampedValue;
        setBatchIndices(newBatchIndices);
      } else {
        setSliceIndex(clampedValue);
      }
    },
    [orientation, batchDims, batchIndices, getScrollAxis]
  );

  // Handle window/level changes with rAF batching
  const handleVminChange = useCallback((value: number) => {
    setVmin(value);
  }, []);

  const handleVmaxChange = useCallback((value: number) => {
    setVmax(value);
  }, []);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-muted-foreground)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--color-destructive)]">
        {error}
      </div>
    );
  }

  const scrollInfo = getScrollAxis(orientation);

  return (
    <div className="h-full relative">
      <div className="absolute inset-4 bottom-20">
        {slice && (
          <ReglCanvas
            sliceData={slice.data}
            width={slice.width}
            height={slice.height}
            vmin={vmin}
            vmax={vmax}
            onWheel={handleOdometerScroll}
          />
        )}
      </div>

      <ViewerControls
        orientation={orientation}
        onOrientationChange={setOrientation}
        batchDims={batchDims}
        batchIndices={batchIndices}
        spatialScrollAxis={scrollInfo.axis}
        spatialScrollMax={scrollInfo.max}
        spatialScrollIndex={sliceIndex}
        vmin={vmin}
        vmax={vmax}
        onVminChange={handleVminChange}
        onVmaxChange={handleVmaxChange}
        onAxisScroll={handleAxisScroll}
        onAxisValueChange={handleAxisValueChange}
      />
    </div>
  );
}

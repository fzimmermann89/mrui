import { useCallback, useEffect, useRef, useState } from "react";
import type { Orientation } from "@/types";
import type { ColormapName } from "./colormaps";
import { getColormapLut, getColormapNames } from "./colormaps";

interface ViewerControlsProps {
  orientation: Orientation;
  onOrientationChange: (orientation: Orientation) => void;
  batchDims: number[];
  batchIndices: number[];
  spatialScrollAxis: "z" | "y" | "x";
  spatialScrollMax: number;
  spatialScrollIndex: number;
  vmin: number;
  vmax: number;
  colormap: ColormapName;
  onColormapChange: (colormap: ColormapName) => void;
  onVminChange: (value: number) => void;
  onVmaxChange: (value: number) => void;
  onAxisScroll: (axisIndex: number, delta: number) => void;
  onAxisValueChange: (axisIndex: number, value: number) => void;
}

function ColormapPicker({
  value,
  onChange,
}: {
  value: ColormapName;
  onChange: (value: ColormapName) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (event.target instanceof Node && !root.contains(event.target)) {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="rounded-md p-1 hover:bg-white/10 transition-all duration-150 group"
        onClick={() => setOpen((previous) => !previous)}
        aria-label="Open colormap picker"
      >
        <Colorbar colormap={value} size="md" />
      </button>
      {open ? (
        <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 min-w-[140px] rounded-lg glass-panel p-2 flex flex-col gap-1.5 z-20 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="text-[9px] uppercase tracking-widest text-[var(--color-muted-foreground)] px-1 mb-0.5">
            Colormap
          </div>
          {getColormapNames().map((name) => (
            <button
              key={name}
              type="button"
              className={`w-full rounded-md p-1.5 transition-all duration-100 ${
                name === value
                  ? "bg-[var(--color-accent)]/20 ring-1 ring-[var(--color-accent)]"
                  : "hover:bg-white/8"
              }`}
              onClick={() => {
                onChange(name);
                setOpen(false);
              }}
              aria-label={`Use ${name} colormap`}
            >
              <Colorbar colormap={name} size="lg" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AxisChip({
  label,
  value,
  max,
  onWheel,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onWheel: (delta: number) => void;
  onChange: (value: number) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      const delta = event.deltaY > 0 ? 1 : -1;
      const next = Math.max(0, Math.min(value + delta, max - 1));
      if (isEditing) setEditValue(String(next));
      onWheel(delta);
    },
    [isEditing, max, onWheel, value]
  );

  useEffect(() => {
    if (isEditing) setEditValue(String(value));
  }, [value, isEditing]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  if (max <= 1) return null;

  return (
    <div
      ref={containerRef}
      className="control-chip flex items-center gap-1.5 px-2 py-1 rounded-md cursor-default select-none"
    >
      <span className="text-[10px] uppercase tracking-wider text-[var(--color-accent)] font-semibold">
        {label}
      </span>
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(event) => setEditValue(event.target.value)}
          onBlur={() => {
            setIsEditing(false);
            const parsed = parseInt(editValue, 10);
            if (!Number.isNaN(parsed)) {
              onChange(Math.max(0, Math.min(parsed, max - 1)));
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              setIsEditing(false);
              const parsed = parseInt(editValue, 10);
              if (!Number.isNaN(parsed)) {
                onChange(Math.max(0, Math.min(parsed, max - 1)));
              }
            }
            if (event.key === "Escape") {
              setIsEditing(false);
            }
          }}
          className="w-8 bg-transparent border-none outline-none text-xs font-mono text-center tabular-nums text-[var(--color-foreground)]"
          autoFocus
        />
      ) : (
        <span
          onClick={() => {
            setEditValue(String(value));
            setIsEditing(true);
            setTimeout(() => inputRef.current?.select(), 0);
          }}
          className="text-xs font-mono tabular-nums min-w-[1.5rem] text-center cursor-text text-[var(--color-foreground)]"
        >
          {value}
        </span>
      )}
      <span className="text-[10px] text-[var(--color-muted-foreground)]">
        /{max}
      </span>
    </div>
  );
}

function Colorbar({
  colormap,
  size = "md",
}: {
  colormap: ColormapName;
  size?: "sm" | "md" | "lg";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dimensions = { sm: { w: 48, h: 8 }, md: { w: 80, h: 10 }, lg: { w: 120, h: 14 } };
  const { w, h } = dimensions[size];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    const image = ctx.createImageData(width, height);
    const lut = getColormapLut(colormap);

    for (let x = 0; x < width; x++) {
      const idx = Math.floor((x / Math.max(1, width - 1)) * 255);
      const r = lut[idx * 4 + 0] ?? 0;
      const g = lut[idx * 4 + 1] ?? 0;
      const b = lut[idx * 4 + 2] ?? 0;
      for (let y = 0; y < height; y++) {
        const p = (y * width + x) * 4;
        image.data[p + 0] = r;
        image.data[p + 1] = g;
        image.data[p + 2] = b;
        image.data[p + 3] = 255;
      }
    }

    ctx.putImageData(image, 0, 0);
  }, [colormap]);

  const sizeClasses = {
    sm: "w-12 h-2",
    md: "w-20 h-2.5",
    lg: "w-[120px] h-3.5",
  };

  return (
    <canvas
      ref={canvasRef}
      width={w}
      height={h}
      className={`${sizeClasses[size]} rounded-sm`}
      style={{ imageRendering: "pixelated" }}
    />
  );
}

function WindowingControls({
  vmin,
  vmax,
  colormap,
  onColormapChange,
  onVminChange,
  onVmaxChange,
}: {
  vmin: number;
  vmax: number;
  colormap: ColormapName;
  onColormapChange: (value: ColormapName) => void;
  onVminChange: (value: number) => void;
  onVmaxChange: (value: number) => void;
}) {
  const [vminEdit, setVminEdit] = useState("");
  const [vmaxEdit, setVmaxEdit] = useState("");
  const [editingVmin, setEditingVmin] = useState(false);
  const [editingVmax, setEditingVmax] = useState(false);

  const formatValue = useCallback((value: number) => {
    if (Math.abs(value) < 0.01 || Math.abs(value) >= 1000) return value.toExponential(1);
    return value.toFixed(2);
  }, []);

  const handleVminWheel = useCallback(
    (event: WheelEvent) => {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      const step = Math.max((vmax - vmin) * 0.02, 1e-6);
      const delta = event.deltaY > 0 ? step : -step;
      const next = vmin + delta;
      onVminChange(next);
      if (editingVmin) setVminEdit(formatValue(next));
    },
    [editingVmin, formatValue, onVminChange, vmin, vmax]
  );

  const handleVmaxWheel = useCallback(
    (event: WheelEvent) => {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      const step = Math.max((vmax - vmin) * 0.02, 1e-6);
      const delta = event.deltaY > 0 ? step : -step;
      const next = vmax + delta;
      onVmaxChange(next);
      if (editingVmax) setVmaxEdit(formatValue(next));
    },
    [editingVmax, formatValue, onVmaxChange, vmin, vmax]
  );

  const vminWheelRef = useRef<HTMLDivElement>(null);
  const vmaxWheelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = vminWheelRef.current;
    if (!element) return;
    element.addEventListener("wheel", handleVminWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleVminWheel);
  }, [handleVminWheel]);

  useEffect(() => {
    const element = vmaxWheelRef.current;
    if (!element) return;
    element.addEventListener("wheel", handleVmaxWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleVmaxWheel);
  }, [handleVmaxWheel]);

  return (
    <div className="flex items-center gap-3">
      <div ref={vminWheelRef} className="flex items-center">
        {editingVmin ? (
          <input
            className="w-14 bg-transparent border-none outline-none text-[11px] font-mono text-right tabular-nums text-[var(--color-foreground)]"
            value={vminEdit}
            onChange={(event) => setVminEdit(event.target.value)}
            onBlur={() => {
              setEditingVmin(false);
              const parsed = parseFloat(vminEdit);
              if (!Number.isNaN(parsed)) onVminChange(parsed);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                setEditingVmin(false);
                const parsed = parseFloat(vminEdit);
                if (!Number.isNaN(parsed)) onVminChange(parsed);
              }
              if (event.key === "Escape") setEditingVmin(false);
            }}
            autoFocus
          />
        ) : (
          <span
            className="text-[11px] font-mono text-[var(--color-muted-foreground)] cursor-text hover:text-[var(--color-foreground)] transition-colors tabular-nums"
            onClick={() => {
              setEditingVmin(true);
              setVminEdit(formatValue(vmin));
            }}
          >
            {formatValue(vmin)}
          </span>
        )}
      </div>

      <ColormapPicker value={colormap} onChange={onColormapChange} />

      <div ref={vmaxWheelRef} className="flex items-center">
        {editingVmax ? (
          <input
            className="w-14 bg-transparent border-none outline-none text-[11px] font-mono text-left tabular-nums text-[var(--color-foreground)]"
            value={vmaxEdit}
            onChange={(event) => setVmaxEdit(event.target.value)}
            onBlur={() => {
              setEditingVmax(false);
              const parsed = parseFloat(vmaxEdit);
              if (!Number.isNaN(parsed)) onVmaxChange(parsed);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                setEditingVmax(false);
                const parsed = parseFloat(vmaxEdit);
                if (!Number.isNaN(parsed)) onVmaxChange(parsed);
              }
              if (event.key === "Escape") setEditingVmax(false);
            }}
            autoFocus
          />
        ) : (
          <span
            className="text-[11px] font-mono text-[var(--color-muted-foreground)] cursor-text hover:text-[var(--color-foreground)] transition-colors tabular-nums"
            onClick={() => {
              setEditingVmax(true);
              setVmaxEdit(formatValue(vmax));
            }}
          >
            {formatValue(vmax)}
          </span>
        )}
      </div>
    </div>
  );
}

function OrientationButton({
  value,
  selected,
  onClick,
}: {
  value: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-1 text-[11px] font-mono uppercase tracking-wide rounded transition-all duration-100 ${
        selected
          ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)] font-semibold"
          : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-white/5"
      }`}
    >
      {value}
    </button>
  );
}

export function ViewerControls({
  orientation,
  onOrientationChange,
  batchDims,
  batchIndices,
  spatialScrollAxis,
  spatialScrollMax,
  spatialScrollIndex,
  vmin,
  vmax,
  colormap,
  onColormapChange,
  onVminChange,
  onVmaxChange,
  onAxisScroll,
  onAxisValueChange,
}: ViewerControlsProps) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2.5 rounded-xl glass-panel">
      {/* Orientation toggle group */}
      <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-white/5">
        {(["yx", "zx", "zy"] as const).map((o) => (
          <OrientationButton
            key={o}
            value={o}
            selected={orientation === o}
            onClick={() => onOrientationChange(o)}
          />
        ))}
      </div>

      <div className="w-px h-5 bg-white/10" />

      {/* Axis controls */}
      <div className="flex items-center gap-1.5">
        {batchDims.map((dimSize, idx) => (
          <AxisChip
            key={`d${idx}`}
            label={`d${idx}`}
            value={batchIndices[idx]}
            max={dimSize}
            onWheel={(delta) => onAxisScroll(idx, delta)}
            onChange={(value) => onAxisValueChange(idx, value)}
          />
        ))}

        <AxisChip
          label={spatialScrollAxis}
          value={spatialScrollIndex}
          max={spatialScrollMax}
          onWheel={(delta) => onAxisScroll(batchDims.length, delta)}
          onChange={(value) => onAxisValueChange(batchDims.length, value)}
        />
      </div>

      <div className="w-px h-5 bg-white/10" />

      {/* Windowing controls */}
      <WindowingControls
        vmin={vmin}
        vmax={vmax}
        colormap={colormap}
        onColormapChange={onColormapChange}
        onVminChange={onVminChange}
        onVmaxChange={onVmaxChange}
      />
    </div>
  );
}

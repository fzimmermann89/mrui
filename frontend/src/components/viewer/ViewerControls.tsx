import { useCallback, useEffect, useRef, useState } from "react";
import type { Orientation } from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  onVminChange: (value: number) => void;
  onVmaxChange: (value: number) => void;
  onAxisScroll: (axisIndex: number, delta: number) => void;
  onAxisValueChange: (axisIndex: number, value: number) => void;
}

// Editable number field with wheel support
function AxisValue({
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
      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();
      const delta = event.deltaY > 0 ? 1 : -1;
      const next = Math.max(0, Math.min(value + delta, max - 1));
      if (isEditing) {
        setEditValue(String(next));
      }
      onWheel(delta);
    },
    [onWheel, value, max, isEditing]
  );

  const handleClick = useCallback(() => {
    setEditValue(String(value));
    setIsEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }, [value]);

  useEffect(() => {
    if (isEditing) {
      setEditValue(String(value));
    }
  }, [value, isEditing]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [handleWheel]);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    const parsed = parseInt(editValue, 10);
    if (!isNaN(parsed)) {
      onChange(Math.max(0, Math.min(parsed, max - 1)));
    }
  }, [editValue, max, onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleBlur();
      } else if (e.key === "Escape") {
        setIsEditing(false);
      }
    },
    [handleBlur]
  );

  // Skip rendering if dimension is 1 (nothing to scroll)
  if (max <= 1) return null;

  return (
    <div
      ref={containerRef}
      className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/5 hover:bg-black/10 transition-colors cursor-default"
    >
      <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)] font-medium">
        {label}
      </span>
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-8 bg-transparent border-none outline-none text-xs font-mono text-center tabular-nums"
          autoFocus
        />
      ) : (
        <span
          onClick={handleClick}
          className="text-xs font-mono tabular-nums min-w-[1.5rem] text-center cursor-text"
        >
          {value}
        </span>
      )}
    </div>
  );
}

// Compact windowing controls with grayscale bar
function WindowingControls({
  vmin,
  vmax,
  onVminChange,
  onVmaxChange,
}: {
  vmin: number;
  vmax: number;
  onVminChange: (value: number) => void;
  onVmaxChange: (value: number) => void;
}) {
  const [editingVmin, setEditingVmin] = useState(false);
  const [editingVmax, setEditingVmax] = useState(false);
  const [vminEdit, setVminEdit] = useState("");
  const [vmaxEdit, setVmaxEdit] = useState("");
  const vminRef = useRef<HTMLDivElement>(null);
  const vmaxRef = useRef<HTMLDivElement>(null);

  const handleVminWheel = useCallback(
    (event: WheelEvent) => {
      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();
      const step = (vmax - vmin) * 0.02;
      const delta = event.deltaY > 0 ? step : -step;
      const next = vmin + delta;
      onVminChange(next);
      if (editingVmin) {
        setVminEdit(formatValue(next));
      }
    },
    [vmin, vmax, onVminChange, editingVmin]
  );

  const handleVmaxWheel = useCallback(
    (event: WheelEvent) => {
      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();
      const step = (vmax - vmin) * 0.02;
      const delta = event.deltaY > 0 ? step : -step;
      const next = vmax + delta;
      onVmaxChange(next);
      if (editingVmax) {
        setVmaxEdit(formatValue(next));
      }
    },
    [vmin, vmax, onVmaxChange, editingVmax]
  );

  const formatValue = (v: number) => {
    if (Math.abs(v) < 0.01 || Math.abs(v) >= 1000) {
      return v.toExponential(1);
    }
    return v.toFixed(2);
  };

  useEffect(() => {
    if (editingVmin) {
      setVminEdit(formatValue(vmin));
    }
  }, [vmin, editingVmin]);

  useEffect(() => {
    if (editingVmax) {
      setVmaxEdit(formatValue(vmax));
    }
  }, [vmax, editingVmax]);

  useEffect(() => {
    const element = vminRef.current;
    if (!element) return;
    element.addEventListener("wheel", handleVminWheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", handleVminWheel);
    };
  }, [handleVminWheel]);

  useEffect(() => {
    const element = vmaxRef.current;
    if (!element) return;
    element.addEventListener("wheel", handleVmaxWheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", handleVmaxWheel);
    };
  }, [handleVmaxWheel]);

  return (
    <div className="flex items-center gap-1.5">
      {/* Vmin */}
      <div
        ref={vminRef}
        className="flex items-center gap-0.5 cursor-default"
      >
        {editingVmin ? (
          <input
            type="text"
            value={vminEdit}
            onChange={(e) => setVminEdit(e.target.value)}
            onBlur={() => {
              setEditingVmin(false);
              const parsed = parseFloat(vminEdit);
              if (!isNaN(parsed)) onVminChange(parsed);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setEditingVmin(false);
                const parsed = parseFloat(vminEdit);
                if (!isNaN(parsed)) onVminChange(parsed);
              } else if (e.key === "Escape") {
                setEditingVmin(false);
              }
            }}
            className="w-12 bg-transparent border-none outline-none text-[10px] font-mono text-right tabular-nums"
            autoFocus
          />
        ) : (
          <span
            onClick={() => {
              setVminEdit(formatValue(vmin));
              setEditingVmin(true);
            }}
            className="text-[10px] font-mono tabular-nums cursor-text text-[var(--color-muted-foreground)]"
          >
            {formatValue(vmin)}
          </span>
        )}
      </div>

      {/* Grayscale bar */}
      <div
        className="w-16 h-3 rounded-sm overflow-hidden"
        style={{
          background: "linear-gradient(to right, #000 0%, #fff 100%)",
        }}
      />

      {/* Vmax */}
      <div
        ref={vmaxRef}
        className="flex items-center gap-0.5 cursor-default"
      >
        {editingVmax ? (
          <input
            type="text"
            value={vmaxEdit}
            onChange={(e) => setVmaxEdit(e.target.value)}
            onBlur={() => {
              setEditingVmax(false);
              const parsed = parseFloat(vmaxEdit);
              if (!isNaN(parsed)) onVmaxChange(parsed);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setEditingVmax(false);
                const parsed = parseFloat(vmaxEdit);
                if (!isNaN(parsed)) onVmaxChange(parsed);
              } else if (e.key === "Escape") {
                setEditingVmax(false);
              }
            }}
            className="w-12 bg-transparent border-none outline-none text-[10px] font-mono text-left tabular-nums"
            autoFocus
          />
        ) : (
          <span
            onClick={() => {
              setVmaxEdit(formatValue(vmax));
              setEditingVmax(true);
            }}
            className="text-[10px] font-mono tabular-nums cursor-text text-[var(--color-muted-foreground)]"
          >
            {formatValue(vmax)}
          </span>
        )}
      </div>
    </div>
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
  onVminChange,
  onVmaxChange,
  onAxisScroll,
  onAxisValueChange,
}: ViewerControlsProps) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-viewer-overlay)] border border-[var(--color-viewer-border)] backdrop-blur-sm shadow-sm">
      {/* Orientation selector */}
      <Select value={orientation} onValueChange={(v) => onOrientationChange(v as Orientation)}>
        <SelectTrigger className="h-7 w-14 text-xs px-2 border-0 bg-black/5 hover:bg-black/10">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="yx" className="text-xs">yx</SelectItem>
          <SelectItem value="zx" className="text-xs">zx</SelectItem>
          <SelectItem value="zy" className="text-xs">zy</SelectItem>
        </SelectContent>
      </Select>

      {/* Separator */}
      <div className="w-px h-4 bg-[var(--color-border)]" />

      {/* Batch dimension controls */}
      {batchDims.map((dimSize, idx) => (
        <AxisValue
          key={`d${idx}`}
          label={`d${idx}`}
          value={batchIndices[idx]}
          max={dimSize}
          onWheel={(delta) => onAxisScroll(idx, delta)}
          onChange={(value) => onAxisValueChange(idx, value)}
        />
      ))}

      {/* Spatial scroll axis */}
      <AxisValue
        label={spatialScrollAxis}
        value={spatialScrollIndex}
        max={spatialScrollMax}
        onWheel={(delta) => onAxisScroll(batchDims.length, delta)}
        onChange={(value) => onAxisValueChange(batchDims.length, value)}
      />

      {/* Separator */}
      <div className="w-px h-4 bg-[var(--color-border)]" />

      {/* Windowing controls */}
      <WindowingControls
        vmin={vmin}
        vmax={vmax}
        onVminChange={onVminChange}
        onVmaxChange={onVmaxChange}
      />
    </div>
  );
}

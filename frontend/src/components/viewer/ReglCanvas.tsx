import { useEffect, useRef, useState } from "react";
import createREGL from "regl";
import type { ColormapName } from "./colormaps";
import { getColormapLut } from "./colormaps";
import { getFittedRect, screenToUv } from "./transform";

interface ReglCanvasProps {
  sliceData: Float32Array | Uint16Array;
  width: number;
  height: number;
  sliceDtype: "float32" | "uint16";
  sliceIndex: number;
  vmin: number;
  vmax: number;
  colormap: ColormapName;
  onWheelSlice: (delta: number) => void;
}

interface DrawProps {
  sliceTexture: ReturnType<ReturnType<typeof createREGL>["texture"]>;
  colormapTexture: ReturnType<ReturnType<typeof createREGL>["texture"]>;
  vmin: number;
  vmax: number;
  aspectRatio: number;
  containerAspect: number;
}

export function ReglCanvas({
  sliceData,
  width,
  height,
  sliceDtype,
  sliceIndex,
  vmin,
  vmax,
  colormap,
  onWheelSlice,
}: ReglCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reglRef = useRef<ReturnType<typeof createREGL> | null>(null);
  const drawRef = useRef<((props: DrawProps) => void) | null>(null);
  const sliceTextureRef = useRef<ReturnType<
    ReturnType<typeof createREGL>["texture"]
  > | null>(null);
  const colormapTextureRef = useRef<ReturnType<
    ReturnType<typeof createREGL>["texture"]
  > | null>(null);
  const sliceTextureSpecRef = useRef<{
    width: number;
    height: number;
    sliceDtype: "float32" | "uint16";
    regl: ReturnType<typeof createREGL>;
  } | null>(null);
  const canvasSizeRef = useRef({ width: 0, height: 0 });
  const [canvasVersion, setCanvasVersion] = useState(0);
  const [reglVersion, setReglVersion] = useState(0);

  const tooltipRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<{ x: number; y: number; visible: boolean }>({
    x: 0,
    y: 0,
    visible: false,
  });
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const regl = createREGL({
      canvas,
      attributes: {
        antialias: false,
        preserveDrawingBuffer: false,
      },
      optionalExtensions: ["OES_texture_float"],
    });

    reglRef.current = regl;
    setReglVersion((v) => v + 1);
    colormapTextureRef.current = regl.texture({
      width: 256,
      height: 1,
      data: getColormapLut(colormap),
      format: "rgba",
      type: "uint8",
      min: "linear",
      mag: "linear",
      wrap: "clamp",
    });

    drawRef.current = regl({
      vert: `
        precision highp float;
        attribute vec2 position;
        varying vec2 uv;
        uniform float aspectRatio;
        uniform float containerAspect;

        void main() {
          uv = position * 0.5 + 0.5;
          uv.y = 1.0 - uv.y;

          vec2 fitScale = vec2(1.0);
          if (aspectRatio > containerAspect) {
            fitScale.y = containerAspect / aspectRatio;
          } else {
            fitScale.x = aspectRatio / containerAspect;
          }

          gl_Position = vec4(position * fitScale, 0.0, 1.0);
        }
      `,
      frag: `
        precision highp float;
        uniform sampler2D sliceTexture;
        uniform sampler2D colormapTexture;
        uniform float vmin;
        uniform float vmax;
        varying vec2 uv;

        void main() {
          float value = texture2D(sliceTexture, uv).r;
          if ((value != value) || abs(value) > 1.0e20) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
            return;
          }

          float range = max(vmax - vmin, 0.0001);
          float normalized = clamp((value - vmin) / range, 0.0, 1.0);
          gl_FragColor = texture2D(colormapTexture, vec2(normalized, 0.5));
        }
      `,
      attributes: {
        position: [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ],
      },
      uniforms: {
        sliceTexture: regl.prop<DrawProps, "sliceTexture">("sliceTexture"),
        colormapTexture: regl.prop<DrawProps, "colormapTexture">("colormapTexture"),
        vmin: regl.prop<DrawProps, "vmin">("vmin"),
        vmax: regl.prop<DrawProps, "vmax">("vmax"),
        aspectRatio: regl.prop<DrawProps, "aspectRatio">("aspectRatio"),
        containerAspect: regl.prop<DrawProps, "containerAspect">("containerAspect"),
      },
      primitive: "triangle strip",
      count: 4,
    });

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
      // regl.destroy() cleans up all textures and resources automatically
      // Do NOT manually destroy textures before this - causes double destroy
      regl.destroy();
      sliceTextureRef.current = null;
      colormapTextureRef.current = null;
      sliceTextureSpecRef.current = null;
      drawRef.current = null;
      reglRef.current = null;
    };
  }, []);

  useEffect(() => {
    const colormapTexture = colormapTextureRef.current;
    if (!colormapTexture) return;
    colormapTexture({
      width: 256,
      height: 1,
      data: getColormapLut(colormap),
      format: "rgba",
      type: "uint8",
      min: "linear",
      mag: "linear",
      wrap: "clamp",
    });
  }, [colormap]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width: cw, height: ch } = entry.contentRect;
      const dpr = window.devicePixelRatio || 1;
      const nextWidth = Math.max(1, Math.floor(cw * dpr));
      const nextHeight = Math.max(1, Math.floor(ch * dpr));

      if (
        canvasSizeRef.current.width !== nextWidth ||
        canvasSizeRef.current.height !== nextHeight
      ) {
        canvasSizeRef.current = { width: nextWidth, height: nextHeight };
        canvas.width = nextWidth;
        canvas.height = nextHeight;
        canvas.style.width = `${cw}px`;
        canvas.style.height = `${ch}px`;
        setCanvasVersion((value) => value + 1);
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const regl = reglRef.current;
    const draw = drawRef.current;
    const colormapTexture = colormapTextureRef.current;
    const canvas = canvasRef.current;

    if (!regl || !draw || !colormapTexture || !canvas) return;
    if (width <= 0 || height <= 0) return;
    if (sliceData.length !== width * height) return;
    const maxSize = regl.limits.maxTextureSize;
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    if (width > maxSize || height > maxSize) return;

    const previousSpec = sliceTextureSpecRef.current;
    const nextSpec = { width, height, sliceDtype, regl };

    // Check if texture needs recreation (context changed or dimensions changed)
    const contextChanged = !previousSpec || previousSpec.regl !== regl;
    if (contextChanged) {
      sliceTextureRef.current = null;
    }
    const needsAllocate =
      contextChanged ||
      previousSpec.width !== width ||
      previousSpec.height !== height ||
      previousSpec.sliceDtype !== sliceDtype;

    if (!sliceTextureRef.current || contextChanged) {
      sliceTextureRef.current = regl.texture({
        width,
        height,
        data: sliceData,
        format: "luminance",
        type: "float",
        min: "nearest",
        mag: "nearest",
        wrap: "clamp",
      });
      sliceTextureSpecRef.current = nextSpec;
    } else if (needsAllocate) {
      sliceTextureRef.current({
        width,
        height,
        data: sliceData,
        format: "luminance",
        type: "float",
        min: "nearest",
        mag: "nearest",
        wrap: "clamp",
      });
      sliceTextureSpecRef.current = nextSpec;
    } else {
      sliceTextureRef.current({
        width,
        height,
        data: sliceData,
        format: "luminance",
        type: "float",
        min: "nearest",
        mag: "nearest",
        wrap: "clamp",
      });
    }

    const containerAspect = canvas.width / canvas.height || 1;
    const aspectRatio = width / height;

    regl.poll();
    regl.clear({ color: [0, 0, 0, 0] });
    if (!sliceTextureRef.current) return;

    draw({
      sliceTexture: sliceTextureRef.current,
      colormapTexture,
      vmin,
      vmax,
      aspectRatio,
      containerAspect,
    });
  }, [
    sliceData,
    width,
    height,
    sliceDtype,
    vmin,
    vmax,
    colormap,
    canvasVersion,
    reglVersion,
  ]);

  const scheduleOverlayUpdate = () => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const container = containerRef.current;
      if (!container) return;

      const pointer = pointerRef.current;
      if (!pointer.visible) {
        if (tooltipRef.current) tooltipRef.current.style.opacity = "0";
        return;
      }

      const rect = container.getBoundingClientRect();
      const fitted = getFittedRect(rect.width, rect.height, width, height);
      const { inBounds, u, v } = screenToUv(pointer.x, pointer.y, fitted);

      if (tooltipRef.current) tooltipRef.current.style.opacity = "1";

      if (!inBounds) {
        if (tooltipRef.current) {
          tooltipRef.current.textContent = "No Data";
          tooltipRef.current.style.transform = `translate(${pointer.x + 12}px, ${pointer.y + 12}px)`;
        }
        return;
      }

      const sampleU = u;
      const sampleV = 1 - v;
      const ix = Math.floor(sampleU * width);
      const iy = Math.floor(sampleV * height);
      const valid = ix >= 0 && iy >= 0 && ix < width && iy < height;

      if (!tooltipRef.current) return;
      tooltipRef.current.style.transform = `translate(${pointer.x + 12}px, ${pointer.y + 12}px)`;

      if (!valid) {
        tooltipRef.current.textContent = "No Data";
        return;
      }

      const value = sliceData[iy * width + ix];
      tooltipRef.current.textContent = `x:${ix} y:${iy} z:${sliceIndex} v:${Number(value).toPrecision(5)}`;
    });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    pointerRef.current = { x, y, visible: true };

    scheduleOverlayUpdate();
  };

  const handlePointerLeave = () => {
    pointerRef.current.visible = false;
    scheduleOverlayUpdate();
  };

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    onWheelSlice(event.deltaY > 0 ? 1 : -1);
  };

  return (
    <div
      ref={containerRef}
      className="h-full w-full relative overflow-hidden cursor-default"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full block"
        style={{ touchAction: "none" }}
        onWheel={handleWheel}
      />
      <div
        ref={tooltipRef}
        className="viewer-tooltip absolute top-0 left-0 text-[11px] px-2 py-1 rounded pointer-events-none opacity-0 whitespace-nowrap z-10 font-mono tracking-tight"
      />
    </div>
  );
}

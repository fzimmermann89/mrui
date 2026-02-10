import { useCallback, useEffect, useRef } from "react";
import createREGL from "regl";
import type { ColormapName } from "./colormaps";
import { getColormapLut } from "./colormaps";
import { getFittedRect, screenToUv } from "./transform";
import { overrideContextType } from "../../utils/regl-webgl2-compat";

interface ReglCanvasProps {
  sliceData: Float32Array;
  width: number;
  height: number;
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
    regl: ReturnType<typeof createREGL>;
  } | null>(null);
  const canvasSizeRef = useRef({ width: 0, height: 0 });
  const vminRef = useRef(vmin);
  const vmaxRef = useRef(vmax);

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

    const regl = overrideContextType(canvas, () =>
      createREGL({
        canvas,
        attributes: {
          antialias: false,
          preserveDrawingBuffer: false,
        },
        extensions: ["OES_texture_float"],
        optionalExtensions: ["oes_vertex_array_object", "angle_instanced_arrays"],
      }),
    );

    reglRef.current = regl;

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
      regl.destroy();
      sliceTextureRef.current = null;
      colormapTextureRef.current = null;
      sliceTextureSpecRef.current = null;
      drawRef.current = null;
      reglRef.current = null;
    };
  }, []);

  useEffect(() => {
    const regl = reglRef.current;
    if (!regl) return;
    const texture = colormapTextureRef.current;
    const nextData = {
      width: 256,
      height: 1,
      data: getColormapLut(colormap),
      format: "rgba",
      type: "uint8",
      min: "linear",
      mag: "linear",
      wrap: "clamp",
    } as const;
    if (texture) {
      texture(nextData);
    } else {
      colormapTextureRef.current = regl.texture(nextData);
    }
  }, [colormap]);

  useEffect(() => {
    vminRef.current = vmin;
    vmaxRef.current = vmax;
  }, [vmin, vmax]);

  const drawScene = useCallback(() => {
    const regl = reglRef.current;
    const draw = drawRef.current;
    const colormapTexture = colormapTextureRef.current;
    const sliceTexture = sliceTextureRef.current;
    const canvas = canvasRef.current;

    if (!regl || !draw || !colormapTexture || !sliceTexture || !canvas) return;
    if (width <= 0 || height <= 0) return;

    const containerAspect = canvas.width / canvas.height || 1;
    const aspectRatio = width / height;

    regl.poll();
    regl.clear({ color: [0, 0, 0, 0] });

    draw({
      sliceTexture,
      colormapTexture,
      vmin: vminRef.current,
      vmax: vmaxRef.current,
      aspectRatio,
      containerAspect,
    });
  }, [width, height]);

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
        drawScene();
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [drawScene]);

  useEffect(() => {
    const regl = reglRef.current;
    if (!regl) return;
    if (width <= 0 || height <= 0) return;
    if (sliceData.length !== width * height) return;
    const maxSize = regl.limits.maxTextureSize;
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    if (width > maxSize || height > maxSize) return;

    const previousSpec = sliceTextureSpecRef.current;
    const nextSpec = { width, height, regl };

    const contextChanged = !previousSpec || previousSpec.regl !== regl;
    if (contextChanged) {
      sliceTextureRef.current = null;
    }

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
    sliceTextureSpecRef.current = nextSpec;
    drawScene();
  }, [sliceData, width, height, drawScene]);

  useEffect(() => {
    drawScene();
  }, [vmin, vmax, colormap, width, height, drawScene]);

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      onWheelSlice(event.deltaY > 0 ? 1 : -1);
    };
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [onWheelSlice]);

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
      />
      <div
        ref={tooltipRef}
        className="viewer-tooltip absolute top-0 left-0 text-[11px] px-2 py-1 rounded pointer-events-none opacity-0 whitespace-nowrap z-10 font-mono tracking-tight"
      />
    </div>
  );
}

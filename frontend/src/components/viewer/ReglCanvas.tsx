import { useEffect, useRef, useCallback, useState } from "react";
import createREGL from "regl";

interface ReglCanvasProps {
  sliceData: Float32Array;
  width: number;
  height: number;
  vmin: number;
  vmax: number;
  onWheel: (delta: number) => void;
}

// Grayscale colormap as a 256-entry lookup (just linear black to white)
function createGrayscaleColormap(): Uint8Array {
  const data = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    data[i * 4 + 0] = i; // R
    data[i * 4 + 1] = i; // G
    data[i * 4 + 2] = i; // B
    data[i * 4 + 3] = 255; // A
  }
  return data;
}

export function ReglCanvas({
  sliceData,
  width,
  height,
  vmin,
  vmax,
  onWheel,
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
  const canvasSizeRef = useRef({ width: 0, height: 0 });
  const [canvasVersion, setCanvasVersion] = useState(0);

  interface DrawProps {
    sliceTexture: ReturnType<ReturnType<typeof createREGL>["texture"]>;
    colormapTexture: ReturnType<ReturnType<typeof createREGL>["texture"]>;
    vmin: number;
    vmax: number;
    aspectRatio: number;
    containerAspect: number;
  }

  // Initialize regl
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const regl = createREGL({
      canvas,
      attributes: {
        antialias: false,
        preserveDrawingBuffer: false,
      },
      extensions: ["OES_texture_float"],
    });

    reglRef.current = regl;

    // Create colormap texture
    colormapTextureRef.current = regl.texture({
      width: 256,
      height: 1,
      data: createGrayscaleColormap(),
      format: "rgba",
      type: "uint8",
      min: "linear",
      mag: "linear",
      wrap: "clamp",
    });

    // Create draw command
    drawRef.current = regl({
      vert: `
        precision highp float;
        attribute vec2 position;
        varying vec2 uv;
        uniform float aspectRatio;
        uniform float containerAspect;
        
        void main() {
          uv = position * 0.5 + 0.5;
          uv.y = 1.0 - uv.y; // Flip Y for correct orientation
          
          // Fit to container while preserving aspect ratio
          vec2 scale = vec2(1.0);
          if (aspectRatio > containerAspect) {
            // Image is wider than container
            scale.y = containerAspect / aspectRatio;
          } else {
            // Image is taller than container
            scale.x = aspectRatio / containerAspect;
          }
          
          gl_Position = vec4(position * scale, 0.0, 1.0);
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
        colormapTexture: regl.prop<DrawProps, "colormapTexture">(
          "colormapTexture"
        ),
        vmin: regl.prop<DrawProps, "vmin">("vmin"),
        vmax: regl.prop<DrawProps, "vmax">("vmax"),
        aspectRatio: regl.prop<DrawProps, "aspectRatio">("aspectRatio"),
        containerAspect: regl.prop<DrawProps, "containerAspect">(
          "containerAspect"
        ),
      },
      primitive: "triangle strip",
      count: 4,
    });

    return () => {
      if (sliceTextureRef.current) {
        sliceTextureRef.current.destroy();
        sliceTextureRef.current = null;
      }
      if (colormapTextureRef.current) {
        colormapTextureRef.current.destroy();
        colormapTextureRef.current = null;
      }
      drawRef.current = null;
      reglRef.current = null;
      regl.destroy();
    };
  }, []);

  // Handle canvas resize
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

  // Update slice texture and render
  useEffect(() => {
    const regl = reglRef.current;
    const draw = drawRef.current;
    const colormapTexture = colormapTextureRef.current;
    const canvas = canvasRef.current;

    if (!regl || !draw || !colormapTexture || !canvas) return;
    if (width === 0 || height === 0) return;
    if (sliceData.length !== width * height) return;
    if (!Number.isInteger(width) || !Number.isInteger(height)) return;
    if (canvas.width === 0 || canvas.height === 0) return;

    if (sliceTextureRef.current) {
      sliceTextureRef.current.destroy();
      sliceTextureRef.current = null;
    }
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

    // Render
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
  }, [sliceData, width, height, vmin, vmax, canvasVersion]);

  // Handle wheel events
  const handleWheel = useCallback(
    (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaY > 0 ? 1 : -1;
      onWheel(delta);
    },
    [onWheel]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [handleWheel]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <canvas
        ref={canvasRef}
        className="h-full w-full block"
        style={{ touchAction: "none" }}
      />
    </div>
  );
}

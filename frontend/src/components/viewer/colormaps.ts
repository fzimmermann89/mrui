export type ColormapName = "gray" | "viridis" | "magma" | "inferno";

const VIRIDIS_STOPS: [number, number, number][] = [
  [68, 1, 84],
  [59, 82, 139],
  [33, 145, 140],
  [94, 201, 98],
  [253, 231, 37],
];

const MAGMA_STOPS: [number, number, number][] = [
  [0, 0, 4],
  [59, 15, 112],
  [140, 41, 129],
  [221, 73, 104],
  [252, 253, 191],
];

const INFERNO_STOPS: [number, number, number][] = [
  [0, 0, 4],
  [87, 15, 109],
  [187, 55, 84],
  [249, 142, 8],
  [252, 255, 164],
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function buildLutFromStops(stops: [number, number, number][]): Uint8Array {
  const lut = new Uint8Array(256 * 4);
  const segmentCount = stops.length - 1;
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    const scaled = t * segmentCount;
    const idx = Math.min(segmentCount - 1, Math.floor(scaled));
    const localT = scaled - idx;
    const a = stops[idx];
    const b = stops[idx + 1];
    lut[i * 4 + 0] = Math.round(lerp(a[0], b[0], localT));
    lut[i * 4 + 1] = Math.round(lerp(a[1], b[1], localT));
    lut[i * 4 + 2] = Math.round(lerp(a[2], b[2], localT));
    lut[i * 4 + 3] = 255;
  }
  return lut;
}

function buildGrayLut(): Uint8Array {
  const lut = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    lut[i * 4 + 0] = i;
    lut[i * 4 + 1] = i;
    lut[i * 4 + 2] = i;
    lut[i * 4 + 3] = 255;
  }
  return lut;
}

const LUTS: Record<ColormapName, Uint8Array> = {
  gray: buildGrayLut(),
  viridis: buildLutFromStops(VIRIDIS_STOPS),
  magma: buildLutFromStops(MAGMA_STOPS),
  inferno: buildLutFromStops(INFERNO_STOPS),
};

export function getColormapLut(name: ColormapName): Uint8Array {
  return LUTS[name];
}

export function getColormapNames(): ColormapName[] {
  return ["gray", "viridis", "magma", "inferno"];
}

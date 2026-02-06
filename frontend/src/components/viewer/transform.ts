export interface ViewTransform {
  scale: number;
  translate: { x: number; y: number };
}

export interface FittedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImagePoint {
  x: number;
  y: number;
}

export function getFittedRect(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number
): FittedRect {
  const containerAspect = containerWidth / containerHeight;
  const imageAspect = imageWidth / imageHeight;

  if (imageAspect > containerAspect) {
    const width = containerWidth;
    const height = containerWidth / imageAspect;
    return { x: 0, y: (containerHeight - height) * 0.5, width, height };
  }

  const height = containerHeight;
  const width = containerHeight * imageAspect;
  return { x: (containerWidth - width) * 0.5, y: 0, width, height };
}

export function screenToUv(
  x: number,
  y: number,
  rect: FittedRect
): { inBounds: boolean; u: number; v: number } {
  const relX = x - rect.x;
  const relY = y - rect.y;
  const inBounds = relX >= 0 && relY >= 0 && relX <= rect.width && relY <= rect.height;
  return {
    inBounds,
    u: rect.width > 0 ? relX / rect.width : 0,
    v: rect.height > 0 ? relY / rect.height : 0,
  };
}

export function uvToImage(
  u: number,
  v: number,
  imageWidth: number,
  imageHeight: number,
  transform: ViewTransform
): ImagePoint {
  const tx = transform.translate.x / imageWidth;
  const ty = transform.translate.y / imageHeight;
  const sampleU = (u - 0.5) / transform.scale + 0.5 - tx;
  const sampleV = (v - 0.5) / transform.scale + 0.5 - ty;
  return { x: sampleU * imageWidth, y: sampleV * imageHeight };
}

export function panByScreenDelta(
  transform: ViewTransform,
  dxScreen: number,
  dyScreen: number,
  imageWidth: number,
  imageHeight: number,
  rect: FittedRect
): ViewTransform {
  if (rect.width <= 0 || rect.height <= 0) return transform;
  const du = dxScreen / rect.width;
  const dv = dyScreen / rect.height;
  const nextTranslate = {
    x: transform.translate.x + (du * imageWidth) / transform.scale,
    y: transform.translate.y + (dv * imageHeight) / transform.scale,
  };
  return { ...transform, translate: nextTranslate };
}

export function zoomAtUv(
  transform: ViewTransform,
  zoomFactor: number,
  u: number,
  v: number,
  imageWidth: number,
  imageHeight: number,
  minScale = 0.25,
  maxScale = 20
): ViewTransform {
  const currentScale = transform.scale;
  const targetScale = clamp(currentScale * zoomFactor, minScale, maxScale);
  if (targetScale === currentScale) return transform;

  const tx = transform.translate.x / imageWidth;
  const ty = transform.translate.y / imageHeight;
  const sampleU = (u - 0.5) / currentScale + 0.5 - tx;
  const sampleV = (v - 0.5) / currentScale + 0.5 - ty;

  const nextTx = (u - 0.5) / targetScale + 0.5 - sampleU;
  const nextTy = (v - 0.5) / targetScale + 0.5 - sampleV;

  return {
    scale: targetScale,
    translate: {
      x: nextTx * imageWidth,
      y: nextTy * imageHeight,
    },
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

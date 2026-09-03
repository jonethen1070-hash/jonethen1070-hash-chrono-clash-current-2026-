function mobilePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod|Android|Mobile|Tablet/i.test(ua);
}

export function canTakePhoto(): boolean {
  if (typeof navigator === "undefined") return false;
  if (mobilePlatform()) return true;
  return Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

export const AVATAR_PHOTO_KEY = "chrono-clash-avatar-photo-v1";
export const AVATAR_PHOTO_SIZE = 384;
export const AVATAR_PHOTO_MAX_CHARS = 360_000;

export interface CropState {
  scale: number;
  x: number;
  y: number;
}

export interface AvatarPhotoRecord {
  dataUrl: string;
  updatedAt: number;
}

function store(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function isAvatarPhotoDataUrl(value: string): boolean {
  return /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(value) && value.length <= AVATAR_PHOTO_MAX_CHARS;
}

export function loadAvatarPhoto(): string | null {
  try {
    const raw = store()?.getItem(AVATAR_PHOTO_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AvatarPhotoRecord>;
    const dataUrl = String(parsed.dataUrl || "");
    return isAvatarPhotoDataUrl(dataUrl) ? dataUrl : null;
  } catch {
    return null;
  }
}

export function hasAvatarPhoto(): boolean {
  return loadAvatarPhoto() != null;
}

export function saveAvatarPhoto(dataUrl: string): boolean {
  if (!isAvatarPhotoDataUrl(dataUrl)) return false;
  try {
    store()?.setItem(AVATAR_PHOTO_KEY, JSON.stringify({ dataUrl, updatedAt: Date.now() } satisfies AvatarPhotoRecord));
    return true;
  } catch {
    return false;
  }
}

export function clearAvatarPhoto(): void {
  try {
    store()?.removeItem(AVATAR_PHOTO_KEY);
  } catch {
    /* ignore */
  }
}

export function coverScale(imgW: number, imgH: number, crop: number): number {
  const w = Math.max(1, imgW);
  const h = Math.max(1, imgH);
  const size = Math.max(1, crop);
  return Math.max(size / w, size / h);
}

export function clampCrop(state: CropState, imgW: number, imgH: number, crop: number): CropState {
  const min = coverScale(imgW, imgH, crop);
  const scale = Math.max(min, Math.min(min * 4, Number(state.scale) || min));
  const maxX = Math.max(0, (imgW * scale - crop) / 2);
  const maxY = Math.max(0, (imgH * scale - crop) / 2);
  const x = Math.max(-maxX, Math.min(maxX, Number(state.x) || 0));
  const y = Math.max(-maxY, Math.min(maxY, Number(state.y) || 0));
  return { scale, x, y };
}

export function panToImagePoint(
  imgW: number,
  imgH: number,
  crop: number,
  scale: number,
  imgX: number,
  imgY: number,
): CropState {
  return clampCrop(
    {
      scale,
      x: -((imgX - imgW / 2) * scale),
      y: -((imgY - imgH / 2) * scale),
    },
    imgW,
    imgH,
    crop,
  );
}

export async function detectSubjectCenter(
  image: CanvasImageSource,
  imgW: number,
  imgH: number,
): Promise<{ x: number; y: number } | null> {
  const Detector = (globalThis as { FaceDetector?: new () => { detect: (src: CanvasImageSource) => Promise<{ boundingBox: DOMRectReadOnly }[]> } }).FaceDetector;
  if (!Detector) return { x: imgW / 2, y: imgH / 2 };
  try {
    const faces = await new Detector().detect(image);
    const box = faces[0]?.boundingBox;
    if (!box) return { x: imgW / 2, y: imgH / 2 };
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  } catch {
    return { x: imgW / 2, y: imgH / 2 };
  }
}

export async function bitmapFromFile(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    } catch {
      return createImageBitmap(file);
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadHtmlImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.drawImage(img, 0, 0);
    return canvas as unknown as ImageBitmap;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("photo"));
    img.src = src;
  });
}

export function exportCroppedJpeg(
  image: CanvasImageSource,
  imgW: number,
  imgH: number,
  crop: CropState,
  size = AVATAR_PHOTO_SIZE,
): string {
  const state = clampCrop(crop, imgW, imgH, size);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#081018";
  ctx.fillRect(0, 0, size, size);
  const dw = imgW * state.scale;
  const dh = imgH * state.scale;
  const dx = size / 2 + state.x - dw / 2;
  const dy = size / 2 + state.y - dh / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, dx, dy, dw, dh);
  const jpeg = canvas.toDataURL("image/jpeg", 0.86);
  if (jpeg.length <= AVATAR_PHOTO_MAX_CHARS) return jpeg;
  return canvas.toDataURL("image/jpeg", 0.7);
}

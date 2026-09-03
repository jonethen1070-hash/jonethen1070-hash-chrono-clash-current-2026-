import {
  bitmapFromFile,
  canTakePhoto,
  clampCrop,
  coverScale,
  CropState,
  detectSubjectCenter,
  exportCroppedJpeg,
  hasAvatarPhoto,
} from "../engine/avatarPhoto";

export interface AvatarPhotoFlowHooks {
  onSave(dataUrl: string): void;
  onRemove(): void;
  onCancel?: () => void;
}

type Stage = "hidden" | "source" | "crop";

export function mountAvatarPhotoFlow(host: HTMLElement, hooks: AvatarPhotoFlowHooks): {
  openAdd(): void;
  openManage(): void;
  destroy(): void;
} {
  const root = document.createElement("div");
  root.className = "photo-flow";
  root.innerHTML = `
    <div class="sheet photo-sheet hidden" id="photoSourceSheet" role="dialog" aria-modal="true" aria-labelledby="photoSourceTitle">
      <div class="sheet-card photo-sheet-card">
        <header><h2 id="photoSourceTitle">ADD PHOTO</h2><button type="button" class="ghost" data-photo-close="1">CLOSE</button></header>
        <p class="photo-sheet-note" data-photo-note></p>
        <div class="stack photo-sheet-actions">
          <button type="button" class="primary" data-photo-camera="1">TAKE PHOTO</button>
          <button type="button" class="ghost" data-photo-library="1">CHOOSE FROM PHOTOS</button>
          <button type="button" class="ghost" data-photo-remove="1">REMOVE PHOTO</button>
        </div>
      </div>
    </div>
    <div class="sheet photo-sheet hidden" id="photoCropSheet" role="dialog" aria-modal="true" aria-labelledby="photoCropTitle">
      <div class="sheet-card photo-crop-card">
        <header><h2 id="photoCropTitle">CROP PHOTO</h2></header>
        <div class="photo-crop-stage">
          <div class="photo-crop-frame" data-photo-frame>
            <canvas class="photo-crop-canvas" data-photo-canvas width="384" height="384"></canvas>
          </div>
          <p class="photo-crop-hint">Pinch to zoom. Drag to reposition.</p>
        </div>
        <div class="stack">
          <button type="button" class="primary" data-photo-use="1">USE PHOTO</button>
          <button type="button" class="ghost" data-photo-cancel-crop="1">CANCEL</button>
        </div>
      </div>
    </div>
    <input id="photoFileCamera" class="photo-file" type="file" accept="image/*" capture="user" hidden />
    <input id="photoFileLibrary" class="photo-file" type="file" accept="image/*" hidden />
  `;
  host.appendChild(root);

  const sourceSheet = root.querySelector("#photoSourceSheet") as HTMLElement;
  const cropSheet = root.querySelector("#photoCropSheet") as HTMLElement;
  const cameraBtn = root.querySelector("[data-photo-camera]") as HTMLButtonElement;
  const removeBtn = root.querySelector("[data-photo-remove]") as HTMLButtonElement;
  const note = root.querySelector("[data-photo-note]") as HTMLElement;
  const cameraInput = root.querySelector("#photoFileCamera") as HTMLInputElement;
  const libraryInput = root.querySelector("#photoFileLibrary") as HTMLInputElement;
  const canvas = root.querySelector("[data-photo-canvas]") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d");

  let stage: Stage = "hidden";
  let image: ImageBitmap | null = null;
  let crop: CropState = { scale: 1, x: 0, y: 0 };
  let pointers = new Map<number, { x: number; y: number }>();
  let lastPinch = 0;
  let dragging = false;
  let dragStart = { x: 0, y: 0, cropX: 0, cropY: 0 };
  let awaitingFile = false;

  function setStage(next: Stage): void {
    stage = next;
    sourceSheet.classList.toggle("hidden", next !== "source");
    cropSheet.classList.toggle("hidden", next !== "crop");
  }

  function paintSource(manage: boolean): void {
    const has = hasAvatarPhoto();
    (root.querySelector("#photoSourceTitle") as HTMLElement).textContent = manage ? "CUSTOM PHOTO" : "ADD PHOTO";
    cameraBtn.hidden = !canTakePhoto();
    removeBtn.hidden = !has;
    note.textContent = manage
      ? "Change the photo, or remove it to return to your last mark."
      : "Photos stay on this device. They are not uploaded.";
  }

  function openAdd(): void {
    paintSource(false);
    setStage("source");
  }

  function openManage(): void {
    paintSource(true);
    setStage("source");
  }

  function close(): void {
    setStage("hidden");
    awaitingFile = false;
    image = null;
    pointers.clear();
    hooks.onCancel?.();
  }

  function draw(): void {
    if (!ctx || !image) return;
    const size = canvas.width;
    crop = clampCrop(crop, image.width, image.height, size);
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#081018";
    ctx.fillRect(0, 0, size, size);
    const dw = image.width * crop.scale;
    const dh = image.height * crop.scale;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, size / 2 + crop.x - dw / 2, size / 2 + crop.y - dh / 2, dw, dh);
  }

  async function beginCrop(file: File): Promise<void> {
    if (!file.type.startsWith("image/")) {
      note.textContent = "Choose a photo to use as your avatar.";
      setStage("source");
      return;
    }
    image = await bitmapFromFile(file);
    const size = canvas.width;
    const min = coverScale(image.width, image.height, size);
    const center = await detectSubjectCenter(image, image.width, image.height);
    crop = clampCrop(
      {
        scale: min,
        x: -(((center?.x ?? image.width / 2) - image.width / 2) * min),
        y: -(((center?.y ?? image.height / 2) - image.height / 2) * min),
      },
      image.width,
      image.height,
      size,
    );
    setStage("crop");
    draw();
  }

  function onFiles(list: FileList | null): void {
    awaitingFile = false;
    const file = list?.[0];
    cameraInput.value = "";
    libraryInput.value = "";
    if (!file) {
      note.textContent = "Camera or photo access was unavailable. You can still choose from photos.";
      setStage("source");
      return;
    }
    void beginCrop(file).catch(() => {
      note.textContent = "That photo could not be opened. Try another.";
      setStage("source");
    });
  }

  cameraInput.addEventListener("change", () => onFiles(cameraInput.files));
  libraryInput.addEventListener("change", () => onFiles(libraryInput.files));

  function pick(input: HTMLInputElement): void {
    awaitingFile = true;
    input.click();
    window.setTimeout(() => {
      if (awaitingFile && stage === "source") {
        awaitingFile = false;
      }
    }, 800);
  }

  sourceSheet.addEventListener("click", (e) => {
    const el = (e.target as HTMLElement).closest("button");
    if (!el) return;
    if (el.hasAttribute("data-photo-close")) close();
    else if (el.hasAttribute("data-photo-camera")) pick(cameraInput);
    else if (el.hasAttribute("data-photo-library")) pick(libraryInput);
    else if (el.hasAttribute("data-photo-remove")) {
      hooks.onRemove();
      close();
    }
  });

  cropSheet.addEventListener("click", (e) => {
    const el = (e.target as HTMLElement).closest("button");
    if (!el) return;
    if (el.hasAttribute("data-photo-cancel-crop")) {
      image = null;
      openAdd();
      return;
    }
    if (el.hasAttribute("data-photo-use") && image) {
      const dataUrl = exportCroppedJpeg(image, image.width, image.height, crop);
      if (!dataUrl) {
        note.textContent = "Could not save that photo. Try another.";
        setStage("source");
        return;
      }
      hooks.onSave(dataUrl);
      close();
    }
  });

  const frame = root.querySelector("[data-photo-frame]") as HTMLElement;

  frame.addEventListener("pointerdown", (e) => {
    frame.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      dragging = true;
      dragStart = { x: e.clientX, y: e.clientY, cropX: crop.x, cropY: crop.y };
    } else {
      dragging = false;
      const pts = [...pointers.values()];
      const a = pts[0];
      const b = pts[1];
      lastPinch = a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    }
  });

  frame.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId) || !image) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const rect = frame.getBoundingClientRect();
    const unit = canvas.width / Math.max(1, rect.width);
    if (pointers.size >= 2) {
      const pts = [...pointers.values()];
      const a = pts[0];
      const b = pts[1];
      if (!a || !b) return;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (lastPinch > 0) {
        crop = clampCrop({ ...crop, scale: crop.scale * (dist / lastPinch) }, image.width, image.height, canvas.width);
        draw();
      }
      lastPinch = dist;
      return;
    }
    if (!dragging) return;
    crop = clampCrop(
      {
        ...crop,
        x: dragStart.cropX + (e.clientX - dragStart.x) * unit,
        y: dragStart.cropY + (e.clientY - dragStart.y) * unit,
      },
      image.width,
      image.height,
      canvas.width,
    );
    draw();
  });

  const endPointer = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) lastPinch = 0;
    if (pointers.size === 0) dragging = false;
  };
  frame.addEventListener("pointerup", endPointer);
  frame.addEventListener("pointercancel", endPointer);

  frame.addEventListener(
    "wheel",
    (e) => {
      if (!image) return;
      e.preventDefault();
      const next = crop.scale * (e.deltaY < 0 ? 1.08 : 0.92);
      crop = clampCrop({ ...crop, scale: next }, image.width, image.height, canvas.width);
      draw();
    },
    { passive: false },
  );

  return {
    openAdd,
    openManage,
    destroy() {
      root.remove();
    },
  };
}

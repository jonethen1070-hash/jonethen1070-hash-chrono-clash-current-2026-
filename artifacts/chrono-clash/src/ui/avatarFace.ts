import { avatarGlyph } from "../engine/catalog";
import { hasAvatarPhoto, loadAvatarPhoto } from "../engine/avatarPhoto";
import { LocalProgress } from "../engine/types";

export function isCustomAvatarEquipped(p: LocalProgress): boolean {
  return Boolean(p.customAvatar) && hasAvatarPhoto();
}

export function avatarFaceInner(p: LocalProgress): string {
  if (isCustomAvatarEquipped(p)) {
    const src = loadAvatarPhoto();
    if (src) return `<img alt="" src="${src}">`;
  }
  return avatarGlyph(p.avatar);
}

export function avatarFaceClass(p: LocalProgress, extra = ""): string {
  const custom = isCustomAvatarEquipped(p);
  return ["avatar", p.frame, custom ? "custom-photo" : `a${p.avatar}`, extra]
    .filter(Boolean)
    .join(" ");
}

export function avatarFaceHtml(p: LocalProgress, extra = ""): string {
  return `<div class="${avatarFaceClass(p, extra)}">${avatarFaceInner(p)}</div>`;
}

export function paintAvatarElement(el: HTMLElement, p: LocalProgress, extra = ""): void {
  el.className = avatarFaceClass(p, extra);
  if (isCustomAvatarEquipped(p)) {
    const src = loadAvatarPhoto();
    if (src) {
      let img = el.querySelector("img");
      if (!img) {
        el.textContent = "";
        img = document.createElement("img");
        img.alt = "";
        el.appendChild(img);
      }
      if (img.getAttribute("src") !== src) img.src = src;
      return;
    }
  }
  el.querySelector("img")?.remove();
  el.textContent = avatarGlyph(p.avatar);
}

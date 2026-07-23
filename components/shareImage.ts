"use client";

// Shared helpers for the screenshot buttons (ShareCardButton, ChartShotButton).
// Two explicit actions, not an auto-fallback: Copy (clipboard) and Download/Save.

export function prefersNativeShare(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  const touch = window.matchMedia?.("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
  // Web Share API w/ files is how iOS/Android expose "Save Image" to Photos —
  // the <a download> attribute is unreliable on mobile Safari (it just opens
  // the image instead of saving it).
  return touch && typeof navigator.share === "function" && typeof navigator.canShare === "function";
}

export async function copyImageToClipboard(blob: Blob): Promise<boolean> {
  try {
    if (typeof window === "undefined" || !("ClipboardItem" in window) || !navigator.clipboard) return false;
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    return true;
  } catch {
    return false;
  }
}

export async function saveImage(blob: Blob, filename: string): Promise<"shared" | "downloaded" | "cancelled"> {
  if (prefersNativeShare()) {
    try {
      const file = new File([blob], filename, { type: blob.type });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return "shared";
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return "cancelled"; // user closed the share sheet
      // otherwise fall through to a direct download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded";
}

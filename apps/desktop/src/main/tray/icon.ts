import { nativeImage } from 'electron'

// Tray icon source (UF1, ui-design §Component 系统托盘): the dsh-forge tray
// mark as a 16x16 8-bit RGBA PNG, embedded as a data URL so the tray needs
// no external asset plumbing through the vite cjs main bundle. (RGBA, not
// grayscale: Electron's decoder rejected an equivalent grayscale variant
// during task 4.2 verification.)
//
// Monochrome on purpose: Windows/macOS tray themes vary, and a near-neutral
// gray mark reads acceptably on both light and dark trays. The image is NOT
// marked as an AppKit template (macOS `setTemplateImage`) because the mark
// has internal contrast; that stays a packaging-time option if the designer
// supplies a true 1-bit variant.

export const TRAY_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAANElEQVR4nGO4fv36f0owwzA2wM3NDY5JNoBYzVgNQNZMjEG0MQCbQRQFIlkGDHw6GEEGAAAsYFZNTjPIzAAAAABJRU5ErkJggg=='

/** Decode the embedded tray mark into a native image (main process only). */
export function loadTrayIcon(): Electron.NativeImage {
  const image = nativeImage.createFromDataURL(TRAY_ICON_DATA_URL)
  if (image.isEmpty()) {
    // Should be unreachable (embedded bytes), but a hard failure here is
    // better than an empty tray icon on some platforms.
    throw new Error('embedded tray icon decoded to an empty image')
  }
  return image
}

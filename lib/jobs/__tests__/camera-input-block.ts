/**
 * Returns the `<input ref={takePhotoRef} ... />` element source from a photo evidence panel.
 *
 * Browsers ignore `capture` when `multiple` is also set on the same input, so the camera
 * button silently degrades into a second library picker. Tests use this to assert the
 * camera input keeps `capture` and stays free of `multiple`.
 */
export function cameraInputBlock(source: string): string {
  const match = source.match(/<input\s+ref=\{takePhotoRef\}[\s\S]*?\/>/);
  if (!match) {
    throw new Error("No <input ref={takePhotoRef} ... /> found in source");
  }
  return match[0];
}

/** Resize an image File to max 1600px on the long edge, JPEG 0.82. Returns a Blob. */
export async function resizeImage(file, { max = 1600, quality = 0.82 } = {}) {
  if (file.size > 10 * 1024 * 1024) throw new Error("tooBig");
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error("unsupported");
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", quality));
}

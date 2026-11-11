// Turns picked / dropped / pasted image files into small base64 payloads for the server.
const MAX_SIDE = 1600;
const OK = /^image\/(png|jpeg|webp|gif)$/;

const toB64 = (blob) => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(String(fr.result).split(",")[1] || "");
  fr.onerror = () => rej(fr.error);
  fr.readAsDataURL(blob);
});

/** @returns {Promise<{mime:string,data:string,name:string,url:string}>} */
export async function readImage(file) {
  if (!OK.test(file.type)) throw new Error(`"${file.name}" is not a PNG, JPG, WebP or GIF image.`);
  const url = URL.createObjectURL(file);
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { bitmap = null; }
  const small = bitmap && Math.max(bitmap.width, bitmap.height) <= MAX_SIDE;
  // Small PNG/JPEG/WebP files go as they are. Big or animated ones are scaled and re-encoded as JPEG.
  if ((small && file.type !== "image/gif" && file.size < 3_500_000) || !bitmap) {
    if (file.size > 3_500_000) throw new Error(`"${file.name}" is too large to read.`);
    return { mime: file.type, data: await toB64(file), name: file.name || "image", url };
  }
  const k = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bitmap.width * k); c.height = Math.round(bitmap.height * k);
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bitmap, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.88));
  return { mime: "image/jpeg", data: await toB64(blob), name: (file.name || "image").replace(/\.\w+$/, "") + ".jpg", url };
}

/** Image files from a drop or paste event. */
export const imagesFrom = (dt) => [...(dt?.files || [])].filter((f) => f.type.startsWith("image/"));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function loadImage(url) { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = url; }); }

// Development preview only. It preserves source geometry pixel-for-pixel;
// production rendering belongs behind the same generic adapter interface.
export const localPreviewAdapter = { async createRender(request, onProgress = () => {}) {
  for (const value of [18, 34, 57, 76]) { await wait(280); onProgress(value); }
  const source = await loadImage(request.sourceImages[0].dataUrl);
  const ratios = { "1:1": 1, "4:3": 4 / 3, "16:9": 16 / 9 }, ratio = ratios[request.frame] || source.naturalWidth / source.naturalHeight;
  let width = source.naturalWidth, height = source.naturalHeight;
  if (width / height > ratio) width = Math.round(height * ratio); else height = Math.round(width / ratio);
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; const ctx = canvas.getContext("2d");
  const scale = Math.max(width / source.naturalWidth, height / source.naturalHeight), sw = width / scale, sh = height / scale, sx = (source.naturalWidth - sw) / 2, sy = (source.naturalHeight - sh) / 2;
  ctx.filter = "saturate(0.82) contrast(1.07) brightness(1.06) sepia(0.08)"; ctx.drawImage(source, sx, sy, sw, sh, 0, 0, width, height); ctx.filter = "none";
  const wash = ctx.createLinearGradient(0, 0, 0, height); wash.addColorStop(0, "rgba(224,190,142,.10)"); wash.addColorStop(1, "rgba(76,61,42,.12)"); ctx.fillStyle = wash; ctx.fillRect(0, 0, width, height); onProgress(100);
  return { id: crypto.randomUUID(), status: "complete", dataUrl: canvas.toDataURL("image/jpeg", request.quality === "high" ? .96 : .9) };
} };

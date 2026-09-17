import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

const CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const ff = new FFmpeg();
    const [coreURL, wasmURL] = await Promise.all([
      toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
      toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
    ]);
    await ff.load({ coreURL, wasmURL });
    ffmpegInstance = ff;
    return ff;
  })();
  try {
    return await loadPromise;
  } catch (e) {
    loadPromise = null;
    throw e;
  }
}

export async function transcodeWebmToMp4(blob: Blob): Promise<Blob> {
  const ff = await getFFmpeg();
  const inputName = "input.webm";
  const outputName = "output.mp4";
  await ff.writeFile(inputName, await fetchFile(blob));
  try {
    await ff.exec(["-i", inputName, "-vn", "-c:a", "aac", "-b:a", "128k", outputName]);
    const data = await ff.readFile(outputName);
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
    const arr = new Uint8Array(bytes as Uint8Array);
    const ab = arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer;
    return new Blob([ab], { type: "audio/mp4" });
  } finally {
    try { await ff.deleteFile(inputName); } catch { /* noop */ }
    try { await ff.deleteFile(outputName); } catch { /* noop */ }
  }
}

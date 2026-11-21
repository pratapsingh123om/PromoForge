export const MAX_UPLOAD_FILES = 100;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_BATCH_BYTES = 50 * 1024 * 1024;

export function decodeUtf8Buffer(buffer: ArrayBuffer | Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new Error("File is not valid UTF-8. Convert it to UTF-8 and upload again.");
  }
  if (text.includes("\u0000") || text.includes("\uFFFD")) {
    throw new Error("File is not valid UTF-8. Convert it to UTF-8 and upload again.");
  }
  return text;
}

export async function readUtf8ScreenplayFile(file: File): Promise<string> {
  if (file.size === 0) throw new Error("File is empty (0 bytes).");
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`File exceeds the 5 MB per-file limit (${(file.size / 1024 / 1024).toFixed(1)} MB).`);
  }
  return decodeUtf8Buffer(await file.arrayBuffer());
}


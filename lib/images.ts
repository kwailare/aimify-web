import { MAX_IMAGE_BYTES } from "@/lib/image-limits";

const TYPES = {
  png: { contentType: "image/png", extension: "png" },
  jpeg: { contentType: "image/jpeg", extension: "jpg" },
  webp: { contentType: "image/webp", extension: "webp" },
} as const;

export type ImageKind = keyof typeof TYPES;

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((value, index) => bytes[offset + index] === value);
}

export function sniffImageKind(bytes: Uint8Array): ImageKind | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "png";
  }

  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "jpeg";
  }

  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "webp";
  }

  return null;
}

export type ValidImage = {
  ok: true;
  buffer: Buffer;
  contentType: string;
  extension: string;
};

export async function readImageFile(
  value: FormDataEntryValue | null,
): Promise<ValidImage | { ok: false; error: string }> {
  if (!value || typeof value === "string") {
    return { ok: false, error: "Choose an image file to upload." };
  }

  if (value.size === 0) {
    return { ok: false, error: "That file is empty." };
  }

  if (value.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "The image must be 2 MB or smaller." };
  }

  const buffer = Buffer.from(await value.arrayBuffer());
  const kind = sniffImageKind(buffer);

  if (!kind) {
    return { ok: false, error: "Use a PNG, JPEG or WebP image." };
  }

  return { ok: true, buffer, ...TYPES[kind] };
}

import { del, put } from "@vercel/blob";
import type { ValidImage } from "@/lib/images";

const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

export function isBlobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function uploadImage(pathPrefix: string, image: ValidImage) {
  const blob = await put(`${pathPrefix}.${image.extension}`, image.buffer, {
    access: "public",
    addRandomSuffix: true,
    contentType: image.contentType,
  });

  return blob.url;
}

export async function deleteOwnedBlob(
  url: string | null | undefined,
  requiredPathPrefix: string,
) {
  if (!url) return;

  try {
    const parsed = new URL(url);

    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname.endsWith(BLOB_HOST_SUFFIX) ||
      !parsed.pathname.startsWith(`/${requiredPathPrefix}`)
    ) {
      return;
    }

    await del(url);
  } catch (error) {
    console.error("Could not delete blob:", error);
  }
}

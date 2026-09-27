import { readFile, stat } from "fs/promises";
import { basename } from "path";
import { put } from "@vercel/blob";
import { config } from "dotenv";

config({ path: ".env.local" });

const filePath = process.argv[2];

if (!filePath) {
  console.error("Usage: node scripts/upload-desktop-installer.mjs <path-to-installer>");
  console.error("Example: node scripts/upload-desktop-installer.mjs C:/builds/AimifySetup-1.5.0.exe");
  process.exit(1);
}

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("BLOB_READ_WRITE_TOKEN is not set. Add it to .env.local (Vercel dashboard > Storage > Blob).");
  process.exit(1);
}

const info = await stat(filePath).catch(() => null);

if (!info || !info.isFile()) {
  console.error(`Could not find a file at ${filePath}`);
  process.exit(1);
}

const MAX_BYTES = 500 * 1024 * 1024;

if (info.size > MAX_BYTES) {
  console.error(
    `That file is ${(info.size / 1024 / 1024).toFixed(0)} MB, over the ${MAX_BYTES / 1024 / 1024} MB limit for a single Blob upload from this script.`,
  );
  process.exit(1);
}

const name = basename(filePath);
const contentType = name.endsWith(".msi")
  ? "application/x-msi"
  : "application/vnd.microsoft.portable-executable";

console.log(`Uploading ${name} (${(info.size / 1024 / 1024).toFixed(1)} MB)...`);

const buffer = await readFile(filePath);

const blob = await put(`desktop/${name}`, buffer, {
  access: "public",
  addRandomSuffix: false,
  allowOverwrite: true,
  contentType,
});

console.log("\nUploaded. Public URL:");
console.log(blob.url);
console.log(
  "\nSet NEXT_PUBLIC_DOWNLOAD_URL_WINDOWS to this URL in .env.local and in Vercel (all environments), and set NEXT_PUBLIC_DESKTOP_VERSION to the version number.",
);

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";

function keyFor(purpose: string) {
  if (!process.env.AUTH_SECRET) {
    throw new Error("AUTH_SECRET is not set.");
  }

  return createHash("sha256")
    .update(`${process.env.AUTH_SECRET}:${purpose}`)
    .digest();
}

export function sealSecret(purpose: string, value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(purpose), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);

  return [iv, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString("base64"))
    .join(".");
}

export function openSecret(purpose: string, stored: string) {
  const [iv, tag, encrypted] = stored
    .split(".")
    .map((part) => Buffer.from(part, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", keyFor(purpose), iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8",
  );
}

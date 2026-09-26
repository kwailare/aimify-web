import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;

export function base32Encode(bytes: Buffer) {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32[(value << (5 - bits)) & 31];
  }

  return output;
}

export function base32Decode(input: string) {
  const clean = input.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of clean) {
    const index = BASE32.indexOf(char);

    if (index === -1) {
      throw new Error("Invalid base32 character.");
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export function generateTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function currentStep(now = Date.now()) {
  return Math.floor(now / 1000 / STEP_SECONDS);
}

export function hotp(secret: Buffer, counter: number) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac("sha1", secret).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const binary =
    ((hmac[offset] & 127) << 24) |
    ((hmac[offset + 1] & 255) << 16) |
    ((hmac[offset + 2] & 255) << 8) |
    (hmac[offset + 3] & 255);

  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

export function totpAt(secretBase32: string, step: number) {
  return hotp(base32Decode(secretBase32), step);
}

export function verifyTotp(
  secretBase32: string,
  code: string,
  options: { now?: number; window?: number; notBeforeStep?: number | null } = {},
) {
  const clean = code.replace(/\s/g, "");

  if (!/^\d{6}$/.test(clean)) return null;

  const secret = base32Decode(secretBase32);
  const step = currentStep(options.now);
  const window = options.window ?? 1;
  const candidate = Buffer.from(clean);

  for (let offset = -window; offset <= window; offset++) {
    const candidateStep = step + offset;

    if (
      options.notBeforeStep !== undefined &&
      options.notBeforeStep !== null &&
      candidateStep <= options.notBeforeStep
    ) {
      continue;
    }

    const expected = Buffer.from(hotp(secret, candidateStep));

    if (timingSafeEqual(candidate, expected)) {
      return candidateStep;
    }
  }

  return null;
}

export function otpauthUri(secretBase32: string, account: string, issuer = "Aimify") {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;

  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

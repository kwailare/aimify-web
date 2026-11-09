/**
 * A phone number as WhatsApp wants it: digits only, with the country code.
 * Nigerian numbers written locally (0803 123 4567) get 234; numbers with a
 * + or 00 keep their own code. Null when it can't be a phone number.
 */
export function toWhatsAppNumber(phone: string | null | undefined, defaultCountryCode = "234") {
  if (!phone) return null;
  const trimmed = phone.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) {
    // Already international.
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0")) {
    digits = defaultCountryCode + digits.slice(1);
  } else if (!digits.startsWith(defaultCountryCode) && digits.length <= 10) {
    digits = defaultCountryCode + digits;
  }
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

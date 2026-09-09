// Plain-text contract shared by the yard editor and its server-side SITE bridge.
export const DEFAULT_YARD_SIGN = "나의 아지트";
export const MAX_YARD_SIGN_LENGTH = 24;

export function parseYardSign(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 192 ||
      /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value)) return null;
  const text = value.normalize("NFC").trim();
  return text.length > 0 && Array.from(text).length <= MAX_YARD_SIGN_LENGTH ? text : null;
}

export function parseYardSignInput(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== 1 || !Object.prototype.hasOwnProperty.call(input, "signText")) return null;
  return parseYardSign(input.signText);
}

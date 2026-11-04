export function isValidWalletAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

export function isValidWalletNonce(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{32}$/.test(value);
}

export function isValidWalletSignature(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{130}$/.test(value);
}

export function isValidSessionToken(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

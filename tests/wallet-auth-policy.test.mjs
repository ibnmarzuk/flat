import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidWalletAddress,
  isValidWalletNonce,
  isValidWalletSignature,
  isValidSessionToken
} from "../lib/wallet-auth-policy.js";

test("accepts valid wallet addresses and rejects malformed values", () => {
  assert.equal(isValidWalletAddress("0x1111111111111111111111111111111111111111"), true);
  assert.equal(isValidWalletAddress("0x1111"), false);
  assert.equal(isValidWalletAddress(null), false);
  assert.equal(isValidWalletAddress(123), false);
});

test("accepts only 32 character lowercase hexadecimal nonces", () => {
  assert.equal(isValidWalletNonce("0123456789abcdef0123456789abcdef"), true);
  assert.equal(isValidWalletNonce("0123456789ABCDEF0123456789ABCDEF"), false);
  assert.equal(isValidWalletNonce("short"), false);
});

test("accepts only 65 byte hexadecimal signatures", () => {
  assert.equal(isValidWalletSignature("0x" + "a".repeat(130)), true);
  assert.equal(isValidWalletSignature("0x" + "a".repeat(128)), false);
  assert.equal(isValidWalletSignature("not-a-signature"), false);
});

test("accepts only 32 byte lowercase hexadecimal session tokens", () => {
  assert.equal(isValidSessionToken("a".repeat(64)), true);
  assert.equal(isValidSessionToken("A".repeat(64)), false);
  assert.equal(isValidSessionToken("a".repeat(63)), false);
});

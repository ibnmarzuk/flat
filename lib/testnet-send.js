import { TRADE_TOKEN, TRADE_TRANSFER_TOPIC } from "./testnet-trade.js";

export const SEND_QUEST_SLUG = "send-testnet-token";
export const SEND_METHOD = "verified_testnet_token_transfer";
export const TRANSFER_SELECTOR = "0xa9059cbb";
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const addressWord = (address) => address.toLowerCase().slice(2).padStart(64, "0");
const topic = (address) => "0x" + addressWord(address);

/** @param {string} recipient @param {bigint} amount */
export function buildTokenTransferData(recipient, amount) {
  const destination = recipient.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(destination) || [ZERO_ADDRESS, TRADE_TOKEN].includes(destination) || amount <= 0n) {
    throw new Error("Invalid test token transfer.");
  }
  return TRANSFER_SELECTOR + addressWord(destination) + amount.toString(16).padStart(64, "0");
}

/** Verify a direct Test LOX transfer from the authenticated wallet to another wallet.
 * @param {{from:string,to:string|null,logs:readonly {address:string,topics:readonly string[],data:string,removed?:boolean}[]}} receipt
 * @param {{from:string,to:string|null,input:string,value:bigint}} transaction
 */
export function findTestnetSend(receipt, transaction) {
  const owner = receipt.from.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(owner) || receipt.to?.toLowerCase() !== TRADE_TOKEN ||
      transaction.to?.toLowerCase() !== TRADE_TOKEN || transaction.from.toLowerCase() !== owner || transaction.value !== 0n) return null;
  const input = transaction.input.toLowerCase();
  if (!/^0xa9059cbb[0-9a-f]{128}$/.test(input)) return null;
  const recipient = "0x" + input.slice(34, 74);
  const amount = BigInt("0x" + input.slice(74));
  if (recipient === owner || buildTokenTransferData(recipient, amount) !== input) return null;
  const matches = receipt.logs.filter((log) => !log.removed && log.address.toLowerCase() === TRADE_TOKEN &&
    log.topics.length === 3 && log.topics[0].toLowerCase() === TRADE_TRANSFER_TOPIC &&
    log.topics[1].toLowerCase() === topic(owner) && log.topics[2].toLowerCase() === topic(recipient) &&
    /^0x[0-9a-f]{64}$/i.test(log.data) && BigInt(log.data) === amount);
  if (matches.length !== 1) return null;
  return { recipient, amount: amount.toString() };
}

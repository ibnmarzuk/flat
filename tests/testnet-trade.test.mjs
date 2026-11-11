import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTradeData, findTestnetTrade, TRADE_ROUTER as router, TRADE_TOKEN as token, TRADE_WETH as weth,
  TRADE_PAIR as pair, TRADE_SWAP_TOPIC as swapTopic, TRADE_TRANSFER_TOPIC as transferTopic } from '../lib/testnet-trade.js';
const wallet='0x1234567890123456789012345678901234567890',other='0x2234567890123456789012345678901234567890';
const word=n=>BigInt(n).toString(16).padStart(64,'0');
const topic=a=>'0x'+a.slice(2).padStart(64,'0');
const eth=1000000000000n,lox=9950159382191909n;
const transfer=(address,from,to,value)=>({address,topics:[transferTopic,topic(from),topic(to)],data:'0x'+word(value)});
function fixture(direction='buy'){
  const buy=direction==='buy',minimum=buy?lox*99n/100n:eth*99n/100n;
  const tx={from:wallet,to:router,input:buildTradeData({direction,amount:buy?eth:lox,minimum,wallet,deadline:2000000000n}),value:buy?eth:0n};
  const logs=[{address:pair,topics:[swapTopic,topic(router),topic(buy?wallet:router)],
    data:'0x'+(buy?[eth,0n,0n,lox]:[0n,lox,eth,0n]).map(word).join('')},
    transfer(token,buy?pair:wallet,buy?wallet:pair,lox),transfer(weth,buy?router:pair,buy?pair:router,eth)];
  if(!buy)logs.push({address:weth,topics:['0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65',topic(router)],data:'0x'+word(eth)});
  return {receipt:{from:wallet,to:router,logs},tx};
}
test('accepts actual ETH to LOX and LOX to ETH settlements',()=>{
  for(const direction of ['buy','sell']){const {receipt,tx}=fixture(direction);assert.deepEqual(findTestnetTrade(receipt,tx),{direction,amount:lox.toString(),ethAmount:eth.toString()});}
});
test('rejects wrapping, approvals, transfers and swaps with no pair event',()=>{
  const {receipt,tx}=fixture();
  for(const input of ['0xd0e30db0','0x2e1a7d4d'+word(eth),'0x095ea7b3'+word(eth),'0x'])assert.equal(findTestnetTrade(receipt,{...tx,input}),null);
  assert.equal(findTestnetTrade({...receipt,logs:receipt.logs.slice(1)},tx),null);
});
test('requires the exact router, path, owner and wallet recipient',()=>{
  const {receipt,tx}=fixture();
  assert.equal(findTestnetTrade(receipt,{...tx,to:other}),null);
  assert.equal(findTestnetTrade({...receipt,to:other},tx),null);
  assert.equal(findTestnetTrade(receipt,{...tx,from:other}),null);
  assert.equal(findTestnetTrade(receipt,{...tx,input:tx.input.replace(wallet.slice(2),other.slice(2))}),null);
  assert.equal(findTestnetTrade(receipt,{...tx,input:tx.input.replace(token.slice(2),other.slice(2))}),null);
  assert.equal(findTestnetTrade(receipt,{...tx,input:tx.input+'00'}),null);
  assert.equal(findTestnetTrade(receipt,{...tx,value:eth+1n}),null);
});
test('requires allowlisted event emitter, caller, receiver and settled amount',()=>{
  const {receipt,tx}=fixture();const [swap,a,b]=receipt.logs;
  for(const invalid of [{...swap,address:other},{...swap,removed:true},{...swap,topics:[swapTopic,topic(other),topic(wallet)]},
    {...swap,topics:[swapTopic,topic(router),topic(other)]},{...swap,data:'0x'+[eth,0n,0n,lox+1n].map(word).join('')}]){
    assert.equal(findTestnetTrade({...receipt,logs:[invalid,a,b]},tx),null);
  }
  for(const logs of [[swap,b],[swap,a],[swap,a,{...b,address:other}],[swap,transfer(token,pair,other,lox),b],[swap,swap,a,b]])assert.equal(findTestnetTrade({...receipt,logs},tx),null);
});
test('requires slippage protection and sell input/withdrawal evidence',()=>{
  const {receipt,tx}=fixture('sell');
  assert.equal(findTestnetTrade({...receipt,logs:receipt.logs.slice(0,3)},tx),null);
  assert.equal(findTestnetTrade(receipt,{...tx,value:1n}),null);
  assert.equal(findTestnetTrade(receipt,{...tx,input:buildTradeData({direction:'sell',amount:lox+1n,minimum:1n,wallet,deadline:2000000000n})}),null);
  assert.equal(findTestnetTrade(receipt,{...tx,input:buildTradeData({direction:'sell',amount:lox,minimum:eth+1n,wallet,deadline:2000000000n})}),null);
  assert.throws(()=>buildTradeData({direction:'buy',amount:eth,minimum:0n,wallet,deadline:2000000000n}));
});

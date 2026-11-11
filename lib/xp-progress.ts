import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { getDb } from "@/lib/db";
import { XP, type XpProgress } from "@/lib/xp-rules";

import { WIF_CHAIN_ID } from "@/lib/weekly-wif";
import { WIF_SWAP_QUEST_SLUG, WIF_SWAP_VERIFICATION_METHOD } from "@/lib/wif-swap";
import { TESTNET_CHAIN_ID } from "@/lib/testnet-swap";
import { TRADE_QUEST_SLUG, TRADE_METHOD, TRADE_PAIR } from "@/lib/testnet-trade";
import type { TradeProof } from "@/lib/testnet-dex";

type WifSwapProof = {
  walletAddress: string;
  transactionHash: string;
  blockNumber: bigint;
  confirmations: number;
  direction: "buy" | "sell";
  wifAmount: string;
};

const emptyProgress: XpProgress = { xp: 0, swapCount: 0, testnetSwapCount: 0, testnetTradeCount: 0, walletVerified: false, addressProven: false };
const standingsLimit = 10;

export type XpStanding = XpProgress & {
  rank: number;
  position: number;
  walletLabel: string;
  isYou: boolean;
};

function scoreTotals(wallet?: string) {
  return sql`
    with milestones as (
      select c.wallet_address,
        bool_or(q.slug = 'connect-wallet') as wallet_verified,
        bool_or(q.slug = 'prove-transaction') as address_proven
      from public.completions c
      join public.quests q on q.id = c.quest_id
      where c.status = 'verified'
        and q.slug in ('connect-wallet', 'prove-transaction')
        ${wallet ? sql`and c.wallet_address = ${wallet}` : sql``}
      group by c.wallet_address
    ), swaps as (
      select wallet_address, count(*)::int as swap_count,
        count(*) filter (where chain_id = ${TESTNET_CHAIN_ID})::int as testnet_swap_count,
        count(*) filter (where chain_id = ${TESTNET_CHAIN_ID} and evidence ? 'testnetTrade')::int as testnet_trade_count
      from public.verification_records
      where transaction_hash is not null and (
        (chain_id = ${WIF_CHAIN_ID} and evidence ? 'wifSwap') or
        (chain_id = ${TESTNET_CHAIN_ID} and (evidence ? 'testnetSwap' or evidence ? 'testnetTrade')))
        ${wallet ? sql`and wallet_address = ${wallet}` : sql``}
      group by wallet_address
    ), scores as (
      select coalesce(m.wallet_address, s.wallet_address) as wallet_address,
        coalesce(m.wallet_verified, false) as wallet_verified,
        coalesce(m.address_proven, false) as address_proven,
        coalesce(s.swap_count, 0) as swap_count,
        coalesce(s.testnet_swap_count, 0) as testnet_swap_count,
        coalesce(s.testnet_trade_count, 0) as testnet_trade_count,
        (case when m.wallet_verified then ${XP.connectWallet + XP.verifyWallet}::int else 0 end
         + case when m.address_proven then ${XP.addressProof}::int else 0 end
         + coalesce(s.swap_count, 0) * ${XP.swap}::int) as xp
      from milestones m full join swaps s using (wallet_address)
    )`;
}

const progressColumns = sql`xp, swap_count as "swapCount",
  testnet_swap_count as "testnetSwapCount", testnet_trade_count as "testnetTradeCount",
  wallet_verified as "walletVerified", address_proven as "addressProven"`;

export async function getXpProgress(wallet: string): Promise<XpProgress> {
  const [row] = await drizzle(getDb()).execute<XpProgress>(sql`
    ${scoreTotals(wallet)}
    select ${progressColumns} from scores
  `);
  return row ?? emptyProgress;
}

export type TestnetSwapProof = {
  walletAddress: string;
  transactionHash: string;
  blockNumber: bigint;
  confirmations: number;
  direction: "buy" | "sell";
  amount: string;
  ethAmount: string;
};
export type TestnetSwapHistory = TradeProof;

export async function getTestnetSwapHistory(wallet: string) {
  return [...await drizzle(getDb()).execute<TestnetSwapHistory>(sql`
    select transaction_hash as "transactionHash", evidence->'testnetTrade'->>'direction' as direction,
      evidence->'testnetTrade'->>'amount' as amount, evidence->'testnetTrade'->>'ethAmount' as "ethAmount",
      block_number::text as "blockNumber", confirmations
    from public.verification_records
    where chain_id = ${TESTNET_CHAIN_ID} and wallet_address = ${wallet} and evidence ? 'testnetTrade'
      and transaction_hash is not null
    order by verified_at desc, id desc limit 10
  `)];
}

export async function hasTestnetSwapProof(wallet: string, hash: string) {
  const [row] = await drizzle(getDb()).execute<{ id: string }>(sql`
    select id from public.verification_records
    where chain_id = ${TESTNET_CHAIN_ID} and lower(transaction_hash) = ${hash}
      and wallet_address = ${wallet} and evidence ? 'testnetTrade'
  `);
  return !!row;
}

export async function saveTestnetSwapProof(proof: TestnetSwapProof) {
  const evidence = JSON.stringify({ testnetTrade: { direction: proof.direction, amount: proof.amount, ethAmount: proof.ethAmount, pool: TRADE_PAIR } });
  return drizzle(getDb()).transaction(async (tx) => {
    await tx.execute(sql`
      insert into public.quests (slug, title, description, category, verification_type, chain_id, is_published)
      values (${TRADE_QUEST_SLUG}, 'Testnet token swap for XP', 'Faucet ETH and test LOX AMM trade.',
        'Onchain proof', 'transaction', ${TESTNET_CHAIN_ID}, false)
      on conflict (slug) do nothing
    `);
    const [completion] = await tx.execute<{ id: string }>(sql`
      insert into public.completions (wallet_address, quest_id, status)
      select ${proof.walletAddress}, id, 'started' from public.quests
      where slug = ${TRADE_QUEST_SLUG} and verification_type = 'transaction'
        and chain_id = ${TESTNET_CHAIN_ID} and is_published = false
      on conflict (wallet_address, quest_id) do update set updated_at = now()
      returning id
    `);
    if (!completion) throw new Error("The testnet quest is unavailable.");
    const [saved] = await tx.execute<{ id: string }>(sql`
      insert into public.verification_records as receipt
        (completion_id, chain_id, wallet_address, transaction_hash, block_number, confirmations, verification_method, evidence)
      values (${completion.id}, ${TESTNET_CHAIN_ID}, ${proof.walletAddress}, ${proof.transactionHash},
        ${proof.blockNumber.toString()}, ${proof.confirmations}, ${TRADE_METHOD}, ${evidence}::jsonb)
      on conflict (chain_id, lower(transaction_hash)) where transaction_hash is not null do update
        set evidence = receipt.evidence || excluded.evidence
        where receipt.wallet_address = excluded.wallet_address and not (receipt.evidence ? 'testnetTrade')
      returning id
    `);
    if (saved) await tx.execute(sql`
      update public.completions set status = 'verified', verified_at = now(),
        submitted_at = coalesce(submitted_at, now()), updated_at = now() where id = ${completion.id}
    `);
    return !!saved;
  });
}

export async function getXpDashboard(wallet: string) {
  const rows = await drizzle(getDb()).execute<XpStanding>(sql`
    ${scoreTotals()}, ranked as (
      select *, dense_rank() over (order by xp desc)::int as rank,
        row_number() over (order by xp desc, wallet_address)::int as position
      from scores
      where xp > 0
    )
    select ${progressColumns}, rank, position, wallet_address = ${wallet} as "isYou",
      left(wallet_address, 8) || '…' || right(wallet_address, 6) as "walletLabel"
    from ranked
    where position <= ${standingsLimit} or wallet_address = ${wallet}
    order by position
  `);
  const personal = rows.find((row) => row.isYou);
  return { progress: personal ?? emptyProgress, rank: personal?.rank ?? null, standings: [...rows] };
}

export async function hasWifSwapProof(wallet: string, transactionHash: string) {
  const [proof] = await drizzle(getDb()).execute<{ id: string }>(sql`
    select id from public.verification_records
    where chain_id = ${WIF_CHAIN_ID} and lower(transaction_hash) = ${transactionHash}
      and wallet_address = ${wallet} and evidence ? 'wifSwap'
  `);
  return !!proof;
}

export async function saveWifSwapProof(proof: WifSwapProof) {
  const evidence = JSON.stringify({ wifSwap: { direction: proof.direction, amount: proof.wifAmount } });
  return drizzle(getDb()).transaction(async (tx) => {
    await tx.execute(sql`
      insert into public.quests (slug, title, description, category, verification_type, chain_id, is_published)
      values (${WIF_SWAP_QUEST_SLUG}, 'Swap for XP', 'A verified ETH and WIF swap.', 'Onchain proof',
        'transaction', ${WIF_CHAIN_ID}, false)
      on conflict (slug) do nothing
    `);
    const [completion] = await tx.execute<{ id: string }>(sql`
      insert into public.completions (wallet_address, quest_id, status)
      select ${proof.walletAddress}, id, 'started' from public.quests
      where slug = ${WIF_SWAP_QUEST_SLUG} and verification_type = 'transaction'
        and chain_id = ${WIF_CHAIN_ID} and is_published = false
      on conflict (wallet_address, quest_id) do update set updated_at = now()
      returning id
    `);
    if (!completion) throw new Error("The swap quest record is unavailable.");

    // Share the receipt with an existing weekly claim and award swap XP once.
    const [saved] = await tx.execute<{ id: string }>(sql`
      insert into public.verification_records as receipt
        (completion_id, chain_id, wallet_address, transaction_hash, block_number, confirmations,
          verification_method, evidence)
      values (${completion.id}, ${WIF_CHAIN_ID}, ${proof.walletAddress}, ${proof.transactionHash},
        ${proof.blockNumber.toString()}, ${proof.confirmations}, ${WIF_SWAP_VERIFICATION_METHOD}, ${evidence}::jsonb)
      on conflict (chain_id, lower(transaction_hash)) where transaction_hash is not null do update
        set evidence = receipt.evidence || excluded.evidence
        where receipt.wallet_address = excluded.wallet_address and not (receipt.evidence ? 'wifSwap')
      returning id
    `);
    if (saved) {
      await tx.execute(sql`
        update public.completions set status = 'verified', verified_at = now(),
          submitted_at = coalesce(submitted_at, now()), updated_at = now()
        where id = ${completion.id}
      `);
    }
    return !!saved;
  });
}

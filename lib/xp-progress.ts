import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { getDb } from "@/lib/db";
import { XP, type XpProgress } from "@/lib/xp-rules";

import { WIF_CHAIN_ID, WIF_QUEST_SLUG } from "@/lib/weekly-wif";
import { WIF_SWAP_QUEST_SLUG, WIF_SWAP_VERIFICATION_METHOD } from "@/lib/wif-swap";
import { TESTNET_CHAIN_ID, TESTNET_SWAP_QUEST_SLUG } from "@/lib/testnet-swap";
import { TRADE_QUEST_SLUG, TRADE_METHOD, TRADE_PAIR } from "@/lib/testnet-trade";
import type { TradeProof } from "@/lib/testnet-dex";
import { SEND_METHOD, SEND_QUEST_SLUG } from "@/lib/testnet-send";
import { getJourneyBadges, getJourneyLevel, getJourneyStreak, getJourneyWeek, getQuestRotation } from "@/lib/journey";

type WifSwapProof = {
  walletAddress: string;
  transactionHash: string;
  blockNumber: bigint;
  confirmations: number;
  direction: "buy" | "sell";
  wifAmount: string;
};

const emptyProgress: XpProgress = { xp: 0, swapCount: 0, testnetSwapCount: 0, testnetTradeCount: 0,
  testnetSendCount: 0, referralCount: 0, onchainActionCount: 0, walletVerified: false, addressProven: false };
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
    ), sends as (
      select wallet_address, count(*)::int as testnet_send_count
      from public.verification_records
      where chain_id = ${TESTNET_CHAIN_ID} and transaction_hash is not null and evidence ? 'testnetSend'
        ${wallet ? sql`and wallet_address = ${wallet}` : sql``}
      group by wallet_address
    ), referrals as (
      select lower(evidence->'referral'->>'referrer') as wallet_address, count(*)::int as referral_count
      from public.verification_records
      where evidence ? 'referral' and evidence->'referral'->>'referrer' is not null
        ${wallet ? sql`and lower(evidence->'referral'->>'referrer') = ${wallet}` : sql``}
      group by lower(evidence->'referral'->>'referrer')
    ), scores as (
      select p.wallet_address,
        coalesce(m.wallet_verified, false) as wallet_verified,
        coalesce(m.address_proven, false) as address_proven,
        coalesce(s.swap_count, 0) as swap_count,
        coalesce(s.testnet_swap_count, 0) as testnet_swap_count,
        coalesce(s.testnet_trade_count, 0) as testnet_trade_count,
        coalesce(sn.testnet_send_count, 0) as testnet_send_count,
        coalesce(r.referral_count, 0) as referral_count,
        (coalesce(s.swap_count, 0) + coalesce(sn.testnet_send_count, 0))::int as onchain_action_count,
        (case when m.wallet_verified then ${XP.connectWallet + XP.verifyWallet}::int else 0 end
         + case when m.address_proven then ${XP.addressProof}::int else 0 end
         + coalesce(s.swap_count, 0) * ${XP.swap}::int
         + coalesce(sn.testnet_send_count, 0) * ${XP.testnetSend}::int
         + coalesce(r.referral_count, 0) * ${XP.referral}::int) as xp
      from public.profiles p
      left join milestones m using (wallet_address)
      left join swaps s using (wallet_address)
      left join sends sn using (wallet_address)
      left join referrals r using (wallet_address)
      ${wallet ? sql`where p.wallet_address = ${wallet}` : sql``}
    )`;
}

const progressColumns = sql`xp, swap_count as "swapCount",
  testnet_swap_count as "testnetSwapCount", testnet_trade_count as "testnetTradeCount",
  testnet_send_count as "testnetSendCount", referral_count as "referralCount",
  onchain_action_count as "onchainActionCount",
  wallet_verified as "walletVerified", address_proven as "addressProven"`;

export async function getXpProgress(wallet: string): Promise<XpProgress> {
  const [row] = await drizzle(getDb()).execute<XpProgress>(sql`
    ${scoreTotals(wallet)}
    select ${progressColumns} from scores
  `);
  const progress = row ?? emptyProgress;
  const referralCount = (await getReferralWallets(wallet)).length;
  const missingReferralXp = Math.max(0, referralCount - progress.referralCount) * XP.referral;
  return { ...progress, referralCount, xp: progress.xp + missingReferralXp };
}

export async function getReferralWallets(wallet: string) {
  const evidenceRows = await drizzle(getDb()).execute<{ invitee: string }>(sql`
    select distinct lower(evidence->'referral'->>'invitee') as invitee
    from public.verification_records
    where evidence ? 'referral' and lower(evidence->'referral'->>'referrer') = ${wallet}
      and evidence->'referral'->>'invitee' is not null
  `);
  let tableWallets: string[] = [];
  try {
    const db = getDb();
    const rows = await db<{ invitee_wallet: string }[]>`
      select invitee_wallet from public.wallet_referrals
      where lower(inviter_wallet) = ${wallet} order by created_at desc
    `;
    tableWallets = rows.map((row) => row.invitee_wallet.toLowerCase());
  } catch { /* Migration 0005 may still be pending. */ }
  return [...new Set([...tableWallets, ...evidenceRows.map((row) => row.invitee)])];
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

export type TestnetSendProof = {
  walletAddress: string;
  transactionHash: string;
  blockNumber: bigint;
  confirmations: number;
  recipient: string;
  amount: string;
};

export type TestnetSendHistory = Omit<TestnetSendProof, "walletAddress" | "blockNumber"> & { blockNumber: string };

export async function getTestnetSendHistory(wallet: string) {
  return [...await drizzle(getDb()).execute<TestnetSendHistory>(sql`
    select transaction_hash as "transactionHash", evidence->'testnetSend'->>'recipient' as recipient,
      evidence->'testnetSend'->>'amount' as amount, block_number::text as "blockNumber", confirmations
    from public.verification_records
    where chain_id = ${TESTNET_CHAIN_ID} and wallet_address = ${wallet} and evidence ? 'testnetSend'
      and transaction_hash is not null
    order by verified_at desc, id desc limit 10
  `)];
}

export async function hasTestnetSendProof(wallet: string, hash: string) {
  const [row] = await drizzle(getDb()).execute<{ id: string }>(sql`
    select id from public.verification_records
    where chain_id = ${TESTNET_CHAIN_ID} and lower(transaction_hash) = ${hash}
      and wallet_address = ${wallet} and evidence ? 'testnetSend'
  `);
  return !!row;
}

export async function saveTestnetSendProof(proof: TestnetSendProof) {
  const evidence = JSON.stringify({ testnetSend: { recipient: proof.recipient, amount: proof.amount } });
  return drizzle(getDb()).transaction(async (tx) => {
    await tx.execute(sql`
      insert into public.quests (slug, title, description, category, verification_type, chain_id, is_published)
      values (${SEND_QUEST_SLUG}, 'Send a test token', 'Send faucet-funded Test LOX to another wallet.',
        'Onchain proof', 'transaction', ${TESTNET_CHAIN_ID}, false)
      on conflict (slug) do nothing
    `);
    const [completion] = await tx.execute<{ id: string }>(sql`
      insert into public.completions (wallet_address, quest_id, status)
      select ${proof.walletAddress}, id, 'started' from public.quests
      where slug = ${SEND_QUEST_SLUG} and verification_type = 'transaction'
        and chain_id = ${TESTNET_CHAIN_ID} and is_published = false
      on conflict (wallet_address, quest_id) do update set updated_at = now()
      returning id
    `);
    if (!completion) throw new Error("The token send quest is unavailable.");
    const [saved] = await tx.execute<{ id: string }>(sql`
      insert into public.verification_records as receipt
        (completion_id, chain_id, wallet_address, transaction_hash, block_number, confirmations, verification_method, evidence)
      values (${completion.id}, ${TESTNET_CHAIN_ID}, ${proof.walletAddress}, ${proof.transactionHash},
        ${proof.blockNumber.toString()}, ${proof.confirmations}, ${SEND_METHOD}, ${evidence}::jsonb)
      on conflict (chain_id, lower(transaction_hash)) where transaction_hash is not null do update
        set evidence = receipt.evidence || excluded.evidence
        where receipt.wallet_address = excluded.wallet_address and not (receipt.evidence ? 'testnetSend')
      returning id
    `);
    if (saved) await tx.execute(sql`
      update public.completions set status = 'verified', verified_at = now(),
        submitted_at = coalesce(submitted_at, now()), updated_at = now() where id = ${completion.id}
    `);
    return !!saved;
  });
}

export type PassportActivity = {
  transactionHash: string;
  blockNumber: string;
  confirmations: number;
  verifiedAt: Date | string;
  kind: "Swap" | "Token send" | "Onchain proof";
  detail: string | null;
};

export async function getJourneyProfile(wallet: string, now = new Date()) {
  const [progress, activityRows, ecosystemRows, weekRows] = await Promise.all([
    getXpProgress(wallet),
    drizzle(getDb()).execute<PassportActivity & { verifiedAt: Date | string }>(sql`
      select transaction_hash as "transactionHash", block_number::text as "blockNumber", confirmations,
        verified_at as "verifiedAt",
        case when evidence ? 'testnetTrade' then 'Swap'
             when evidence ? 'testnetSend' then 'Token send'
             else 'Onchain proof' end as kind,
        case when evidence ? 'testnetTrade' then evidence->'testnetTrade'->>'direction'
             when evidence ? 'testnetSend' then evidence->'testnetSend'->>'recipient'
             else null end as detail
      from public.verification_records
      where chain_id = ${TESTNET_CHAIN_ID} and wallet_address = ${wallet} and transaction_hash is not null
      order by verified_at desc, id desc limit 20
    `),
    drizzle(getDb()).execute<{ count: number }>(sql`
      select count(*)::int as count from public.completions c join public.quests q on q.id = c.quest_id
      where c.wallet_address = ${wallet} and c.status in ('verified','submitted')
        and q.slug not in (${WIF_QUEST_SLUG}, ${WIF_SWAP_QUEST_SLUG}, ${TESTNET_SWAP_QUEST_SLUG}, ${TRADE_QUEST_SLUG}, ${SEND_QUEST_SLUG})
    `),
    drizzle(getDb()).execute<{ verifiedAt: Date | string }>(sql`
      select distinct date_trunc('week', verified_at) as "verifiedAt"
      from public.verification_records
      where chain_id = ${TESTNET_CHAIN_ID} and wallet_address = ${wallet} and transaction_hash is not null
    `)
  ]);
  const activity = [...activityRows];
  const streak = getJourneyStreak(now, weekRows.map((item) => item.verifiedAt));
  const currentWeek = getJourneyWeek(now);
  return {
    progress,
    level: getJourneyLevel(progress.xp),
    streak,
    rotation: getQuestRotation(now),
    weeklyComplete: activity.some((item) => getJourneyWeek(item.verifiedAt) === currentWeek),
    badges: getJourneyBadges(progress, streak),
    ecosystemQuestCount: ecosystemRows[0]?.count ?? 0,
    activity
  };
}

export async function saveReferral(referrer: string, invitee: string) {
  const evidence = JSON.stringify({ referral: { referrer, invitee } });
  return drizzle(getDb()).transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${invitee}, 0))`);
    const [members] = await tx.execute<{ count: number }>(sql`
      select count(*)::int as count from public.profiles where wallet_address in (${referrer}, ${invitee})
    `);
    if (members?.count !== 2) throw new Error("Both referral wallets must be verified FlatQuest profiles.");
    const [existing] = await tx.execute<{ id: string }>(sql`
      select id from public.verification_records
      where evidence ? 'referral' and lower(evidence->'referral'->>'invitee') = ${invitee}
      limit 1
    `);
    if (existing) return false;
    await tx.execute(sql`
      insert into public.quests (slug, title, description, category, verification_type, is_published)
      values ('wallet-referral', 'Welcome a new wallet', 'Invite a wallet that completes verified onboarding.',
        'Community', 'wallet', false)
      on conflict (slug) do nothing
    `);
    const [completion] = await tx.execute<{ id: string }>(sql`
      insert into public.completions (wallet_address, quest_id, status, submitted_at, verified_at)
      select ${invitee}, id, 'verified', now(), now() from public.quests where slug = 'wallet-referral'
      on conflict (wallet_address, quest_id) do update set updated_at = now()
      returning id
    `);
    if (!completion) throw new Error("The referral quest is unavailable.");
    await tx.execute(sql`
      insert into public.verification_records
        (completion_id, chain_id, wallet_address, confirmations, verification_method, evidence)
      values (${completion.id}, 0, ${invitee}, 0, 'verified_wallet_referral', ${evidence}::jsonb)
    `);
    return true;
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

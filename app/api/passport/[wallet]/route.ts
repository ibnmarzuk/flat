import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isValidWalletAddress } from "@/lib/wallet-auth-policy";
import { getJourneyProfile, getReferralWallets, getTestnetSendHistory, getTestnetSwapHistory, getXpDashboard } from "@/lib/xp-progress";
import { getWifProgress } from "@/lib/wif-progress";
import { getXpLevel } from "@/lib/xp-levels";
import { TESTNET_EXPLORER } from "@/lib/testnet-swap";
import { WIF_EXPLORER } from "@/lib/weekly-wif";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ wallet: string }> }) {
  const { wallet: rawWallet } = await context.params;
  if (!isValidWalletAddress(rawWallet)) return NextResponse.json({ error: "Enter a valid wallet address." }, { status: 400 });
  const wallet = rawWallet.toLowerCase();
  try {
    const db = getDb();
    const [dashboard, journey, wif, trades, sends, invitedWallets, milestones] = await Promise.all([
      getXpDashboard(wallet), getJourneyProfile(wallet), getWifProgress(wallet).catch(() => null),
      getTestnetSwapHistory(wallet).catch(() => []), getTestnetSendHistory(wallet).catch(() => []),
      getReferralWallets(wallet),
      db<{ slug: string; title: string; verified_at: Date | string; transaction_hash: string | null; chain_id: number | null }[]>`
        select q.slug, q.title, c.verified_at, vr.transaction_hash, vr.chain_id
        from public.completions c join public.quests q on q.id = c.quest_id
        left join lateral (select transaction_hash, chain_id from public.verification_records where completion_id = c.id order by verified_at desc limit 1) vr on true
        where lower(c.wallet_address) = ${wallet} and c.status = 'verified'
        order by c.verified_at desc limit 12
      `
    ]);
    return NextResponse.json({
      walletAddress: wallet, xp: journey.progress, level: getXpLevel(journey.progress.xp), rank: dashboard.rank,
      streak: journey.streak, weeklyComplete: journey.weeklyComplete, rotation: journey.rotation,
      badges: journey.badges, wifStreak: wif?.streak ?? 0, wifWeeks: wif?.totalWeeks ?? 0,
      invitedWallets: invitedWallets.length, invitedWalletAddresses: invitedWallets,
      milestones: milestones.map((item) => ({ slug: item.slug, title: item.title,
        verifiedAt: new Date(item.verified_at).toISOString(), transactionHash: item.transaction_hash,
        explorerUrl: item.transaction_hash ? `${Number(item.chain_id) === 4663 ? WIF_EXPLORER : TESTNET_EXPLORER}/tx/${item.transaction_hash}` : null })),
      recentTrades: trades.slice(0, 5).map((trade) => ({ ...trade, explorerUrl: `${TESTNET_EXPLORER}/tx/${trade.transactionHash}` })),
      recentSends: sends.slice(0, 5).map((send) => ({ ...send, explorerUrl: `${TESTNET_EXPLORER}/tx/${send.transactionHash}` }))
    }, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } });
  } catch {
    return NextResponse.json({ error: "This passport is temporarily unavailable." }, { status: 503 });
  }
}

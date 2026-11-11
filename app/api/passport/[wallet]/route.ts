import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isValidWalletAddress } from "@/lib/wallet-auth-policy";
import { getXpDashboard, getTestnetSwapHistory } from "@/lib/xp-progress";
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
    const [dashboard, wif, trades, referrals, milestones] = await Promise.all([
      getXpDashboard(wallet),
      getWifProgress(wallet).catch(() => null),
      getTestnetSwapHistory(wallet).catch(() => []),
      db<{ invited: number; wallets: string[] }[]>`select count(*)::int as invited, coalesce(array_agg(invitee_wallet order by created_at desc), array[]::text[]) as wallets from public.wallet_referrals where lower(inviter_wallet) = ${wallet}`,
      db<{ slug: string; title: string; verified_at: Date | string; transaction_hash: string | null; chain_id: number | null }[]>`
        select q.slug, q.title, c.verified_at, vr.transaction_hash, vr.chain_id
        from public.completions c
        join public.quests q on q.id = c.quest_id
        left join lateral (
          select transaction_hash, chain_id from public.verification_records
          where completion_id = c.id order by verified_at desc limit 1
        ) vr on true
        where lower(c.wallet_address) = ${wallet} and c.status = 'verified'
        order by c.verified_at desc limit 12
      `
    ]);
    const xp = dashboard.progress;
    const level = getXpLevel(xp.xp);
    return NextResponse.json({
      walletAddress: wallet,
      xp,
      level,
      rank: dashboard.rank,
      streak: wif?.streak ?? 0,
      wifWeeks: wif?.totalWeeks ?? 0,
      invitedWallets: referrals[0]?.invited ?? 0,
      invitedWalletAddresses: referrals[0]?.wallets ?? [],
      milestones: milestones.map((item) => ({
        slug: item.slug,
        title: item.title,
        verifiedAt: new Date(item.verified_at).toISOString(),
        transactionHash: item.transaction_hash,
        explorerUrl: item.transaction_hash
          ? `${Number(item.chain_id) === 4663 ? WIF_EXPLORER : TESTNET_EXPLORER}/tx/${item.transaction_hash}`
          : null
      })),
      recentTrades: trades.slice(0, 5).map((trade) => ({
        transactionHash: trade.transactionHash,
        direction: trade.direction,
        amount: trade.amount,
        ethAmount: trade.ethAmount,
        explorerUrl: `${TESTNET_EXPLORER}/tx/${trade.transactionHash}`
      }))
    }, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } });
  } catch {
    return NextResponse.json({ error: "This passport is temporarily unavailable." }, { status: 503 });
  }
}

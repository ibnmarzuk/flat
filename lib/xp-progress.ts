import { and, eq, sql } from "drizzle-orm";
import { bigint, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import { getDb } from "@/lib/db";
import { XP, type XpProgress } from "@/lib/xp-rules";

const wifSwapProofs = pgTable("wif_swap_proofs", {
  transactionHash: text("transaction_hash").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
  direction: text("direction", { enum: ["buy", "sell"] }).notNull(),
  wifAmount: numeric("wif_amount", { precision: 78, scale: 0 }).notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).defaultNow().notNull()
});

const emptyProgress: XpProgress = { xp: 0, swapCount: 0, walletVerified: false, addressProven: false };
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
      select wallet_address, count(*)::int as swap_count
      from public.wif_swap_proofs
      ${wallet ? sql`where wallet_address = ${wallet}` : sql``}
      group by wallet_address
    ), scores as (
      select coalesce(m.wallet_address, s.wallet_address) as wallet_address,
        coalesce(m.wallet_verified, false) as wallet_verified,
        coalesce(m.address_proven, false) as address_proven,
        coalesce(s.swap_count, 0) as swap_count,
        (case when m.wallet_verified then ${XP.connectWallet + XP.verifyWallet}::int else 0 end
         + case when m.address_proven then ${XP.addressProof}::int else 0 end
         + coalesce(s.swap_count, 0) * ${XP.swap}::int) as xp
      from milestones m full join swaps s using (wallet_address)
    )`;
}

const progressColumns = sql`xp, swap_count as "swapCount",
  wallet_verified as "walletVerified", address_proven as "addressProven"`;

export async function getXpProgress(wallet: string): Promise<XpProgress> {
  const [row] = await drizzle(getDb()).execute<XpProgress>(sql`
    ${scoreTotals(wallet)}
    select ${progressColumns} from scores
  `);
  return row ?? emptyProgress;
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
  const [proof] = await drizzle(getDb()).select({ transactionHash: wifSwapProofs.transactionHash })
    .from(wifSwapProofs)
    .where(and(eq(wifSwapProofs.walletAddress, wallet), eq(wifSwapProofs.transactionHash, transactionHash)))
    .limit(1);
  return !!proof;
}

export async function saveWifSwapProof(proof: typeof wifSwapProofs.$inferInsert) {
  const [saved] = await drizzle(getDb()).insert(wifSwapProofs).values(proof)
    .onConflictDoNothing({ target: wifSwapProofs.transactionHash })
    .returning({ transactionHash: wifSwapProofs.transactionHash });
  return !!saved;
}

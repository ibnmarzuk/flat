import { getDb } from "@/lib/db";
import { getWifStreak, getWifWeek, WIF_CHAIN_ID, WIF_QUEST_SLUG, WIF_VERIFICATION_METHOD } from "@/lib/weekly-wif";

export type WifProof = {
  transactionHash: string;
  weekStart: string;
  recipient: string;
  amount: string;
  blockNumber: string;
  confirmations: number;
  blockTime: string;
};

export type WifProgress = {
  week: ReturnType<typeof getWifWeek>;
  streak: number;
  totalWeeks: number;
  currentProof: WifProof | null;
  recentProofs: WifProof[];
};

export async function getWifProgress(wallet: string): Promise<WifProgress> {
  const db = getDb();
  const proofs = await db<WifProof[]>`
    select vr.transaction_hash as "transactionHash", vr.block_number::text as "blockNumber",
           vr.confirmations, vr.evidence->>'weekStart' as "weekStart",
           vr.evidence->>'recipient' as recipient, vr.evidence->>'amount' as amount,
           vr.evidence->>'blockTime' as "blockTime"
    from public.verification_records vr
    join public.completions c on c.id = vr.completion_id
    join public.quests q on q.id = c.quest_id
    where c.wallet_address = ${wallet} and vr.wallet_address = ${wallet}
      and q.slug = ${WIF_QUEST_SLUG} and vr.chain_id = ${WIF_CHAIN_ID}
      and vr.verification_method = ${WIF_VERIFICATION_METHOD}
    order by vr.evidence->>'weekStart' desc
  `;
  const week = getWifWeek();
  const weeks = new Set(proofs.map((proof) => proof.weekStart));
  return {
    week,
    streak: getWifStreak(week.start, weeks),
    totalWeeks: weeks.size,
    currentProof: proofs.find((proof) => proof.weekStart === week.start) ?? null,
    recentProofs: proofs.slice(0, 4)
  };
}

export class WifTransactionUsedError extends Error {}

export async function saveWifProof(wallet: string, proof: WifProof) {
  const db = getDb();
  return db.begin(async (tx) => {
    // This dedicated record keeps the weekly challenge out of the starter
    // path. Create it on the first verified claim using the existing schema.
    await tx`
      insert into public.quests (slug, title, description, category, verification_type, chain_id, is_published)
      values (${WIF_QUEST_SLUG}, 'Pass WIF forward', 'A weekly verified WIF transfer.', 'Onchain proof',
        'transaction', ${WIF_CHAIN_ID}, false)
      on conflict (slug) do nothing
    `;
    const [quest] = await tx<{ id: string }[]>`
      select id from public.quests
      where slug = ${WIF_QUEST_SLUG} and verification_type = 'transaction'
        and chain_id = ${WIF_CHAIN_ID} and is_published = false
    `;
    if (!quest) throw new Error("The weekly quest record is unavailable.");

    await tx`
      insert into public.completions (wallet_address, quest_id, status)
      values (${wallet}, ${quest.id}, 'started')
      on conflict (wallet_address, quest_id) do nothing
    `;
    // Serialize submissions for the same wallet before checking the week.
    const [completion] = await tx<{ id: string }[]>`
      select id from public.completions where wallet_address = ${wallet} and quest_id = ${quest.id}
      for update
    `;
    if (!completion) throw new Error("The weekly completion record is unavailable.");
    const [existing] = await tx<{ transaction_hash: string }[]>`
      select transaction_hash from public.verification_records
      where completion_id = ${completion.id} and chain_id = ${WIF_CHAIN_ID}
        and verification_method = ${WIF_VERIFICATION_METHOD} and evidence->>'weekStart' = ${proof.weekStart}
      limit 1
    `;
    if (existing) return existing.transaction_hash === proof.transactionHash ? "saved" : "week-complete";

    const evidence = {
      weekStart: proof.weekStart,
      recipient: proof.recipient,
      amount: proof.amount,
      blockTime: proof.blockTime
    };
    const [record] = await tx`
      insert into public.verification_records
        (completion_id, chain_id, wallet_address, transaction_hash, block_number, confirmations,
         verification_method, evidence)
      values (${completion.id}, ${WIF_CHAIN_ID}, ${wallet}, ${proof.transactionHash}, ${proof.blockNumber},
        ${proof.confirmations}, ${WIF_VERIFICATION_METHOD}, ${JSON.stringify(evidence)}::jsonb)
      on conflict (chain_id, lower(transaction_hash)) where transaction_hash is not null do nothing
      returning id
    `;
    if (!record) throw new WifTransactionUsedError();

    await tx`
      update public.completions set status = 'verified', verified_at = now(),
        submitted_at = coalesce(submitted_at, now()), updated_at = now()
      where id = ${completion.id}
    `;
    return "saved";
  });
}

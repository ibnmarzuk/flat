-- Prevent the same onchain transaction from creating duplicate proof records.
-- The lowercase expression makes transaction hash matching case-insensitive.
create unique index if not exists verification_records_chain_tx_unique_idx
  on public.verification_records (chain_id, lower(transaction_hash))
  where transaction_hash is not null;

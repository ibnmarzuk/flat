-- Verified swap evidence on Robinhood Chain mainnet (4663).
-- A transaction hash can earn swap XP once, independently of other quests.
create table if not exists public.wif_swap_proofs (
  transaction_hash text primary key check (transaction_hash ~ '^0x[0-9a-f]{64}$'),
  wallet_address text not null references public.profiles(wallet_address) on delete cascade,
  block_number bigint not null check (block_number >= 0),
  direction text not null check (direction in ('buy', 'sell')),
  wif_amount numeric(78,0) not null check (wif_amount > 0),
  verified_at timestamptz not null default now()
);

create index if not exists wif_swap_proofs_wallet_idx
  on public.wif_swap_proofs (wallet_address);

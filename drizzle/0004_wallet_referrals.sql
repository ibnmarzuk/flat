-- Wallet-to-wallet invite attribution for FlatQuest.
-- A referral is recorded only by an authenticated invitee and can be claimed once.
create table if not exists public.wallet_referrals (
  id uuid primary key default gen_random_uuid(),
  inviter_wallet text not null references public.profiles(wallet_address) on delete cascade,
  invitee_wallet text not null unique references public.profiles(wallet_address) on delete cascade,
  created_at timestamptz not null default now(),
  constraint wallet_referrals_not_self check (lower(inviter_wallet) <> lower(invitee_wallet))
);

create index if not exists wallet_referrals_inviter_created_idx
  on public.wallet_referrals (inviter_wallet, created_at desc);

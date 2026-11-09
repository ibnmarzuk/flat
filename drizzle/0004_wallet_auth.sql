-- Wallet sign-in uses short-lived challenges and hashed session tokens.
create table if not exists public.wallet_auth_challenges (
  nonce text primary key check (nonce ~ '^[0-9a-f]{32}$'),
  wallet_address text not null check (wallet_address ~ '^0x[0-9a-f]{40}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null check (expires_at > created_at),
  consumed_at timestamptz
);

create table if not exists public.wallet_sessions (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  wallet_address text not null references public.profiles(wallet_address) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null check (expires_at > created_at),
  revoked_at timestamptz
);

create index if not exists wallet_auth_challenges_expires_at_idx
  on public.wallet_auth_challenges (expires_at);

create index if not exists wallet_sessions_expires_at_idx
  on public.wallet_sessions (expires_at);

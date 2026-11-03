-- FlatQuest initial Neon Postgres schema
-- All writes are performed by trusted server routes. Never expose DATABASE_URL to the browser.

create extension if not exists pgcrypto;

create table if not exists public.quests (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null,
  category text not null,
  difficulty text not null default 'beginner' check (difficulty in ('beginner','intermediate','advanced')),
  verification_type text not null check (verification_type in ('wallet','network','transaction','contract_read','self_report')),
  chain_id bigint,
  is_published boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quest_steps (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references public.quests(id) on delete cascade,
  title text not null,
  instructions text not null,
  resource_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (quest_id, sort_order)
);

create table if not exists public.profiles (
  wallet_address text primary key check (wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.completions (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null references public.profiles(wallet_address) on delete cascade,
  quest_id uuid not null references public.quests(id) on delete restrict,
  status text not null default 'started' check (status in ('started','submitted','verified','rejected')),
  submitted_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wallet_address, quest_id)
);

create table if not exists public.verification_records (
  id uuid primary key default gen_random_uuid(),
  completion_id uuid not null references public.completions(id) on delete cascade,
  chain_id bigint not null,
  wallet_address text not null check (wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
  transaction_hash text,
  block_number bigint,
  confirmations integer not null default 0 check (confirmations >= 0),
  verification_method text not null,
  evidence jsonb not null default '{}'::jsonb,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint transaction_hash_format check (
    transaction_hash is null or transaction_hash ~ '^0x[0-9a-fA-F]{64}$'
  )
);

create index if not exists quest_steps_quest_sort_idx on public.quest_steps (quest_id, sort_order);
create index if not exists completions_wallet_created_idx on public.completions (wallet_address, created_at desc);
create index if not exists verification_records_completion_idx on public.verification_records (completion_id, verified_at desc);
create index if not exists verification_records_tx_hash_idx on public.verification_records (transaction_hash) where transaction_hash is not null;

insert into public.quests
  (slug, title, description, category, difficulty, verification_type, chain_id, is_published, sort_order)
values
  ('connect-wallet', 'Connect your wallet', 'Bring your onchain identity into the journey. Your wallet stays in your control.', 'Getting started', 'beginner', 'wallet', null, true, 1),
  ('robinhood-testnet', 'Find your place on Robinhood Chain', 'Switch to Robinhood Chain testnet and get familiar with the network.', 'Getting started', 'beginner', 'network', 46630, true, 2),
  ('prove-transaction', 'Prove an onchain transaction', 'Submit a transaction hash and let FlatQuest check the receipt, sender and confirmations.', 'Onchain proof', 'beginner', 'transaction', 46630, true, 3),
  ('explore-ecosystem', 'Explore the ecosystem', 'Discover a useful project or resource in the World Is Flat ecosystem.', 'Explore', 'beginner', 'self_report', null, true, 4)
on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  difficulty = excluded.difficulty,
  verification_type = excluded.verification_type,
  chain_id = excluded.chain_id,
  is_published = excluded.is_published,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.quest_steps (quest_id, title, instructions, resource_url, sort_order)
select q.id, step.title, step.instructions, step.resource_url, step.sort_order
from public.quests q
join (values
  ('connect-wallet', 'Open your wallet', 'Use a browser wallet you control. Never share your recovery phrase or private key.', null::text, 1),
  ('connect-wallet', 'Connect to FlatQuest', 'Approve the connection request in your wallet. Connecting does not give FlatQuest permission to move funds.', null::text, 2),
  ('robinhood-testnet', 'Review the network', 'Robinhood Chain testnet uses chain ID 46630 and ETH for gas. Testnet assets are not mainnet funds.', 'https://docs.robinhood.com/chain/', 1),
  ('robinhood-testnet', 'Switch your wallet network', 'Use the quest action to add or switch to Robinhood Chain testnet. Confirm the chain ID in your wallet.', 'https://docs.robinhood.com/chain/connecting/', 2),
  ('prove-transaction', 'Complete a testnet transaction', 'Use a trusted testnet application or faucet. Do not send funds to an address supplied by an unknown person.', 'https://explorer.testnet.chain.robinhood.com/', 1),
  ('prove-transaction', 'Submit the transaction hash', 'Paste the transaction hash. FlatQuest checks that the receipt succeeded, the sender matches your connected wallet, and the transaction has at least two confirmations.', null::text, 2),
  ('explore-ecosystem', 'Explore World Is Flat', 'Read about the ecosystem and identify a project, tool or resource that is useful to you.', 'https://worldisflat.fun/', 1),
  ('explore-ecosystem', 'Reflect on what you found', 'Record what you explored. This is a self-reported learning milestone, not an onchain verification.', null::text, 2)
) as step(quest_slug, title, instructions, resource_url, sort_order)
  on q.slug = step.quest_slug
on conflict (quest_id, sort_order) do update set
  title = excluded.title,
  instructions = excluded.instructions,
  resource_url = excluded.resource_url;

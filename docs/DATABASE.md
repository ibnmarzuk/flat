# FlatQuest database setup

## Project isolation

FlatQuest uses a dedicated Supabase project. Do not reuse the Supabase project for another portfolio or application.

## Current schema

Apply `supabase/migrations/20261102000000_initial_flatquest_schema.sql` to the new FlatQuest project.

The migration creates:

- `quests` and `quest_steps` for published onboarding content
- `profiles` for each authenticated user and their linked wallet
- `completions` for user-owned quest progress
- `verification_records` for trusted verification evidence

## Security model

- RLS is enabled on every table in the exposed `public` schema.
- Public visitors can only read published quests and their steps.
- Authenticated users can read and update only their own profile and unverified quest progress.
- Client policies deliberately prevent users from setting a completion to `verified` or writing verification evidence.
- Trusted server code must verify chain state and write verification records. Never put a Supabase secret or service role key in a browser bundle.

## Current transaction verification prototype

`POST /api/verify-transaction` accepts only the `prove-transaction` quest ID and checks a submitted transaction against Robinhood Chain testnet from the server. Its proof scope is explicitly `successful_wallet_transaction`: it verifies a successful transaction sent by the connected address, not a particular contract interaction or ecosystem task. Other quests are rejected by this endpoint until their own verification rules are implemented. It confirms the configured RPC reports chain ID `46630`, the receipt succeeded, the transaction sender matches the submitted wallet address, the receipt and transaction hashes match the requested hash, the included block hash and number agree across both RPC responses, and at least two confirmations exist. The returned evidence also includes the recipient, value and input data size.

This proves public transaction facts only. It does not authenticate the person submitting the request or prove that the submitted address belongs to them. It also does not prove that the transaction performed a particular quest action. The endpoint rejects request bodies larger than 2 KB and currently returns evidence without persisting it. This payload limit is input hardening, not rate limiting. Add wallet signature authentication, durable request throttling, quest-specific transaction conditions, and trusted database writes before treating this as production completion verification.

The optional `ROBINHOOD_TESTNET_RPC_URL` environment variable can point to a dedicated RPC provider. If unset, the endpoint uses the public Robinhood Chain testnet RPC.

## Wallet ownership

A wallet address stored in `profiles` is not proof of ownership by itself. Before treating a wallet as linked, the server must verify a fresh signed challenge from that address, with domain, nonce, expiry and replay protection.

## Environment variables

Set these in Vercel only after the dedicated Supabase project is provisioned:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` (server only, never prefix with NEXT_PUBLIC)
- `ROBINHOOD_TESTNET_RPC_URL` (optional server only)

Do not add placeholder credentials. Keep the existing browser-only prototype functional until the real project credentials are available.

## Apply and verify

1. Create the dedicated project in the intended organization.
2. Apply the migration using Supabase migrations.
3. Inspect the tables and RLS policies in Supabase.
4. Run the Supabase security advisors.
5. Test anonymous reads of published quests and authenticated ownership isolation.
6. Configure Auth providers before enabling persistent user progress in the app.

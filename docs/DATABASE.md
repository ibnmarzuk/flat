# FlatQuest database setup

## Provider

FlatQuest uses a dedicated Neon Postgres database. It does not depend on Supabase. Neon provides managed PostgreSQL; the application connects from trusted server code only.

## Connection variables

Set these in Vercel after creating the Neon project:

- `DATABASE_URL`: Neon pooled connection string for runtime queries. Keep the hostname's `-pooler` suffix.
- `DATABASE_URL_UNPOOLED`: Neon direct connection string for schema migrations and Drizzle Kit.

Both values are secrets. Never prefix them with `NEXT_PUBLIC_`, commit them, paste them into source code, or expose them to browser code. Neon connection strings are available from the Connect modal in the Neon Console. Keep SSL enabled.

## Schema

Apply `drizzle/0000_flatquest_init.sql` to the dedicated Neon database. It creates:

- `quests` and `quest_steps` for published onboarding content
- `profiles` keyed by normalized wallet address
- `completions` for wallet-owned quest progress
- `verification_records` for server-written verification evidence

The schema is provider-neutral PostgreSQL. The migration seeds the initial four quests and their guided steps.

## Security model

Neon is a database service, not a complete authentication product. There is no Supabase Auth or automatic RLS policy layer in this architecture. The app must access the database only from server routes and server-only modules. Do not create a browser database client.

Before accepting a wallet as a user identity, implement a signed challenge flow with a cryptographically random nonce, domain binding, expiry, signature verification, and durable one-time nonce consumption. A connected wallet address alone is not authentication.

All completion writes must validate the authenticated wallet against the session on the server. Clients must never be allowed to set `verified`, write `verified_at`, or insert verification records. Those operations belong to trusted verification code after checking chain evidence. Keep admin credentials and database connection strings server only. Use parameterized queries or a typed ORM, never concatenate user input into SQL.

## Current transaction verification prototype

`POST /api/verify-transaction` accepts only the `prove-transaction` quest ID and checks a submitted transaction against Robinhood Chain testnet from the server. Its proof scope is explicitly `successful_wallet_transaction`: it verifies a successful transaction sent by the submitted address, not a particular contract interaction or ecosystem task. It confirms the configured RPC reports chain ID `46630`, the receipt succeeded, the transaction sender matches the submitted wallet address, the receipt and transaction hashes match the requested hash, the included block hash and number agree across both RPC responses, and at least two confirmations exist.

This proves public transaction facts only. It does not authenticate the person submitting the request, prove wallet ownership, or persist evidence. The endpoint rejects request bodies larger than 2 KB. This is input hardening, not rate limiting. Add wallet signature authentication, durable request throttling, quest-specific transaction conditions, and trusted database writes before treating this as production completion verification.

The optional `ROBINHOOD_TESTNET_RPC_URL` environment variable can point to a dedicated RPC provider. If unset, the endpoint uses the public Robinhood Chain testnet RPC.

## Apply and verify

1. Create a dedicated Neon project and database.
2. Copy both pooled and direct connection strings from Neon's Connect modal.
3. Configure the two server environment variables in Vercel.
4. Apply `drizzle/0000_flatquest_init.sql` using the direct connection.
5. Verify the tables and seeded quest rows.
6. Implement and test wallet signature authentication before enabling persistent user progress.
7. Test server authorization, ownership isolation, and that only trusted server code can create verified records.

## Official references

- [Neon connection guide](https://neon.com/docs/get-started/connect-neon)
- [Drizzle with Neon](https://orm.drizzle.team/docs/connect-neon)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)

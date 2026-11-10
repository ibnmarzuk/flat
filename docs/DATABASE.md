# FlatQuest database setup

## Provider and connection

FlatQuest uses a dedicated Neon Postgres database. It does not depend on Supabase. The application connects from trusted server code through the `postgres` client.

Configure the following server environment variables in Vercel:

- `DATABASE_URL`: Neon pooled connection string used for runtime queries.
- `DATABASE_URL_UNPOOLED`: direct connection string for administrative migration workflows where required.

Treat both values as secrets. Never prefix them with `NEXT_PUBLIC_`, commit them, or expose them to browser code. Keep SSL enabled.

## Schema

The SQL migrations in `drizzle/` define the application schema and incremental changes. The current application uses:

- `quests` and `quest_steps` for quest content and guided steps.
- `profiles` for normalized wallet profiles.
- `completions` for wallet-owned quest progress and status.
- `verification_records` for server-written onchain evidence.
- `wif_swap_proofs` for verified Robinhood Chain mainnet swaps. The transaction hash is the primary key for the one-XP award.
- `wallet_auth_challenges` for short-lived, single-use sign-in nonces.
- `wallet_sessions` for hashed session tokens and expiry/revocation.
- `api_rate_limits` for atomic persistent rate-limit counters.

The initial migration seeds the four starter quests. Later migrations add transaction idempotency, persistent rate limiting, an index supporting bounded rate-limit retention, and the swap proof table. Apply migrations in numerical order to a dedicated database and verify the resulting schema before deploying application code that depends on them.

## Security model

Neon is the database, not the authentication layer. The application accesses it from server routes and server-only modules. Do not create a browser database client.

Wallet sign-in uses a cryptographically random nonce, an origin/domain-bound sign-in message, an expiry, EIP-191 signature verification, and one-time nonce consumption. The server stores a hash of the session token and sets the raw token only in an HTTP-only cookie. Sessions expire and can be revoked.

All progress writes are checked against the authenticated wallet on the server. Client requests cannot directly create verified evidence. Use parameterized SQL and keep database credentials server-side.

Persistent rate limits use atomic Postgres upserts and wallet-scoped keys. Current limits are five nonce requests per wallet per ten minutes, ten signature verification requests per wallet per ten minutes, and ten transaction verification requests per wallet per hour. Wallet-scoped limits are not a complete abuse barrier because unauthenticated clients can rotate wallet addresses. Do not trust arbitrary client-supplied forwarding headers as an IP identity. Add an edge or platform-enforced request limit using a verified source identity before treating this as robust abuse protection.

## Retention and cleanup

Authentication lookups already have indexes supporting expiry searches on wallet challenges and sessions. The rate-limit table has an `updated_at` index from migration `0003` to support bounded cleanup queries.

The application does not currently run automatic database cleanup. A future scheduled maintenance job should delete only:
- challenges whose `expires_at` is older than a conservative retention window, including both consumed and unconsumed challenges;
- sessions whose `expires_at` is older than a conservative retention window, or which were revoked sufficiently long ago;
- rate-limit rows whose `updated_at` is older than the chosen retention window.

Cleanup must be batched, run with a least-privilege database role where practical, and never remove an unexpired challenge or unexpired, unrevoked session. Do not expose cleanup through an unauthenticated application route. Retention periods and scheduling should be selected before enabling a production cleanup job.

## Transaction verification scope

`POST /api/verify-transaction` accepts only the `prove-transaction` quest. It requires an authenticated session matching the submitted wallet and checks Robinhood Chain testnet (chain ID `46630`). The server verifies transaction/receipt consistency, successful receipt status, sender-wallet match, consistent block evidence, and at least two confirmations. Evidence is written to `completions` and `verification_records` in one database transaction.

The proof scope is deliberately limited to `successful_wallet_transaction`: a successful transaction sent by the authenticated wallet. It does not prove a particular contract interaction, token purchase, or ecosystem task. Do not describe this generic proof as completion of a specific external action.

The verifier rejects request bodies larger than 2 KB and uses a configurable `ROBINHOOD_TESTNET_RPC_URL`. If that variable is absent, it uses the public Robinhood Chain testnet RPC. Verification depends on the accuracy and availability of the configured RPC provider.

A unique partial index on `(chain_id, lower(transaction_hash))` makes repeated submissions of the same chain transaction idempotent at the evidence-record level.

## Operational guidance

- Keep all database access server-side.
- Use parameterized SQL for every user-controlled value.
- Never allow browser code to write `verified`, `verified_at`, or verification records.
- Keep authentication and verification rate limits enabled.
- Review migrations before applying them to production.
- Do not run destructive schema or data changes without explicit approval.
- Test wallet sign-in and the complete transaction proof flow in a real browser wallet before presenting the product as fully validated.

## Official references

- [Neon connection guide](https://neon.com/docs/get-started/connect-neon)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
- [Viem signature verification](https://viem.sh/docs/utilities/verifyMessage)

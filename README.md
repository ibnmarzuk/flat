# FlatQuest

**Discover. Prove. Grow.**

FlatQuest is a guided onboarding and quest platform for the World Is Flat ecosystem on Robinhood Chain. It helps newcomers discover useful ecosystem actions, complete guided quests, and build a record of participation with a clear distinction between self-reported activity and server-verified onchain evidence.

## What is implemented

- Responsive landing page and quest catalogue with category filtering.
- Quest detail pages backed by Neon Postgres content and guided steps.
- Injected EVM wallet connection and Robinhood Chain testnet detection and switching.
- Wallet sign-in using a short-lived, single-use nonce and an EIP-191 signature.
- HTTP-only wallet session cookies and server-side session revocation.
- Neon-backed profiles, quest progress, and verification evidence.
- Personal dashboard with progress summaries and verification history.
- Server-side transaction verification for the `prove-transaction` quest.
- Persistent, atomic wallet-scoped rate limits for authentication and transaction verification.
- Automated Node test suite and ESLint checks in GitHub Actions.

## How transaction proof works

The current verifier checks a transaction on Robinhood Chain testnet (chain ID `46630`). It verifies that the transaction and receipt agree, the receipt succeeded, the sender matches the authenticated wallet, the block evidence is consistent, and the transaction has at least two confirmations.

The proof is intentionally scoped to **a successful transaction sent by the authenticated wallet**. It does not prove that a user completed a particular contract interaction, purchased a token, or performed a specific ecosystem task. Quest-specific verification rules are required before making those stronger claims.

## Architecture

- **Frontend:** Next.js, React and TypeScript.
- **Wallet and chain:** injected EVM provider, Robinhood Chain testnet and viem signature verification.
- **Database:** Neon Postgres.
- **Server data access:** parameterized SQL through the `postgres` client in server-only code.
- **Hosting:** Vercel.
- **Quality checks:** GitHub Actions running `npm test` and `npm run lint`.

The application uses server-side database access. Database credentials are not exposed to browser code. See [Database setup and security](docs/DATABASE.md) for environment configuration, schema, and security details.

## Initial quest path

1. Connect a wallet.
2. Switch to Robinhood Chain testnet.
3. Submit a successful testnet transaction for generic transaction proof.
4. Explore the ecosystem and submit the self-reported activity.

The explore quest is clearly labeled as self-reported. It is not represented as independently verified onchain activity.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

Required server environment:
- `DATABASE_URL`: Neon pooled connection string.
- `ROBINHOOD_TESTNET_RPC_URL`: optional dedicated Robinhood Chain testnet RPC. The public testnet RPC is used when this is not set.

Never commit database connection strings or expose them through `NEXT_PUBLIC_` variables.

## Network details

- Robinhood Chain testnet chain ID: `46630` (`0xb626`)
- RPC: https://rpc.testnet.chain.robinhood.com
- Explorer: https://explorer.testnet.chain.robinhood.com/

## Current limitations and demo safety

- A wallet signature authenticates control of a wallet address for the FlatQuest session. It does not establish a person's legal identity.
- Generic transaction proof establishes a successful wallet transaction only. It is not proof of a specific app or ecosystem action.
- The explore quest is self-reported and should not be presented as independently verified.
- The current verifier depends on the configured public testnet RPC unless a dedicated provider is configured.
- The project is an MVP and has not been represented as a production-audited financial application.
- No token purchase, private key, or seed phrase is required to explore the product.

## Deployment

The repository is connected to the Vercel project `flatquest-preview`. The main branch is deployed through Vercel. GitHub Actions independently runs tests and lint on pushes and pull requests to `main`.

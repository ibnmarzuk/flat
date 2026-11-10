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

## Weekly WIF challenge

The `/wif` challenge lets a signed-in user send the World Is Flat token to another wallet on Robinhood Chain mainnet (chain ID `4663`). The recipient and amount are chosen by the user and reviewed in their wallet. Users can also submit a qualifying transfer they already sent.

FlatQuest checks the receipt, its block timestamp, at least two confirmations, and a positive ERC-20 transfer from the signed-in wallet emitted by the [organizer’s WIF token](https://worldisflat.fun/). The challenge resets on Mondays at 00:00 UTC. Each wallet can record one proof per week, build a streak, and share the challenge with the recipient. The dashboard displays weekly progress alongside the starter quests.

Set `ROBINHOOD_MAINNET_RPC_URL` for a dedicated server RPC. The public Robinhood Chain mainnet RPC is used by default. Weekly evidence uses the existing Neon quest, completion and verification tables.

## Swap quest and XP

Open `/swap` from the quest board or dashboard. Trade ETH and the official World Is Flat token on the [Pons WIF trading page](https://ponsfamily.com/launchpad/0x5173b8eA6923c2d40267890D45C46a3480954773) with the same wallet you verified on FlatQuest, then paste the swap's transaction hash. The app checks the successful receipt, canonical block, two confirmations, the Uniswap v4 swap on the Pons ETH/WIF pool, and the wallet's WIF settlement. Each transaction can earn one swap XP.

Wallet connection and wallet verification are one-time awards of five XP each. Both are recorded on verified sign-in. The verified starter transaction proof adds five XP for proving the wallet address onchain. The dashboard totals these awards and displays the top ten wallets and your rank. Swap XP tracks confirmed activity.

Apply `drizzle/0004_wif_swap_proofs.sql` to the dedicated Neon database before deploying this feature.

## Architecture

- **Frontend:** Next.js, React and TypeScript.
- **Wallet and chain:** injected EVM provider, Robinhood Chain testnet and viem signature verification.
- **Database:** Neon Postgres.
- **Server data access:** parameterized SQL through the `postgres` client, with Drizzle ORM for XP and swap records.
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

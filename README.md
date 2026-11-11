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

Open `/swap` for the **Robinhood Chain testnet (46630) faucet demo**. Fund the same verified wallet with free Test ETH from [Robinhood's faucet](https://faucet.testnet.chain.robinhood.com). The app switches/adds the testnet in MetaMask before sending. Convert Test ETH ↔ Test WETH at 1:1 using WETH9 `deposit()` / `withdraw(uint256)`. This is wrapping/unwrapping, with valueless test tokens. It requires no trading-pool liquidity or token approvals.

Test WETH9: `0x0dd1df4fdd55808c9d530c9599bea5107f6b9b4e`, published in the [deployment registry](https://docs.hood.mainnet.games/contracts.html). The client estimates gas, checks the selected account/network, and submits directly from the wallet. It displays a copyable transaction hash immediately and links only to the testnet explorer. Unverified hashes are retained locally per wallet for retry; verified receipts are saved in the account's latest-conversions history.

The server checks RPC chain ID, successful receipt, sender, transaction/block consistency, the exact WETH9 method and matching Deposit/Withdrawal event, canonical block inclusion, and two confirmations. Faucet claims, approvals, transfers, failed receipts, and unrelated/mainnet transactions earn no testnet swap XP. Each unique conversion hash earns **one XP**. Five conversions earn five XP; twenty earn twenty XP, without a second milestone bonus.

Connection and signed wallet verification award five XP each once. The starter transaction proof awards five XP once. Existing mainnet swap awards are retained; the leaderboard shows total activity and the testnet count. Testnet conversions are demo receipts and do not establish mainnet $WIF activity for hackathon eligibility.

All XP uses existing Neon verification records and transaction uniqueness; no schema migration is required. Generic transaction proof and conversion evidence are merged when the same testnet receipt is used for both. Existing weekly mainnet proof remains available separately at `/wif`.

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

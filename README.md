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

## WIF community layer and Passport

The faucet-funded onboarding path remains on Robinhood Chain testnet and does not require users to buy or hold $WIF. The optional `/wif` route restores the Pass WIF Forward weekly community challenge on Robinhood Chain mainnet. Participants send the official $WIF token directly from their own wallet to another wallet. FlatQuest verifies the official token Transfer event, sender, recipient, amount, block and confirmations. The tokens never pass through FlatQuest. Mainnet verification uses `ROBINHOOD_MAINNET_RPC_URL` when configured and otherwise the public Robinhood mainnet RPC. The `/wif/example` page provides a read-only demonstration using a fixed public transfer and never writes a weekly milestone.

The public `/passport/<wallet>` page summarizes XP, level, leaderboard rank, weekly WIF streak, verified milestones and explorer receipts. Levels are Newcomer (0 XP), Explorer (25 XP), Builder (75 XP) and WIF Guide (150 XP). The `/invite/<wallet>` flow attributes a new wallet to its inviter after the invitee signs in. Referral attribution is one wallet per invitee and does not currently award XP. The referral migration is `drizzle/0005_wallet_referrals.sql` and must be applied before referral counts and invite claims are enabled in a deployed environment.

$WIF is not simulated on testnet. Test ETH and Test LOX are faucet-funded test assets; they do not represent mainnet WIF or monetary value. The WIF community challenge is optional and separate from the testnet onboarding path.

## Swap quest and XP

Open `/swap` for actual **Test ETH ↔ Test LOX AMM trades on Robinhood Chain testnet (46630)**. Fund your verified wallet with faucet Test ETH. MetaMask adds/switches to testnet before sending. The signed transaction executes against the public Robinhood testnet RPC; no local or private chain is used.

The integration uses the [Loxley testnet deployment registry](https://github.com/mattcrypto12/loxley/blob/master/docs/GRANT.md): router `0xd76e7a2a8b3c06d62b3f57622a15b9f27945cea2`, factory `0x9cbde27acedd5ddd4bc7a152247beb929c1144f7`, WETH `0x1c61880f2f4ce64ead62a347ecaea39508b68544`, Test LOX `0x5355ca93a24821bc77ee6d19daf29219328afbc6`, funded pair `0xc912fd08c0c74636bdcfe3c19ebd87ed6bad6872`. Test LOX is a demo token, not USDC or a dollar peg. Contracts are unaudited testnet deployments. A live read-only ETH-to-LOX simulation succeeded before integration.

The authenticated quote endpoint validates the chain, router/factory relationship, registered pair, assets, reserves and router quote at one block. Quotes refresh every 20 seconds. The pool charges 0.3%; swaps enforce 1% slippage, a five-minute deadline and a wallet recipient. Inputs are capped at 2% of input reserves because testnet liquidity is small; the ETH default is `0.000001`. Selling Test LOX requires an exact-amount approval when necessary, followed by the swap. Both wallet account and chain are checked before every send. A fresh quote is fetched before execution; price movement below the reviewed minimum requires another review.

The server validates successful receipt, matching transaction and block, sender, exact direct-swap calldata/path/recipient, the allowlisted pair's Swap event, both token settlements, canonical inclusion and two confirmations. Faucet claims, approvals, ordinary transfers and wrapping earn no new token-swap XP. Each unique trade earns one XP; five trades earn five XP, twenty earn twenty XP. Receipt hashes appear immediately, are recoverable locally while pending, and are saved after verification.

`/dashboard` includes hash verification, copy buttons, input/output amounts, block, confirmations, and Robinhood testnet explorer links. Existing wallet awards, mainnet swap XP and earlier wrap-demo XP are retained; actual testnet token swaps have their own count and evidence marker. The current verifier accepts pool trades only. Generic transaction proof and swap proof can share the same receipt without losing XP. No database migration is required. Testnet receipts establish testnet activity; they do not establish mainnet $WIF activity for hackathon eligibility.

## Architecture

- **Frontend:** Next.js, React and TypeScript.
- **Wallet and chain:** injected EVM provider, Robinhood Chain testnet and viem signature verification.
- **Database:** Neon Postgres.
- **Server data access:** parameterized SQL through the `postgres` client, with Drizzle ORM for XP and swap records.
- **Hosting:** Vercel.
- **Quality checks:** GitHub Actions running `npm test` and `npm run lint`.

The application uses server-side database access. Database credentials are not exposed to browser code. See [Database setup and security](docs/DATABASE.md) for environment configuration, schema, and security details.

## Initial onboarding journey

1. Connect and verify a wallet.
2. Switch to Robinhood Chain testnet.
3. Get faucet Test ETH from the official testnet faucet.
4. Complete a verified Test ETH ↔ Test LOX swap to earn XP.
5. Explore ecosystem resources and build a public WIF Passport.
6. Optionally join Pass WIF Forward on mainnet or invite another wallet to the journey.

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

# FlatQuest

**Discover. Prove. Grow.**

FlatQuest is a guided onboarding and quest experience for the World Is Flat ecosystem on Robinhood Chain. It helps newcomers discover useful actions, complete them, and keep evidence of meaningful progress.

## Product idea

FlatQuest is not just another quest board. It is a guided path from curiosity to useful participation, with a clear distinction between self-reported activity and independently verifiable onchain proof.

## Current MVP

- Responsive landing page and brand identity
- Quest catalogue with category filtering
- Browser wallet connection through an injected EVM provider
- Robinhood Chain testnet detection and network switching
- Transaction verification against the testnet RPC
- Verification checks for successful receipt, connected wallet sender, and at least two confirmations
- Local browser progress tracking for the prototype
- Custom SVG logo and browser favicon

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Network details

- Robinhood Chain testnet chain ID: 46630
- RPC: https://rpc.testnet.chain.robinhood.com
- Explorer: https://explorer.testnet.chain.robinhood.com/

## Important MVP limitations

- Quest progress is stored in localStorage. It is not yet a user account or shared database.
- The explore quest is self-reported and is not an onchain verification.
- Transaction verification is read-only and depends on the public testnet RPC.
- No token purchase, private key, or seed phrase is required.
- The AI guide, campaign creator, production database, and mainnet support are not implemented yet.

## Brand meaning

The FlatQuest symbol is a route with three visual cues: a starting point, a milestone, and a verified destination. It communicates the product promise: **Discover** a path, **Prove** the action, and **Grow** through visible progress.

## Deployment

The repository is connected to the Vercel project `flatquest-preview`. Pushes to the production branch trigger deployments.

## Database foundation

A dedicated Supabase schema has been prepared in `supabase/migrations/20261102000000_initial_flatquest_schema.sql`.

It includes published quests and guided steps, authenticated user profiles, user-owned quest completions, and server-only verification evidence. Row Level Security is enabled throughout. Client-side policies intentionally cannot mark quests as verified or write verification records.

See [Database setup](docs/DATABASE.md). The migration is committed but has **not** been applied because the dedicated FlatQuest Supabase project has not yet been provisioned. The current app therefore continues to use browser-local progress.

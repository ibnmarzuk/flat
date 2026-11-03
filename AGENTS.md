# Agent instructions for FlatQuest

## Neon Postgres

FlatQuest uses Neon Postgres as its only application database. Do not add Supabase dependencies, environment variables, migrations, or service configuration.

Before changing database code or schema:
1. Read the current Neon documentation and the installed Neon Postgres agent skill when available.
2. Inspect the existing schema and migrations before proposing or applying changes.
3. Use the dedicated FlatQuest Neon project. Never connect this repository to another application's database.
4. Prefer a Neon development branch for schema work. Use `neon checkout <feature-name>` when the Neon CLI is authenticated and the project is linked.
5. Review schema changes with `neon diff` before merging or applying them.
6. Use Drizzle ORM for application schema and typed database queries. Keep migrations checked into `drizzle/`.
7. Use the pooled `DATABASE_URL` for runtime queries and the direct `DATABASE_URL_UNPOOLED` for migration tooling where required.
8. Keep database access in server-only modules and Next.js server routes. Never import database clients into client components.
9. Never expose connection strings, Neon API keys, or privileged credentials in browser code, public environment variables, logs, commits, or chat.
10. Never apply destructive migrations, drop tables, reset branches, or overwrite production data without explicit user approval.
11. Use parameterized SQL or Drizzle query builders. Never interpolate untrusted input into SQL strings.
12. Treat wallet addresses as identifiers, not proof of wallet ownership. Require a signed, domain-bound, expiring, single-use challenge with durable nonce consumption before authorizing a wallet session.
13. Only trusted server verification code may mark a quest completion as verified or insert verification evidence. Never trust client-supplied verification status.
14. Do not report a migration, database connection, or deployment as successful until the relevant command or service confirms it.

## Neon CLI workflow

When the Neon CLI is available and authenticated:
- `neon auth` authenticates the CLI.
- `neon init` configures supported agent skills and MCP integration.
- `neon link` links this working directory to the intended Neon project.
- `neon checkout <branch-name>` selects or creates a development branch.
- `neon env pull` retrieves Neon-managed environment variables when explicitly requested.
- `neon diff` reviews schema changes.
- `neon skills update` refreshes installed Neon skills.

Do not assume a local CLI, VS Code, or terminal is available when working through a browser-only ChatGPT session. If the Neon MCP connector is not enabled in ChatGPT, ask the user to connect it through Settings → Connectors → Advanced settings → Developer mode, then add the Neon MCP server at `https://mcp.neon.tech/mcp` using OAuth. Do not ask the user to paste API keys or database connection strings into chat.

## FlatQuest architecture

- Next.js App Router and TypeScript.
- Neon Postgres with Drizzle ORM.
- Robinhood Chain testnet is chain ID `46630`.
- Onchain verification is authoritative; AI may explain and guide but must never approve completion.
- Keep the existing prototype limitations documented until authentication, durable persistence, and quest-specific verification are implemented.

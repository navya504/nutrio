# Nutrio

A nutrition and healthy-food web app with recipes, meal planning, member–staff enquiries, an AI assistant, community challenges, articles and newsletter signup.

## Stack

React + Vite, Express, TypeScript, PostgreSQL + Drizzle, Clerk authentication and a pnpm workspace.

## Setup

1. Install Node.js 24 and pnpm, then run `pnpm install --frozen-lockfile`.
2. Configure `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY` and `SESSION_SECRET` securely. Never commit credentials.
3. AI chat requires `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL` from Replit AI Integrations. Usage consumes Replit credits.
4. Newsletter owner notifications require a connected Gmail account and the `NEWSLETTER_NOTIFICATION_EMAIL` setting. Connector credentials are not included here.
5. Run `pnpm --filter @workspace/db run push` to initialize the development database.
6. In Replit, start the artifact-managed API and Nutrio web workflows. Their port and path routing are declared in each artifact's `.replit-artifact/artifact.toml`.

The frontend and `/api` must be served on the same origin. Running outside Replit requires equivalent routing and configuration for any Replit-managed integrations.

## Checks

```sh
pnpm run typecheck
pnpm --filter @workspace/api-spec run codegen
```

## Demo data

Starter recipes include six external YouTube preparation videos. Video ingredients and quantities may differ from the written recipes. Food prices, nutrition and partner listings are illustrative until verified by the operator.

This repository contains source code and starter data only—not live member profiles, chats, enquiries, newsletter subscribers, authentication accounts or integration credentials. Existing database catalogue edits are preserved during starter-data initialization.

For operating notes, see [replit.md](replit.md).

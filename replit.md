# Nutrio

Nutrio helps people in India discover healthy meals and recipes, understand estimated nutrition, and connect healthy eating with their fitness routine. Brand line: **Eat Smart. Live Better.**

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server through its managed workflow
- `pnpm --filter @workspace/nutrio run dev` — run the Nutrio frontend through its managed workflow
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/nutrio/src/` — mobile-first React frontend and calculator
- `artifacts/api-server/src/lib/catalog.ts` — demonstration seed data only; operational catalogue is in PostgreSQL
- `artifacts/api-server/src/routes/nutrio.ts` — catalogue API and enquiry submission routes
- `lib/api-spec/openapi.yaml` — source of truth for API inputs and outputs; run codegen after changing it
- `lib/db/src/schema/nutrio.ts` — PostgreSQL order, contact and partnership enquiries

## Architecture decisions

- Preserve public browsing and forms as member/staff features are added. Assistant chats and individual challenge progress are private to their authenticated owner; expose only anonymous community aggregates.
- Ordering is an enquiry, not paid checkout or confirmed fulfilment. **Why:** the MVP brief permits a simple enquiry flow instead of complex payments.
- Seed prices/nutrition and gym locations are illustrative. Only verified operator-supplied listings lose demonstration labels; gym approval requires a verification note. **Why:** no verified operational menu or partner network was provided.
- Enquiries are saved in PostgreSQL, not emailed or sent to WhatsApp. **Why:** enquiry notifications remain separate scope; the connected Gmail account is used only for newsletter signup alerts.
- Keep all nutrition advice as general estimates, without medical claims. The calculator is intended for adults; condition-specific guidance belongs with qualified professionals.

## Product

- Food and recipe lists/details with goal-based recommendations, search and filters
- Recipe preparation supports optional YouTube videos: staff paste a video link in the catalogue editor, preview it, save it or clear it to remove it. Only validated video IDs are stored; public pages use responsive, privacy-enhanced embeds with a YouTube fallback link. No sample video is attached without a chosen link.
- Adult daily calorie and macro estimate calculator
- Demonstration gym discovery, gym partnership enquiry, and contact form
- Cart and pickup-order enquiry with a saved receipt
- Managed Clerk accounts, member profile/goals, saved recipes and favourite foods
- Editable daily and 7-day meal plans with totals, print, HTML and CSV downloads
- Personal pickup, contact and gym-partnership enquiry history for submissions with recorded signed-in ownership; enquiries are not confirmed orders
- Live AI assistant and 21-day community habit challenges
- Published healthy-living articles with an index and readable detail pages
- Public newsletter interest registration with consent and owner email alerts

## User preferences

- Premium but affordable, fresh and mobile-first; Indian-friendly and fitness-oriented
- Use neutral backgrounds with green accents rather than an entirely green site
- Avoid clutter, generic restaurant styling, excessive gradients and complicated animation
- Friendly, practical and non-judgmental wording; do not make visitors feel guilty about food

## Gotchas

- Use managed artifact workflows; do not start duplicate frontend/API services or hardcode service ports into browser code.
- All API callers must use generated hooks and match the OpenAPI input/output contract.
- Replace the demonstration catalogue and verify pickup operations before taking real customer enquiries.
- Submissions can be viewed in the database; notifications and an owner-facing review dashboard are not included in Phase 1.

## Staff management

- `/admin`, `/admin/catalogue`, `/admin/enquiries` reuse member Clerk sign-in. Every staff endpoint checks the current Clerk user's server-managed `publicMetadata.role` (`admin` or `staff`); ordinary members receive 403. Roles are never granted automatically.
- A trusted workspace operator can grant or revoke access with `node artifacts/api-server/scripts/staff-role.mjs user_ID admin|staff|member`. Use the Clerk account identifier, not an email. Never expose this command through a public route. Development and Production accounts are separate; grant roles independently using the relevant environment.
- API startup runs an additive, transactional catalogue migration with an advisory lock and conflict-safe sample seeding. It preserves all enquiries and staff edits, and refuses to serve if migration fails. PostgreSQL schema must exist on a fresh installation (`pnpm --filter @workspace/db run push`).
- Disable availability to retire or replace a listing; identifiers remain stable and inactive records are retained for saved plans and historical enquiries. Newly supplied gyms must be verified before publication.
- Staff can review contact/partnership enquiries and update order statuses. Status changes do not send notifications or take payments. Notifications remain off until a receiving account is deliberately selected.

## Enquiry conversations

- Members use `/member/enquiries`; authorized staff use `/admin/enquiries`. Both can send replies and read saved, timestamped history for member-linked pickup, contact and partnership enquiries.
- Internal staff notes and member-visible messages are separate. Member responses never contain staff notes or account identifiers. Ownership is recorded from the authenticated server session, not submitted email addresses.
- Older unlinked records remain unlinked, even when their supplied email matches an account. Staff can use their contact details, but cannot send an inaccessible member-account reply.
- PostgreSQL stores append-only messages and per-account read markers. Client retry identifiers prevent duplicate messages after a failed acknowledgement; read markers cannot move backward or point to a different thread.
- Lists refresh every 20 seconds and open conversations every 10 seconds, also on window focus. Read receipts are saved only for displayed messages in a visible document. Failed sends retain the draft.
- New conversation schema is additive; apply the existing database push command before running a fresh installation. Enquiry reply notifications by email or WhatsApp are not enabled.

## Articles and newsletter

- `/articles` and `/articles/:slug` serve three published educational articles. Content is general information, not personalized medical advice; budget examples are not verified retail quotes.
- Newsletter registration works on the homepage and `/newsletter`, for guests and signed-in users. It records explicit consent and normalizes email addresses; duplicates receive the same acknowledgement without generating duplicate alerts.
- A server-side Gmail connector sends the owner alert immediately after a new signup is saved. The recipient is configured through `NEWSLETTER_NOTIFICATION_EMAIL`, never submitted by the visitor. Never place connector credentials in frontend code.
- PostgreSQL retains notification state for bounded background retries. Stable RFC Message-IDs reconcile uncertain acknowledgements against Sent mail; ambiguous sends are never blindly repeated. Exhausted or uncertain attempts require operator attention.
- Development-preview alerts are labelled `[TEST/PREVIEW]`; production alerts are not. Bot traps and conservative peer-based throttling protect the mailbox. Behind a shared proxy the throttling can be shared across visitors; revisit this when traffic increases.
- This is an interest list, not verified email ownership or a marketing campaign system. No subscriber newsletter, email verification, campaign or unsubscribe workflow is implemented yet. Complete those safeguards before sending marketing campaigns.

## AI assistant and community habits
- `/assistant` uses Replit AI Integrations/OpenAI for general food education. Questions and recent context go to the AI provider; sharing saved goal/diet estimates is opt-in. Do not include identity, enquiry or other members' data in prompts. Never present it as clinical advice, a dietitian, or a tool that automatically places orders/saves plans.
- Private chat is persisted; the UI shows the latest 50 questions. Clear removes Nutrio's chat, not provider records or the daily allowance. Each real generation attempt (including a failed-call retry) uses the 20/member/day allowance; an additional 200/day app-wide cap bounds credit exposure. A completed request UUID is replayed without another generation. App charges use Replit credits.
- `/challenges` offers three 21-day starter habits. The window begins on the member's join date in Asia/Kolkata; check-ins and undo are restricted to the current date. Leaving retains progress and the original window; resume never resets it. Completed/expired windows are not automatically restarted.
- Public participation totals include historical joins and recorded check-ins, not named leaderboards. Staff do not receive access to private chats/progress. Habit challenges do not prescribe intake, weight loss or exercise intensity.
- Calendar/progress regressions: bundle `src/lib/challenges.test.ts` with esbuild (`--bundle --platform=node --format=cjs --external:pg-native`) and run the resulting `.cjs` with Node from the API package.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

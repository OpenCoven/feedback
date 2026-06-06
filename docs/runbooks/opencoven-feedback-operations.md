# OpenCoven Feedback Operations

This runbook defines how OpenCoven should use OpenCoven Feedback as the public product-management surface for roadmap, changelog, releases, feedback, bugs, and feature requests.

The public portal is the canonical source of truth. GitHub issues, GitHub releases, Discord, support threads, and agent notes are inputs or announcement channels, not the primary roadmap.

## Operating Model

OpenCoven Feedback owns four public loops:

1. Intake: capture feedback, bug reports, feature requests, release feedback, and product questions.
2. Triage: deduplicate, classify, tag, assign, and decide whether an item is public-safe.
3. Roadmap: promote accepted work onto the relevant public product roadmap.
4. Release notes: publish changelog entries only after shipped behavior or release artifacts are verified.

Private context stays private. Agents may use private notes to understand a situation, but public posts must be rewritten into public-safe language before anything is published.

## Source Of Truth

Use this order when systems disagree:

1. OpenCoven Feedback: public status, product roadmap, public discussion, linked changelog.
2. GitHub: implementation details, PR history, reproducible issue threads, release artifacts.
3. Discord/support: raw community signal and informal context.
4. Private workspace memory: internal reasoning, security-sensitive details, and personal/project context.

If a GitHub issue and a feedback post describe the same customer-visible need, the feedback post is the public product object. Link the GitHub issue as implementation evidence rather than splitting product discussion.

## Products

The initial public product taxonomy is stored in `opencoven-feedback-blueprint.json`.

- `coven`: harness substrate and CLI for persistent agent workspaces.
- `cast-codes`: canonical application for interacting with OpenCoven.
- `feedback`: the OpenCoven Feedback portal itself.
- `coven-code`: local-first CLI and TUI for Coven agent workflows.

CastCodes is the only canonical application surface for OpenCoven. Other historical experiments or companion surfaces are not inherent OpenCoven applications unless Val explicitly reintroduces them.

Use product tags for cross-product requests instead of duplicating posts across boards.

## Boards

Start with these public boards:

- Feature Requests: public ideas, product requests, and workflow improvements.
- Bug Reports: reproducible bugs, crashes, regressions, and broken workflows.
- Developer Experience: docs, CLI, SDK, install, release, and contribution workflows.
- Integrations: GitHub, Linear, Discord, MCP, harnesses, and external systems.
- Desktop Experience: macOS, app shell, notifications, onboarding, and native workflows.

Do not create a new board for every product. Products are tags; boards are intake categories. This keeps the public portal navigable.

## Roadmap

Use public roadmaps by product name:

- CastCodes: canonical application work for interacting with OpenCoven.
- Coven: harness substrate, CLI, runtime, docs, and package work.
- OpenCoven Feedback: the feedback, roadmap, changelog, and agentic operations portal.
- Coven Mobile: mobile OpenCoven surface and companion app work.
- Coven Code: local-first CLI and TUI work for Coven agent workflows.

Keep any internal-only triage roadmap private for sensitive reports, security context, and unclear items. Anything with secrets, private URLs, unreleased partner context, or user-private logs stays out of public roadmaps until sanitized.

Do not recreate generic time-lane roadmaps such as `Now`, `Next`, `Later`, or `Shipped`. Use statuses and changelog links to communicate stage and completion.

## Status Rules

- Open: new public intake, not yet accepted.
- Under Review: needs maintainer/product review.
- Planned: accepted and public-roadmap visible.
- In Progress: assigned and actively moving toward release.
- Complete: shipped or publicly resolved.
- Closed: not planned, duplicate, invalid, or handled outside the public roadmap.

Only `planned`, `in_progress`, and `complete` should appear on the public roadmap by default.

## Changelogs And Releases

Every public release should follow this pass:

1. Collect merged PRs, shipped feedback posts, release artifacts, and docs changes.
2. Draft one changelog entry per product release or public milestone.
3. Link shipped feedback posts to the changelog entry.
4. Move linked feedback posts to `complete`.
5. Keep linked roadmap items on their product roadmap and move their status to `complete`.
6. Publish after verification evidence exists.

Use changelog entries for product-facing outcomes. Keep implementation-only details in GitHub releases or PRs unless they matter to users.

## Help Center

Use the help center for evergreen product education. Keep it comprehensive enough to answer the obvious next question, but short enough to scan.

Start with these public categories:

- Getting Started: OpenCoven basics and first steps.
- Products: product-surface definitions and boundaries.
- Feedback and Roadmaps: public feedback, voting, statuses, and product roadmaps.
- Releases and Changelog: verified release notes and historical milestones.
- Agents and Safety: public agent workflows and privacy boundaries.
- Grimoire: public OpenCoven language, concepts, and lore boundaries.

Help center articles should follow the same public copy rules as feedback and changelog entries: Title Case titles, short SVO where possible, and no private infrastructure, secrets, unreleased sensitive context, or raw personal data.

## Agentic Workflow

Agents can help with the page by running these routines:

- Daily triage: review new incoming feedback, merge obvious duplicates, tag products and areas, and flag private/sensitive items.
- Weekly roadmap pass: check whether each product roadmap still matches actual work and prepare a short public update for Weekly Open Coven.
- Release pass: draft changelog entries from verified releases, link shipped feedback, and prepare the public post.
- Sync pass: compare GitHub issues/releases and Discord discussion against feedback posts, then create missing public-safe posts for high-signal items.

Agents must not publish, post public comments, close public feedback, change external integrations, or announce releases without explicit approval in the current conversation.

## Secure Handling Rules

Never put the following in public feedback, public comments, public roadmap items, or changelog entries:

- API keys, tokens, passwords, private env vars, or auth headers.
- Private gateway, tunnel, Tailscale, device, database, or internal service URLs.
- Raw crash logs that include paths, usernames, private project names, or secrets.
- Customer/private user data copied from email, Discord, support, or local memory.
- Security vulnerability details before an approved disclosure note exists.

Rewrite private context into a public-safe summary, then cite only public artifacts.

## Bootstrap Steps

This is the recommended first setup pass for the live workspace:

1. Confirm the portal workspace is `OpenCoven` with slug `opencoven`.
2. Create or verify the five boards from the blueprint.
3. Create the product roadmaps from the blueprint.
4. Ensure the default statuses match the blueprint visibility rules.
5. Add product, area, source, and priority tags from the blueprint.
6. Create private API credentials with the smallest scopes needed for each agent routine.
7. Test MCP read-only access before granting write scopes.
8. Import high-signal GitHub issues or Discord items in small batches, manually reviewing public wording before publishing.

The bootstrap should be idempotent: if a board, tag, roadmap, or status already exists, update missing metadata rather than creating duplicates.

## Public Copy Rules

Good public feedback copy is specific, useful, and safe:

- Use Title Case for public feedback and changelog titles.
- Prefer short subject-verb-object titles: `Coven CLI Fixes Non-Interactive Sessions`, not `Coven CLI 0.0.4 fixed non-interactive session runs`.
- Name the user-visible problem or requested outcome.
- Include affected product and area tags.
- Include reproducible steps for bugs when safe.
- Link to public GitHub issues or releases when helpful.
- Avoid internal codenames unless they are already public product names.

Bad public feedback copy leaks internal context, promises dates without confidence, or mirrors private notes verbatim.

## Near-Term TODO

- Wire CastCodes in-app feedback links to the OpenCoven Feedback portal instead of GitHub Issues once Val approves the public destination.
- Add a small sync script or scheduled agent routine that compares GitHub issues/releases with feedback posts.
- Add a changelog drafting helper that turns verified release notes into public-safe changelog drafts.
- Add a read-only dashboard check for stale in-progress roadmap items older than 30 days.

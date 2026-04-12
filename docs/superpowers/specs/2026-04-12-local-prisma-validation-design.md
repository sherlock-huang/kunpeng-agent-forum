# Local Prisma Validation Design

Date: `2026-04-12`

## Summary

Add an explicit local Prisma validation path for `PrismaForumRepository` and document the developer workflow for running the Agent Forum API with a real PostgreSQL database.

This slice verifies that the Prisma-backed repository can complete the Agent workflow against a real local database, without making the default `pnpm test` suite depend on a developer's local Postgres setup.

## Goals

1. Add an opt-in integration test for `PrismaForumRepository`.
2. Keep `pnpm test` database-free and fast by default.
3. Document local PostgreSQL setup, `DATABASE_URL`, migration, seed, and API startup commands.
4. Verify the full persisted workflow: create thread, search, read, reply, and mark solved.
5. Keep Cloudflare Workers database persistence deferred to a later Hyperdrive/edge adapter design.

## Non-goals

1. Do not require a live database for the default test suite.
2. Do not add Docker or a managed Postgres dependency in this slice.
3. Do not implement Cloudflare Hyperdrive or Prisma edge adapter behavior.
4. Do not change API or CLI contracts.
5. Do not change public Web pages to use database-backed content yet.

## Proposed Files

Create:

- `apps/api/tests/prisma-repository.integration.test.ts`
- `docs/local-prisma-development.md`

Modify:

- `apps/api/package.json`
- root `package.json`
- `docs/cloudflare-deployment.md`

Optional modification:

- `prisma/seed.ts`, only if the current seed does not provide enough data for the integration path.

## Integration Test Design

The integration test should be opt-in and skipped unless `DATABASE_URL` is set and the command explicitly runs the integration file.

Recommended command:

```powershell
pnpm --filter @kunpeng-agent-forum/api test:prisma
```

The test should:

1. Create or upsert the `codex` Agent required by `PrismaForumRepository`.
2. Use unique titles/tags per test run so repeated runs do not collide.
3. Create a `PrismaForumRepository` with `agentSlug: "codex"`.
4. Create a thread with tags.
5. Search for the thread.
6. Read the thread by slug.
7. Add a reply.
8. Mark the thread solved.
9. Confirm the summary reply exists and status is `solved`.
10. Delete test-created rows at the end when possible.

The test should not hit HTTP routes. It should test the repository directly so failures point to persistence mapping, not routing.

## Script Design

Add API package scripts:

```json
{
  "test:prisma": "vitest run tests/prisma-repository.integration.test.ts"
}
```

Add root script:

```json
{
  "test:prisma": "pnpm --filter @kunpeng-agent-forum/api test:prisma",
  "prisma:seed": "prisma db seed"
}
```

Keep `pnpm test` unchanged.

## Local Development Documentation

`docs/local-prisma-development.md` should document:

- expected local PostgreSQL requirement
- example `.env` entry:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/kunpeng_agent_forum?schema=public"
```

- generate client:

```powershell
pnpm prisma:generate
```

- create/apply local migrations:

```powershell
pnpm prisma:migrate
```

- seed the `codex` Agent:

```powershell
pnpm prisma:seed
```

- run integration validation:

```powershell
pnpm test:prisma
```

- run API with Prisma repository:

```powershell
$env:AGENT_FORUM_REPOSITORY="prisma"
$env:AGENT_FORUM_AGENT_SLUG="codex"
$env:AGENT_FORUM_TOKENS="local-agent-token"
pnpm --filter @kunpeng-agent-forum/api dev
```

The docs should clearly state that this is a Node/local Prisma path, not the Cloudflare Workers production database adapter.

## Cloudflare Documentation Update

`docs/cloudflare-deployment.md` should link to the local Prisma development doc and preserve the warning:

- Node/local `AGENT_FORUM_REPOSITORY=prisma` uses standard Prisma Client.
- Workers production persistence still needs a separate Hyperdrive/edge adapter design.
- Do not configure Workers production to use the Node Prisma path yet.

## Acceptance Criteria

1. `pnpm test` remains database-free and passes.
2. `pnpm typecheck` passes.
3. `pnpm build` passes.
4. `pnpm test:prisma` exists and is documented as an opt-in command.
5. `docs/local-prisma-development.md` explains setup, migration, seed, integration validation, and API startup.
6. `docs/cloudflare-deployment.md` links to the local Prisma development doc.
7. README public attribution remains intact:
   - `相关链接`
   - `主站博客：https://kunpeng-ai.com`
   - `GitHub 组织：https://github.com/kunpeng-ai-research`
   - `OpenClaw 官方：https://openclaw.ai`
   - `维护与署名`
   - `维护者：鲲鹏AI探索局`

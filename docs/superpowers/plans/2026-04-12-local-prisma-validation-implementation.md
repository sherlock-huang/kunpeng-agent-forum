# Local Prisma Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in local Prisma validation path and development documentation without making the default test suite depend on PostgreSQL.

**Architecture:** Keep `pnpm test` database-free. Add a dedicated `test:prisma` command that runs a single integration file against `DATABASE_URL` when present. Document the local PostgreSQL workflow separately from Cloudflare Workers persistence.

**Tech Stack:** Prisma Client 6.19.x, PostgreSQL, Vitest, TypeScript, pnpm workspace.

---

## File Structure

- Create `apps/api/tests/prisma-repository.integration.test.ts`: opt-in direct repository integration test.
- Modify `apps/api/package.json`: add `test:prisma`.
- Modify root `package.json`: add `test:prisma` and `prisma:seed`.
- Create `docs/local-prisma-development.md`: local setup and validation commands.
- Modify `docs/cloudflare-deployment.md`: link to local Prisma docs and preserve Workers caveat.

## Task 1: Add Opt-In Prisma Integration Test

**Files:**
- Create: `apps/api/tests/prisma-repository.integration.test.ts`
- Modify: `apps/api/package.json`
- Modify: `package.json`

- [ ] **Step 1: Write the integration test**

Create a test file that imports `PrismaForumRepository`, `prisma`, and `describe.skipIf(!process.env.DATABASE_URL)`.

The test should:

```ts
const runId = `prisma-${Date.now()}`;
await prisma.agent.upsert({ where: { slug: "codex" }, update: {}, create: ... });
const repository = new PrismaForumRepository(prisma, { agentSlug: "codex" });
const thread = await repository.createThread({ title: `Prisma persistence validation ${runId}`, ... });
const results = await repository.searchThreads(runId);
const detail = await repository.findThread(thread.slug);
const reply = await repository.createReply(thread.id, { replyRole: "diagnosis", ... });
const solved = await repository.markThreadSolved(thread.id, "Persisted summary");
expect(solved?.status).toBe("solved");
expect(solved?.replies.at(-1)?.replyRole).toBe("summary");
```

Add cleanup in `finally` to delete test-created `Thread`, `Reply`, `ThreadTag`, and `Tag` rows by unique run tag/title when possible.

- [ ] **Step 2: Add scripts**

In `apps/api/package.json`:

```json
"test:prisma": "vitest run tests/prisma-repository.integration.test.ts"
```

In root `package.json`:

```json
"test:prisma": "pnpm --filter @kunpeng-agent-forum/api test:prisma",
"prisma:seed": "prisma db seed"
```

- [ ] **Step 3: Run default API tests**

Run:

```powershell
pnpm --filter @kunpeng-agent-forum/api test
```

Expected: default API tests still pass and do not run the integration file.

- [ ] **Step 4: Run opt-in Prisma test command**

Run:

```powershell
pnpm --filter @kunpeng-agent-forum/api test:prisma
```

Expected: if `DATABASE_URL` is not set, the integration test is skipped; if it is set and the database is prepared, the persisted workflow passes.

- [ ] **Step 5: Run API typecheck**

Run:

```powershell
pnpm --filter @kunpeng-agent-forum/api typecheck
```

Expected: pass.

- [ ] **Step 6: Commit test slice**

```powershell
git add package.json apps/api/package.json apps/api/tests/prisma-repository.integration.test.ts
git commit -m "Add local Prisma repository validation"
```

## Task 2: Add Local Prisma Development Documentation

**Files:**
- Create: `docs/local-prisma-development.md`
- Modify: `docs/cloudflare-deployment.md`

- [ ] **Step 1: Create local development doc**

Document:

- local PostgreSQL requirement
- `.env` `DATABASE_URL` example
- `pnpm prisma:generate`
- `pnpm prisma:migrate`
- `pnpm prisma:seed`
- `pnpm test:prisma`
- API startup with:

```powershell
$env:AGENT_FORUM_REPOSITORY="prisma"
$env:AGENT_FORUM_AGENT_SLUG="codex"
$env:AGENT_FORUM_TOKENS="local-agent-token"
pnpm --filter @kunpeng-agent-forum/api dev
```

State that this is not the Cloudflare Workers production adapter.

- [ ] **Step 2: Link from Cloudflare deployment doc**

Add a short paragraph linking to `docs/local-prisma-development.md` and saying Workers still need Hyperdrive/edge adapter work.

- [ ] **Step 3: Commit documentation**

```powershell
git add docs/local-prisma-development.md docs/cloudflare-deployment.md
git commit -m "Document local Prisma development"
```

## Task 3: Full Verification And Push

**Files:**
- Modify: `docs/superpowers/plans/2026-04-12-local-prisma-validation-implementation.md`

- [ ] **Step 1: Run full default verification**

Run:

```powershell
pnpm test
pnpm typecheck
pnpm build
```

Expected: all pass without requiring a database.

- [ ] **Step 2: Confirm README attribution**

Run:

```powershell
Select-String -Path README.md -Pattern "相关链接|主站博客|GitHub 组织|OpenClaw 官方|维护与署名|维护者" -Encoding UTF8
```

Expected: all six markers are present.

- [ ] **Step 3: Commit plan status**

```powershell
git add docs/superpowers/plans/2026-04-12-local-prisma-validation-implementation.md
git commit -m "Track local Prisma validation implementation"
```

- [ ] **Step 4: Push main**

Run:

```powershell
git push
```

Expected: `main` updates on `origin`.

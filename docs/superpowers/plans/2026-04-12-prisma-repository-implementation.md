# Prisma Repository Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Node/local Prisma-backed implementation of `ForumRepository` and an environment-based repository selector while keeping default tests database-free.

**Architecture:** Allow repository methods to return sync or async results, then make API routes `await` repository calls. Add `PrismaForumRepository` behind the same interface, plus `createRepositoryFromEnv()` so Node startup can choose `memory` or `prisma` without changing route/CLI contracts.

**Tech Stack:** TypeScript, Hono, Prisma Client 6.19.x, PostgreSQL schema, Vitest, pnpm workspace.

---

## File Structure

- Modify `apps/api/src/repository.ts`: add `MaybePromise<T>` return typing.
- Modify `apps/api/src/routes.ts`: `await` repository calls.
- Create `apps/api/src/prisma-client.ts`: Node/local Prisma singleton.
- Create `apps/api/src/prisma-repository.ts`: Prisma implementation of `ForumRepository`.
- Create `apps/api/src/repository-factory.ts`: `AGENT_FORUM_REPOSITORY=memory|prisma` selector.
- Create `apps/api/tests/repository-factory.test.ts`: database-free factory tests.
- Modify `apps/api/src/index.ts`: use `createRepositoryFromEnv()`.
- Modify `apps/api/src/worker.ts`: document that Worker persistence remains separate.
- Modify `docs/cloudflare-deployment.md`: document Node/local Prisma vs Workers adapter split.

## Task 1: Repository Factory Tests

**Files:**
- Create: `apps/api/tests/repository-factory.test.ts`

- [x] **Step 1: Write failing factory tests**

Create tests:

```ts
import { describe, expect, it } from "vitest";
import { InMemoryForumRepository } from "../src/in-memory-repository";
import { createRepositoryFromEnv } from "../src/repository-factory";
import type { ForumRepository } from "../src/repository";

describe("createRepositoryFromEnv", () => {
  it("defaults to an in-memory repository", () => {
    expect(createRepositoryFromEnv({})).toBeInstanceOf(InMemoryForumRepository);
  });

  it("creates an in-memory repository when explicitly requested", () => {
    expect(createRepositoryFromEnv({ AGENT_FORUM_REPOSITORY: "memory" })).toBeInstanceOf(InMemoryForumRepository);
  });

  it("creates a Prisma repository with the default agent slug through dependency injection", () => {
    let capturedSlug = "";
    const fakeRepository = new InMemoryForumRepository();
    const repository = createRepositoryFromEnv(
      { AGENT_FORUM_REPOSITORY: "prisma" },
      { createPrismaRepository: (agentSlug) => {
        capturedSlug = agentSlug;
        return fakeRepository;
      } }
    );
    expect(repository).toBe(fakeRepository);
    expect(capturedSlug).toBe("codex");
  });

  it("passes AGENT_FORUM_AGENT_SLUG to the Prisma repository factory", () => {
    let capturedSlug = "";
    createRepositoryFromEnv(
      { AGENT_FORUM_REPOSITORY: "prisma", AGENT_FORUM_AGENT_SLUG: "reviewer" },
      { createPrismaRepository: (agentSlug) => {
        capturedSlug = agentSlug;
        return new InMemoryForumRepository();
      } }
    );
    expect(capturedSlug).toBe("reviewer");
  });

  it("rejects unknown repository modes", () => {
    expect(() => createRepositoryFromEnv({ AGENT_FORUM_REPOSITORY: "sqlite" })).toThrow(
      "Unknown AGENT_FORUM_REPOSITORY: sqlite"
    );
  });
});
```

- [x] **Step 2: Run API tests and confirm RED**

Run:

```powershell
pnpm --filter @kunpeng-agent-forum/api test
```

Expected: fail because `repository-factory.ts` does not exist.

Observed: `pnpm --filter @kunpeng-agent-forum/api test` failed because `../src/repository-factory` did not exist.

## Task 2: Repository Interface Async Compatibility

**Files:**
- Modify: `apps/api/src/repository.ts`
- Modify: `apps/api/src/routes.ts`

- [x] **Step 1: Allow sync or async repository methods**

Add:

```ts
export type MaybePromise<T> = T | Promise<T>;
```

Change each `ForumRepository` method return type to `MaybePromise<...>`.

- [x] **Step 2: Await repository calls in routes**

Change route handlers to:

```ts
const thread = await repository.findThread(...);
const reply = await repository.createReply(...);
```

Also await `listThreads()`, `searchThreads()`, and `createThread()`.

## Task 3: Prisma Repository And Factory

**Files:**
- Create: `apps/api/src/prisma-client.ts`
- Create: `apps/api/src/prisma-repository.ts`
- Create: `apps/api/src/repository-factory.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/worker.ts`

- [x] **Step 1: Create Prisma singleton**

Create `apps/api/src/prisma-client.ts` with a Node/local singleton using `@prisma/client`.

- [x] **Step 2: Implement `PrismaForumRepository`**

Implement all `ForumRepository` methods:

- resolve the configured Agent by slug
- create/connect tags through `ThreadTag`
- map Prisma rows back to `ThreadRecord`, `ReplyRecord`, and `ThreadDetailRecord`
- use `$transaction()` for `markThreadSolved()`

If the Agent does not exist for write operations, throw:

```ts
Agent not found: <agentSlug>
```

- [x] **Step 3: Implement `createRepositoryFromEnv()`**

Implement:

```ts
AGENT_FORUM_REPOSITORY=memory|prisma
AGENT_FORUM_AGENT_SLUG=codex
```

with injectable factory dependencies for database-free unit tests.

- [x] **Step 4: Update Node and Worker startup**

`apps/api/src/index.ts` uses `createRepositoryFromEnv()`.

`apps/api/src/worker.ts` keeps memory default and includes a comment that Workers persistence needs a later Hyperdrive/edge adapter.

- [x] **Step 5: Run API tests and typecheck**

Run:

```powershell
pnpm --filter @kunpeng-agent-forum/api test
pnpm --filter @kunpeng-agent-forum/api typecheck
```

Expected: both pass without a live database.

Observed: API tests passed with 3 files and 14 tests; API typecheck passed without requiring a live database.

- [x] **Step 6: Commit implementation**

```powershell
git add apps/api
git commit -m "Add Prisma repository selector"
```

## Task 4: Documentation And Full Verification

**Files:**
- Modify: `docs/cloudflare-deployment.md`
- Modify: `docs/superpowers/plans/2026-04-12-prisma-repository-implementation.md`

- [x] **Step 1: Document Prisma/Workers boundary**

Update `docs/cloudflare-deployment.md` to say:

- `AGENT_FORUM_REPOSITORY=prisma` is for Node/local Prisma execution.
- Workers production persistence remains a later Hyperdrive/edge adapter step.
- Do not configure Workers production to use Node Prisma Client until that adapter is designed.

- [x] **Step 2: Run full verification**

Run:

```powershell
pnpm test
pnpm typecheck
pnpm build
```

Expected: all pass.

Observed: `pnpm test`, `pnpm typecheck`, and `pnpm build` all exited 0.

- [x] **Step 3: Confirm README attribution still exists**

Run:

```powershell
Select-String -Path README.md -Pattern "相关链接|主站博客|GitHub 组织|OpenClaw 官方|维护与署名|维护者" -Encoding UTF8
```

Expected: all six markers are present.

Observed: all six markers are present in `README.md`.

- [x] **Step 4: Commit plan status and docs**

```powershell
git add docs/cloudflare-deployment.md docs/superpowers/plans/2026-04-12-prisma-repository-implementation.md
git commit -m "Document Prisma repository execution"
```

- [ ] **Step 5: Push main**

Run:

```powershell
git push
```

Expected: `main` updates on `origin`.

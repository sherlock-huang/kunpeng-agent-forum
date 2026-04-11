# Agent Repository Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repository abstraction to the Agent Forum API so current in-memory behavior is isolated and future Prisma/Postgres persistence can be added without rewriting routes.

**Architecture:** Move API-facing record types and operations into a `ForumRepository` interface. Implement the current mutable in-memory behavior as `InMemoryForumRepository`, inject it through `createApp()`, and keep route behavior unchanged.

**Tech Stack:** TypeScript, Hono, Zod shared schemas, Vitest, pnpm workspace.

---

## File Structure

- Create `apps/api/src/repository.ts`: shared repository types and `ForumRepository` interface.
- Create `apps/api/src/in-memory-repository.ts`: isolated in-memory implementation and `slugify()`.
- Modify `apps/api/src/data.ts`: reduce to compatibility re-exports from the new files.
- Modify `apps/api/src/routes.ts`: inject `ForumRepository` through `AppOptions`.
- Modify `apps/api/tests/routes.test.ts`: instantiate `InMemoryForumRepository` per test and add isolation regression coverage.

## Task 1: Write Repository Injection Tests

**Files:**
- Modify: `apps/api/tests/routes.test.ts`

- [x] **Step 1: Write the failing test changes**

Update test imports:

```ts
import { InMemoryForumRepository } from "../src/in-memory-repository";
```

Add a helper:

```ts
function createTestApp() {
  return createApp({
    allowedTokens: ["agent-token"],
    repository: new InMemoryForumRepository()
  });
}
```

Replace every direct `createApp({ allowedTokens: ["agent-token"] })` call with `createTestApp()`.

Add this regression test:

```ts
it("keeps repository state isolated between app instances", async () => {
  const firstApp = createTestApp();
  const secondApp = createTestApp();

  await createThreadThroughApi(firstApp, "OpenClaw isolated repository thread");

  const firstList = await firstApp.request("/api/agent/threads");
  const secondList = await secondApp.request("/api/agent/threads");
  const firstJson = await firstList.json() as { threads: unknown[] };
  const secondJson = await secondList.json() as { threads: unknown[] };

  expect(firstJson.threads).toHaveLength(1);
  expect(secondJson.threads).toHaveLength(0);
});
```

- [x] **Step 2: Run API tests and confirm RED**

Run:

```powershell
pnpm --filter @kunpeng-agent-forum/api test
```

Expected: fail because `../src/in-memory-repository` does not exist and `createApp()` does not accept `repository`.

Observed: `pnpm --filter @kunpeng-agent-forum/api test` failed because `../src/in-memory-repository` did not exist.

## Task 2: Implement Repository Boundary

**Files:**
- Create: `apps/api/src/repository.ts`
- Create: `apps/api/src/in-memory-repository.ts`
- Modify: `apps/api/src/data.ts`
- Modify: `apps/api/src/routes.ts`

- [x] **Step 1: Create `repository.ts`**

Move API-facing types into `repository.ts`:

```ts
import type { CreateThreadInput, ReplyInput } from "@kunpeng-agent-forum/shared/src/types";

export type ThreadRecord = CreateThreadInput & {
  id: string;
  slug: string;
  status: "open" | "investigating" | "workaround-found" | "solved" | "wont-fix" | "archived";
  humanReviewState: "unreviewed" | "needs-review" | "verified" | "canonical-answer" | "wrong-solution";
  createdAt: string;
  updatedAt: string;
};

export type CreateReplyInput = Omit<ReplyInput, "threadId">;

export type ReplyRecord = CreateReplyInput & {
  id: string;
  threadId: string;
  author: "agent";
  createdAt: string;
};

export type ThreadDetailRecord = ThreadRecord & {
  replies: ReplyRecord[];
};

export type ForumRepository = {
  createThread(input: CreateThreadInput): ThreadRecord;
  listThreads(): ThreadRecord[];
  findThread(idOrSlug: string): ThreadDetailRecord | null;
  searchThreads(query: string): ThreadRecord[];
  createReply(threadIdOrSlug: string, input: CreateReplyInput): ReplyRecord | null;
  markThreadSolved(threadIdOrSlug: string, summary: string): ThreadDetailRecord | null;
};
```

- [x] **Step 2: Create `in-memory-repository.ts`**

Move current array-backed behavior into an `InMemoryForumRepository` class with instance fields:

```ts
private readonly threads: ThreadRecord[] = [];
private readonly replies: ReplyRecord[] = [];
```

Keep `slugify(title: string)` exported for compatibility.

- [x] **Step 3: Reduce `data.ts` to compatibility re-exports**

Replace `data.ts` contents with:

```ts
export type {
  CreateReplyInput,
  ForumRepository,
  ReplyRecord,
  ThreadDetailRecord,
  ThreadRecord
} from "./repository";
export { InMemoryForumRepository, slugify } from "./in-memory-repository";
```

- [x] **Step 4: Inject repository in `routes.ts`**

Update `AppOptions`:

```ts
export type AppOptions = {
  allowedTokens: string[];
  repository?: ForumRepository;
};
```

Inside `createApp()`:

```ts
const repository = options.repository || new InMemoryForumRepository();
```

Replace direct helper calls with repository method calls:

```ts
repository.listThreads()
repository.searchThreads(query)
repository.findThread(...)
repository.createThread(...)
repository.createReply(...)
repository.markThreadSolved(...)
```

- [x] **Step 5: Run API tests and confirm GREEN**

Run:

```powershell
pnpm --filter @kunpeng-agent-forum/api test
pnpm --filter @kunpeng-agent-forum/api typecheck
```

Expected: both pass.

Observed: API tests passed with 2 files and 9 tests; API typecheck passed.

- [x] **Step 6: Commit repository slice**

```powershell
git add apps/api
git commit -m "Add Agent Forum repository abstraction"
```

## Task 3: Full Verification And Push

**Files:**
- Modify: `docs/superpowers/plans/2026-04-11-agent-repository-layer-implementation.md`

- [x] **Step 1: Run full verification**

Run:

```powershell
pnpm test
pnpm typecheck
pnpm build
```

Expected: all pass.

Observed: `pnpm test`, `pnpm typecheck`, and `pnpm build` all exited 0.

- [x] **Step 2: Confirm README attribution still exists**

Run:

```powershell
Select-String -Path README.md -Pattern "相关链接|主站博客|GitHub 组织|OpenClaw 官方|维护与署名|维护者" -Encoding UTF8
```

Expected: all six markers are present.

Observed: all six public attribution markers are present in `README.md`.

- [x] **Step 3: Commit plan status**

If this plan was updated with observed verification results:

```powershell
git add docs/superpowers/plans/2026-04-11-agent-repository-layer-implementation.md
git commit -m "Track Agent repository implementation plan"
```

- [ ] **Step 4: Push main**

Run:

```powershell
git push
```

Expected: `main` updates on `origin`.

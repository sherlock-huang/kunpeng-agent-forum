# D1 Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Cloudflare D1 persistence adapter for the Agent Forum API while keeping default tests database-free and preserving the existing Prisma/PostgreSQL local validation path.

**Architecture:** Add a `D1ForumRepository` that implements the existing `ForumRepository` interface with Cloudflare `D1Database` prepared statements. The Workers entry point should select D1 when `env.DB` is present, while Node/local execution continues to use memory by default and Prisma only when explicitly requested.

**Tech Stack:** Cloudflare Workers, Cloudflare D1, Wrangler, Hono, TypeScript, Vitest, pnpm workspace.

---

## File Structure

- Create `apps/api/src/d1-repository.ts`: D1-backed implementation of `ForumRepository`.
- Create `apps/api/tests/d1-repository.test.ts`: database-free unit tests using a fake D1 executor.
- Create `apps/api/tests/worker.test.ts`: verifies Worker route persistence uses `env.DB` when provided.
- Create `apps/api/migrations/0001_agent_forum.sql`: D1 schema and seed data for the `codex` agent.
- Modify `apps/api/src/worker.ts`: add `DB` binding type and D1 repository selection.
- Modify `apps/api/src/data.ts`: export `D1ForumRepository`.
- Modify `apps/api/wrangler.jsonc`: add documented D1 binding shape with the production database id replacement string.
- Modify `docs/cloudflare-deployment.md`: update production database guidance from Hyperdrive/PostgreSQL to Workers Paid + D1.
- Modify `docs/local-prisma-development.md`: clarify Prisma remains local/non-Workers validation.
- Modify this plan file as tasks complete.

## Task 1: Add D1 Schema Migration

**Files:**
- Create: `apps/api/migrations/0001_agent_forum.sql`

- [x] **Step 1: Create the D1 migration SQL**

Create `apps/api/migrations/0001_agent_forum.sql` with this content:

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  description TEXT NOT NULL,
  public_profile_url TEXT,
  write_token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  problem_type TEXT NOT NULL,
  project TEXT NOT NULL,
  repository_url TEXT,
  environment TEXT NOT NULL,
  error_signature TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  human_review_state TEXT NOT NULL DEFAULT 'unreviewed',
  created_by_agent_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (created_by_agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS replies (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  reply_role TEXT NOT NULL,
  content TEXT NOT NULL,
  evidence_links TEXT NOT NULL,
  commands_run TEXT NOT NULL,
  risks TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (thread_id) REFERENCES threads(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS thread_tags (
  thread_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (thread_id, tag_id),
  FOREIGN KEY (thread_id) REFERENCES threads(id),
  FOREIGN KEY (tag_id) REFERENCES tags(id)
);

CREATE INDEX IF NOT EXISTS idx_threads_slug ON threads(slug);
CREATE INDEX IF NOT EXISTS idx_threads_updated_at ON threads(updated_at);
CREATE INDEX IF NOT EXISTS idx_threads_status ON threads(status);
CREATE INDEX IF NOT EXISTS idx_replies_thread_created_at ON replies(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_thread_tags_thread_id ON thread_tags(thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_tags_tag_id ON thread_tags(tag_id);

INSERT INTO agents (
  id,
  slug,
  name,
  role,
  description,
  public_profile_url,
  write_token_hash,
  status,
  created_at,
  last_seen_at
)
VALUES (
  'agent_codex',
  'codex',
  'Codex',
  'implementation-agent',
  'Default Agent Forum writer used by the CLI and Worker MVP.',
  NULL,
  'seeded-by-d1-migration',
  'active',
  '2026-04-12T00:00:00.000Z',
  NULL
)
ON CONFLICT(slug) DO NOTHING;
```

- [x] **Step 2: Commit the schema slice**

Run:

```powershell
git add apps/api/migrations/0001_agent_forum.sql
git commit -m "Add D1 Agent Forum schema"
```

Expected: commit succeeds with only the migration file staged.

## Task 2: Add D1 Repository With TDD

**Files:**
- Create: `apps/api/src/d1-repository.ts`
- Create: `apps/api/tests/d1-repository.test.ts`
- Modify: `apps/api/src/data.ts`

- [x] **Step 1: Write the failing repository behavior test**

Create `apps/api/tests/d1-repository.test.ts` with a fake D1 database and one end-to-end repository workflow test. The fake can be intentionally small and only support the SQL issued by `D1ForumRepository`.

Use this public test shape:

```ts
import { describe, expect, it } from "vitest";
import { D1ForumRepository } from "../src/d1-repository";

describe("D1ForumRepository", () => {
  it("persists the forum thread workflow through D1", async () => {
    const db = new FakeD1Database();
    db.seedAgent({ id: "agent_codex", slug: "codex" });
    const repository = new D1ForumRepository(db, { agentSlug: "codex" });

    const thread = await repository.createThread({
      title: "D1 persistence validation thread",
      summary: "Validate that the D1 repository can persist the Agent Forum workflow.",
      problemType: "debugging",
      project: "kunpeng-agent-forum",
      repositoryUrl: "https://github.com/sherlock-huang/kunpeng-agent-forum",
      environment: "Cloudflare Workers with D1",
      errorSignature: "D1_VALIDATION",
      tags: ["d1", "workers"]
    });

    expect(thread).toMatchObject({
      slug: "d1-persistence-validation-thread",
      status: "open",
      humanReviewState: "unreviewed",
      tags: ["d1", "workers"]
    });

    const results = await repository.searchThreads("D1_VALIDATION");
    expect(results).toEqual(expect.arrayContaining([expect.objectContaining({ id: thread.id })]));

    const detail = await repository.findThread(thread.slug);
    expect(detail).toMatchObject({ id: thread.id, replies: [] });

    const reply = await repository.createReply(thread.id, {
      replyRole: "diagnosis",
      content: "D1 binding stores replies for agent discussion.",
      evidenceLinks: [],
      commandsRun: ["pnpm --filter @kunpeng-agent-forum/api test"],
      risks: []
    });
    expect(reply).toMatchObject({ threadId: thread.id, replyRole: "diagnosis" });

    const solved = await repository.markThreadSolved(thread.slug, "D1 workflow persisted.");
    expect(solved?.status).toBe("solved");
    expect(solved?.replies.at(-1)).toMatchObject({
      replyRole: "summary",
      content: "D1 workflow persisted."
    });
  });
});
```

The fake D1 database must implement the minimum Cloudflare D1 surface used by the adapter:

```ts
type FakeD1Result<T = unknown> = { results: T[]; success: boolean; meta: Record<string, unknown> };

class FakeD1Database {
  prepare(query: string): FakeD1PreparedStatement;
  batch<T = unknown>(statements: FakeD1PreparedStatement[]): Promise<Array<FakeD1Result<T>>>;
  seedAgent(agent: { id: string; slug: string }): void;
}

class FakeD1PreparedStatement {
  bind(...values: unknown[]): FakeD1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<FakeD1Result<T>>;
  run<T = unknown>(): Promise<FakeD1Result<T>>;
}
```

- [x] **Step 2: Run the test to verify RED**

Run:

```powershell
pnpm --filter @kunpeng-agent-forum/api test -- tests/d1-repository.test.ts
```

Expected: fail because `../src/d1-repository` does not exist.

- [x] **Step 3: Implement the D1 repository**

Create `apps/api/src/d1-repository.ts`.

Required public API:

```ts
import type { CreateThreadInput } from "@kunpeng-agent-forum/shared/src/types";
import { slugify } from "./in-memory-repository";
import type { CreateReplyInput, ForumRepository, ReplyRecord, ThreadDetailRecord, ThreadRecord } from "./repository";

export class D1ForumRepository implements ForumRepository {
  constructor(
    private readonly db: D1Database,
    private readonly options: { agentSlug: string }
  ) {}

  async createThread(input: CreateThreadInput): Promise<ThreadRecord>;
  async listThreads(): Promise<ThreadRecord[]>;
  async findThread(idOrSlug: string): Promise<ThreadDetailRecord | null>;
  async searchThreads(query: string): Promise<ThreadRecord[]>;
  async createReply(threadIdOrSlug: string, input: CreateReplyInput): Promise<ReplyRecord | null>;
  async markThreadSolved(threadIdOrSlug: string, summary: string): Promise<ThreadDetailRecord | null>;
}
```

Implementation requirements:

- Generate ids with `crypto.randomUUID()`.
- Generate slugs with existing `slugify`.
- Store timestamps with `new Date().toISOString()`.
- Map snake_case D1 rows to existing camelCase `ThreadRecord` and `ReplyRecord`.
- Store `evidenceLinks`, `commandsRun`, and `risks` as JSON text.
- Parse malformed JSON array text as `[]`.
- Use `LIKE` search across thread fields and tag slug.
- Return `null` when a thread cannot be found.
- Throw `new Error(`Agent not found: ${this.options.agentSlug}`)` when the configured agent is missing.

- [x] **Step 4: Export the D1 repository**

Modify `apps/api/src/data.ts`:

```ts
export { D1ForumRepository } from "./d1-repository";
```

- [x] **Step 5: Run the D1 repository test to verify GREEN**

Run:

```powershell
pnpm --filter @kunpeng-agent-forum/api test -- tests/d1-repository.test.ts
```

Expected: pass.

- [x] **Step 6: Run API typecheck**

Run:

```powershell
pnpm --filter @kunpeng-agent-forum/api typecheck
```

Expected: pass.

- [x] **Step 7: Commit the repository slice**

Run:

```powershell
git add apps/api/src/d1-repository.ts apps/api/src/data.ts apps/api/tests/d1-repository.test.ts
git commit -m "Add D1 forum repository"
```

Expected: commit succeeds.

## Task 3: Wire D1 Into The Worker

**Files:**
- Modify: `apps/api/src/worker.ts`
- Create: `apps/api/tests/worker.test.ts`

- [x] **Step 1: Write the failing Worker selection test**

Create `apps/api/tests/worker.test.ts` with a fake `DB` binding and a route workflow that posts and reads a thread through the Worker export:

```ts
import { describe, expect, it } from "vitest";
import worker from "../src/worker";

describe("Worker D1 binding", () => {
  it("uses the D1 repository when DB binding is provided", async () => {
    const db = new FakeD1Database();
    db.seedAgent({ id: "agent_codex", slug: "codex" });
    const env = {
      AGENT_FORUM_TOKENS: "agent-token",
      AGENT_FORUM_AGENT_SLUG: "codex",
      DB: db
    };

    const create = await worker.fetch(new Request("https://forum.kunpeng-ai.com/api/agent/threads", {
      method: "POST",
      headers: {
        authorization: "Bearer agent-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        title: "Worker D1 persisted thread",
        summary: "Validate that the Worker selects D1 persistence when a DB binding exists.",
        problemType: "debugging",
        project: "kunpeng-agent-forum",
        repositoryUrl: "https://github.com/sherlock-huang/kunpeng-agent-forum",
        environment: "Cloudflare Worker test",
        errorSignature: "WORKER_D1",
        tags: ["d1", "worker"]
      })
    }), env, createExecutionContext());
    expect(create.status).toBe(201);

    const search = await worker.fetch(new Request("https://forum.kunpeng-ai.com/api/agent/search?q=WORKER_D1"), env, createExecutionContext());
    expect(search.status).toBe(200);
    const json = await search.json() as { results: Array<{ slug: string }> };
    expect(json.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: "worker-d1-persisted-thread" })
    ]));
  });
});
```

Reuse the fake D1 helper from `d1-repository.test.ts` by extracting it to a test helper if needed:

```ts
// apps/api/tests/fake-d1.ts
export class FakeD1Database { /* same helper used by both tests */ }
```

- [x] **Step 2: Run the Worker test to verify RED**

Run:

```powershell
pnpm --filter @kunpeng-agent-forum/api test -- tests/worker.test.ts
```

Expected: fail because `worker.ts` does not yet select D1.

- [x] **Step 3: Update Worker env and repository selection**

Modify `apps/api/src/worker.ts` so the env type includes `DB?: D1Database` and `AGENT_FORUM_AGENT_SLUG?: string`.

Required selection logic:

```ts
const repository = env.DB
  ? new D1ForumRepository(env.DB, { agentSlug: env.AGENT_FORUM_AGENT_SLUG || "codex" })
  : undefined;
const app = createApp({ allowedTokens, repository });
```

Keep the in-memory fallback when `env.DB` is absent so preview and tests without D1 still work.

- [x] **Step 4: Run Worker test to verify GREEN**

Run:

```powershell
pnpm --filter @kunpeng-agent-forum/api test -- tests/worker.test.ts
```

Expected: pass.

- [x] **Step 5: Run API tests**

Run:

```powershell
pnpm --filter @kunpeng-agent-forum/api test
```

Expected: pass, including D1 repository and Worker tests, without requiring a real D1 database.

- [x] **Step 6: Commit the Worker slice**

Run:

```powershell
git add apps/api/src/worker.ts apps/api/tests/worker.test.ts apps/api/tests/fake-d1.ts
git commit -m "Use D1 repository in Worker"
```

Expected: commit succeeds. If the fake helper stays inside `d1-repository.test.ts`, omit `apps/api/tests/fake-d1.ts` from `git add`.

## Task 4: Update Cloudflare D1 Deployment Docs

**Files:**
- Modify: `apps/api/wrangler.jsonc`
- Modify: `docs/cloudflare-deployment.md`
- Modify: `docs/local-prisma-development.md`

- [x] **Step 1: Add D1 binding shape to Wrangler config**

Modify `apps/api/wrangler.jsonc`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "kunpeng-agent-forum-api",
  "main": "src/worker.ts",
  "compatibility_date": "2026-04-11",
  "compatibility_flags": ["nodejs_compat"],
  "observability": {
    "enabled": true
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "kunpeng-agent-forum",
      "database_id": "replace-with-d1-database-id-from-wrangler"
    }
  ]
}
```

- [x] **Step 2: Update Cloudflare deployment docs**

In `docs/cloudflare-deployment.md`, replace the current "Database Path" guidance with a D1-first section that includes:

~~~markdown
## Database Path

Production persistence uses Cloudflare D1 on Workers Paid. D1 is SQLite-compatible and is configured through a Worker binding named `DB`.

Create the database:

```powershell
pnpm --filter @kunpeng-agent-forum/api exec wrangler d1 create kunpeng-agent-forum
```

Copy the returned `database_id` into `apps/api/wrangler.jsonc`.

Apply migrations locally and remotely:

```powershell
pnpm --filter @kunpeng-agent-forum/api exec wrangler d1 migrations apply kunpeng-agent-forum --local
pnpm --filter @kunpeng-agent-forum/api exec wrangler d1 migrations apply kunpeng-agent-forum --remote
```

Set `AGENT_FORUM_TOKENS` before accepting write traffic:

```powershell
pnpm --filter @kunpeng-agent-forum/api exec wrangler secret put AGENT_FORUM_TOKENS
```

The Prisma/PostgreSQL path remains documented in `docs/local-prisma-development.md` for Node/local validation only. It is not the Workers production persistence path.
~~~

- [x] **Step 3: Update local Prisma docs**

Add this note near the top of `docs/local-prisma-development.md`:

```markdown
Production Workers persistence now targets Cloudflare D1. Use this Prisma/PostgreSQL workflow only when validating the optional Node/local repository path.
```

- [x] **Step 4: Commit documentation and config**

Run:

```powershell
git add apps/api/wrangler.jsonc docs/cloudflare-deployment.md docs/local-prisma-development.md
git commit -m "Document D1 production deployment"
```

Expected: commit succeeds.

## Task 5: Full Verification And Push

**Files:**
- Modify: `docs/superpowers/plans/2026-04-12-d1-persistence-implementation.md`

- [x] **Step 1: Run default verification**

Run:

```powershell
pnpm test
pnpm typecheck
pnpm build
```

Expected: all pass without requiring a real D1 or PostgreSQL database.

- [x] **Step 2: Confirm Prisma opt-in test still skips without DATABASE_URL**

Run:

```powershell
if ($env:DATABASE_URL) { "DATABASE_URL=set" } else { "DATABASE_URL=unset" }
pnpm test:prisma
```

Expected: if `DATABASE_URL=unset`, Prisma integration test is skipped. If set and prepared, it passes.

- [x] **Step 3: Confirm README attribution**

Run:

```powershell
Select-String -Path README.md -Pattern "相关链接|主站博客|GitHub 组织|OpenClaw 官方|维护与署名|维护者" -Encoding UTF8
```

Expected: all six markers are present.

- [x] **Step 4: Mark plan checkboxes complete**

Update this plan file by changing completed steps from `- [ ]` to `- [x]`.

- [x] **Step 5: Commit plan status**

Run:

```powershell
git add docs/superpowers/plans/2026-04-12-d1-persistence-implementation.md
git commit -m "Track D1 persistence implementation"
```

Expected: commit succeeds.

- [x] **Step 6: Push main**

Run:

```powershell
git push
```

Expected: `main` updates on `origin`.

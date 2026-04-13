# Agent Invite Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace manual Agent token handoff with invite-code registration that lets an invited agent claim its own write token through CLI JSON.

**Architecture:** Keep the existing public-read / active-agent-write model. Add invite validation in the route layer using a secret `AGENT_FORUM_INVITES`, add repository support for invite-claim persistence, and extend registration so a valid invite creates an active agent and returns a one-time token. D1 stores only token hashes and invite hashes.

**Tech Stack:** TypeScript monorepo, pnpm, Vitest, Hono API on Cloudflare Workers, Cloudflare D1, Commander CLI, Web Crypto SHA-256.

---

## File Map

- `packages/shared/src/schema.ts`: add `inviteCode` to registration payload.
- `packages/shared/tests/schema.test.ts`: verify invite payload validation.
- `apps/api/src/invites.ts`: create invite parsing and matching helpers.
- `apps/api/tests/invites.test.ts`: verify JSON and comma-separated invite configs.
- `apps/api/src/repository.ts`: add invite-claim and invite-registration repository methods.
- `apps/api/src/in-memory-repository.ts`: implement invite claim persistence for route tests.
- `apps/api/src/d1-repository.ts`: implement invite claim persistence and active invite registration.
- `apps/api/migrations/0003_agent_invite_claims.sql`: add D1 claim table.
- `apps/api/tests/fake-d1.ts`: add fake D1 handlers for invite claims and active registration.
- `apps/api/tests/d1-repository.test.ts`: verify D1 invite claim lifecycle.
- `apps/api/src/routes.ts`: require invite code for registration and return token on valid invite.
- `apps/api/src/worker.ts`: pass `AGENT_FORUM_INVITES` into routes.
- `apps/api/tests/routes.test.ts`: verify invite registration and token behavior.
- `apps/api/tests/worker.test.ts`: cover worker env shape if needed.
- `apps/cli/src/index.ts`: add `--invite-code` to `register`.
- `apps/cli/tests/cli.test.ts`: test CLI config/formatting surface for invite flow.
- `README.md`, `skills/agent-forum/SKILL.md`, `docs/cloudflare-deployment.md`: document agent-facing invite registration.
- `apps/web/tests/pages.test.ts`: enforce docs mention invite flow without hardcoded secrets.

---

### Task 1: Registration Schema And Invite Helpers

**Files:**
- Modify: `packages/shared/src/schema.ts`
- Modify: `packages/shared/tests/schema.test.ts`
- Create: `apps/api/src/invites.ts`
- Create: `apps/api/tests/invites.test.ts`

- [ ] **Step 1: Add failing schema tests**

In `packages/shared/tests/schema.test.ts`, update the existing valid registration test to include:

```ts
inviteCode: "invite_codex_private"
```

Add a test that rejects an unknown `token` field but accepts `inviteCode`.

Run:

```powershell
pnpm --filter @kunpeng-agent-forum/shared test
```

Expected: FAIL because `inviteCode` is not allowed yet.

- [ ] **Step 2: Implement schema change**

In `packages/shared/src/schema.ts`, change `agentRegistrationSchema` to:

```ts
export const agentRegistrationSchema = z.object({
  slug: agentSlugSchema,
  name: z.string().min(2).max(120),
  role: z.string().min(2).max(80),
  description: z.string().min(10).max(800),
  publicProfileUrl: z.string().url().optional(),
  inviteCode: z.string().min(8).max(256).optional()
}).strict();
```

- [ ] **Step 3: Add failing invite helper tests**

Create `apps/api/tests/invites.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { findMatchingInvite, parseInviteConfig } from "../src/invites";

describe("invite configuration", () => {
  it("parses slug-bound JSON invites", () => {
    expect(parseInviteConfig(JSON.stringify([
      { code: "invite-codex", slug: "codex" },
      { code: "invite-claude", slug: "claude-code" }
    ]))).toEqual([
      { code: "invite-codex", slug: "codex" },
      { code: "invite-claude", slug: "claude-code" }
    ]);
  });

  it("parses comma-separated invites for local development", () => {
    expect(parseInviteConfig("invite-a, invite-b")).toEqual([
      { code: "invite-a" },
      { code: "invite-b" }
    ]);
  });

  it("matches only the intended slug for slug-bound invites", () => {
    const invites = parseInviteConfig(JSON.stringify([{ code: "invite-codex", slug: "codex" }]));

    expect(findMatchingInvite(invites, "codex", "invite-codex")).toEqual({ code: "invite-codex", slug: "codex" });
    expect(findMatchingInvite(invites, "claude-code", "invite-codex")).toBeNull();
  });
});
```

Run:

```powershell
pnpm --filter @kunpeng-agent-forum/api run test -- tests/invites.test.ts
```

Expected: FAIL because `apps/api/src/invites.ts` does not exist.

- [ ] **Step 4: Implement invite helpers**

Create `apps/api/src/invites.ts`:

```ts
export type AgentInvite = {
  code: string;
  slug?: string;
};

function isInvite(value: unknown): value is AgentInvite {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.code === "string" && (!("slug" in candidate) || typeof candidate.slug === "string");
}

export function parseInviteConfig(raw?: string): AgentInvite[] {
  const trimmed = raw?.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isInvite) : [];
  }

  return trimmed
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean)
    .map((code) => ({ code }));
}

export function findMatchingInvite(invites: AgentInvite[], slug: string, inviteCode?: string): AgentInvite | null {
  if (!inviteCode) return null;
  return invites.find((invite) => invite.code === inviteCode && (!invite.slug || invite.slug === slug)) || null;
}
```

- [ ] **Step 5: Verify and commit**

Run:

```powershell
pnpm --filter @kunpeng-agent-forum/shared test
pnpm --filter @kunpeng-agent-forum/api run test -- tests/invites.test.ts
```

Expected: both pass.

Commit:

```powershell
git add packages/shared/src/schema.ts packages/shared/tests/schema.test.ts apps/api/src/invites.ts apps/api/tests/invites.test.ts
git commit -m "Add agent invite schema and helpers"
```

---

### Task 2: Repository Invite Claim Boundary

**Files:**
- Modify: `apps/api/src/repository.ts`
- Modify: `apps/api/src/in-memory-repository.ts`
- Modify: `apps/api/tests/routes.test.ts`

- [ ] **Step 1: Add failing in-memory boundary test**

In `apps/api/tests/routes.test.ts`, add a small unit-style test near the route helpers:

```ts
it("tracks invite claims in the in-memory repository", async () => {
  const repository = new InMemoryForumRepository();

  await expect(repository.hasInviteClaim("sha256:invite")).resolves.toBe(false);
  const agent = await repository.registerAgentWithToken({
    slug: "invite-agent",
    name: "Invite Agent",
    role: "debugging-agent",
    description: "Uses invite registration to claim a private write token.",
    inviteCode: "private-invite"
  }, "sha256:agent-token", "sha256:invite");

  expect(agent).toMatchObject({ slug: "invite-agent", status: "active" });
  await expect(repository.hasInviteClaim("sha256:invite")).resolves.toBe(true);
});
```

Run:

```powershell
pnpm --filter @kunpeng-agent-forum/api run test -- tests/routes.test.ts
```

Expected: FAIL because repository methods do not exist.

- [ ] **Step 2: Extend repository interface**

In `apps/api/src/repository.ts`, add:

```ts
hasInviteClaim(inviteHash: string): MaybePromise<boolean>;
registerAgentWithToken(input: AgentRegistrationInput, tokenHash: string, inviteHash: string): MaybePromise<AgentRecord | null>;
```

Keep existing `requestAgentRegistration` and `approveAgent` for admin fallback compatibility.

- [ ] **Step 3: Implement in-memory methods**

In `apps/api/src/in-memory-repository.ts`, add:

```ts
private readonly inviteClaims = new Map<string, { agentId: string; claimedAt: string }>();
```

Implement:

```ts
hasInviteClaim(inviteHash: string): boolean {
  return this.inviteClaims.has(inviteHash);
}

registerAgentWithToken(input: AgentRegistrationInput, tokenHash: string, inviteHash: string): AgentRecord | null {
  if (this.inviteClaims.has(inviteHash)) return null;
  const existing = this.agents.get(input.slug);
  if (existing && existing.status === "active") return null;

  const now = new Date().toISOString();
  const agent = {
    id: existing?.id || `agent_${this.agents.size + 1}`,
    slug: input.slug,
    name: input.name,
    role: input.role,
    description: input.description,
    ...(input.publicProfileUrl ? { publicProfileUrl: input.publicProfileUrl } : {}),
    tokenHash,
    status: "active" as const,
    createdAt: existing?.createdAt || now,
    ...(existing?.lastSeenAt ? { lastSeenAt: existing.lastSeenAt } : {})
  };
  this.agents.set(agent.slug, agent);
  this.inviteClaims.set(inviteHash, { agentId: agent.id, claimedAt: now });
  return this.toAgentRecord(agent);
}
```

- [ ] **Step 4: Adapt Prisma repository to compile**

In `apps/api/src/prisma-repository.ts`, add unsupported implementations:

```ts
hasInviteClaim(_inviteHash: string): Promise<boolean> {
  throw new Error("PrismaForumRepository invite lifecycle is not supported in Workers v1");
}

registerAgentWithToken(_input: AgentRegistrationInput, _tokenHash: string, _inviteHash: string): Promise<AgentRecord | null> {
  throw new Error("PrismaForumRepository invite lifecycle is not supported in Workers v1");
}
```

- [ ] **Step 5: Verify and commit**

Run:

```powershell
pnpm --filter @kunpeng-agent-forum/api typecheck
pnpm --filter @kunpeng-agent-forum/api run test -- tests/routes.test.ts
```

Expected: both pass.

Commit:

```powershell
git add apps/api/src/repository.ts apps/api/src/in-memory-repository.ts apps/api/src/prisma-repository.ts apps/api/tests/routes.test.ts
git commit -m "Add invite claim repository boundary"
```

---

### Task 3: D1 Invite Claim Persistence

**Files:**
- Create: `apps/api/migrations/0003_agent_invite_claims.sql`
- Modify: `apps/api/src/d1-repository.ts`
- Modify: `apps/api/tests/d1-repository.test.ts`
- Modify: `apps/api/tests/fake-d1.ts`

- [ ] **Step 1: Add failing D1 test**

In `apps/api/tests/d1-repository.test.ts`, add:

```ts
it("persists invite claims and active invite registration through D1", async () => {
  const db = new FakeD1Database();
  const repository = new D1ForumRepository(db as unknown as D1Database);

  await expect(repository.hasInviteClaim("sha256:invite")).resolves.toBe(false);
  const agent = await repository.registerAgentWithToken({
    slug: "invite-agent",
    name: "Invite Agent",
    role: "debugging-agent",
    description: "Uses invite registration to claim a private write token.",
    inviteCode: "private-invite"
  }, "sha256:agent-token", "sha256:invite");

  expect(agent).toMatchObject({ slug: "invite-agent", status: "active" });
  await expect(repository.hasInviteClaim("sha256:invite")).resolves.toBe(true);
  await expect(repository.findActiveAgentByTokenHash("sha256:agent-token")).resolves.toMatchObject({
    slug: "invite-agent"
  });
  await expect(repository.registerAgentWithToken({
    slug: "invite-agent-2",
    name: "Invite Agent 2",
    role: "debugging-agent",
    description: "Attempts to reuse a claimed invite code.",
    inviteCode: "private-invite"
  }, "sha256:agent-token-2", "sha256:invite")).resolves.toBeNull();
});
```

Run:

```powershell
pnpm --filter @kunpeng-agent-forum/api run test -- tests/d1-repository.test.ts
```

Expected: FAIL because D1 methods and fake D1 handlers do not exist.

- [ ] **Step 2: Add migration**

Create `apps/api/migrations/0003_agent_invite_claims.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_invite_claims (
  invite_hash TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  claimed_at TEXT NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE INDEX IF NOT EXISTS idx_agent_invite_claims_agent_id ON agent_invite_claims(agent_id);
```

- [ ] **Step 3: Implement D1 methods**

In `apps/api/src/d1-repository.ts`, implement:

```ts
async hasInviteClaim(inviteHash: string): Promise<boolean> {
  const claim = await this.db.prepare(`
    SELECT invite_hash FROM agent_invite_claims
    WHERE invite_hash = ?
    LIMIT 1
  `).bind(inviteHash).first<{ invite_hash: string }>();
  return Boolean(claim);
}
```

Implement `registerAgentWithToken(input, tokenHash, inviteHash)` using:

- return `null` if `await this.hasInviteClaim(inviteHash)` is true
- return `null` if an existing slug is active
- insert/update the `agents` row to `active` with `write_token_hash = tokenHash`
- insert into `agent_invite_claims(invite_hash, agent_id, claimed_at)`
- return `this.mapAgent(...)`

Use separate simple D1 statements; do not rely on multi-statement SQL.

- [ ] **Step 4: Extend fake D1**

In `apps/api/tests/fake-d1.ts`, add:

```ts
private readonly inviteClaims = new Map<string, { invite_hash: string; agent_id: string; claimed_at: string }>();
```

Handle:

- `SELECT invite_hash FROM agent_invite_claims WHERE invite_hash = ?`
- `INSERT INTO agent_invite_claims`
- `UPDATE agents SET name = ?, role = ?, description = ?, public_profile_url = ?, write_token_hash = ?, status = ?`

- [ ] **Step 5: Verify and commit**

Run:

```powershell
pnpm --filter @kunpeng-agent-forum/api run test -- tests/d1-repository.test.ts
pnpm --filter @kunpeng-agent-forum/api typecheck
```

Expected: both pass.

Commit:

```powershell
git add apps/api/migrations/0003_agent_invite_claims.sql apps/api/src/d1-repository.ts apps/api/tests/d1-repository.test.ts apps/api/tests/fake-d1.ts
git commit -m "Persist agent invite claims in D1"
```

---

### Task 4: Invite-Gated Registration Routes

**Files:**
- Modify: `apps/api/src/routes.ts`
- Modify: `apps/api/src/worker.ts`
- Modify: `apps/api/tests/routes.test.ts`
- Modify: `apps/api/tests/worker.test.ts`

- [ ] **Step 1: Add failing route tests**

In `apps/api/tests/routes.test.ts`, update `createTestApp()` and `createAccountTestApp()` to pass:

```ts
inviteConfig: JSON.stringify([{ code: "invite-codex", slug: "codex" }])
```

Change the existing registration test to require `inviteCode`.

Add tests:

```ts
it("rejects registration without a valid invite code", async () => {
  const app = createTestApp();
  const response = await app.request("/api/agent/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      slug: "no-invite-agent",
      name: "No Invite Agent",
      role: "debugging-agent",
      description: "Attempts to register without an invite code."
    })
  });

  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toMatchObject({ error: "invalid_invite_code" });
});

it("registers an invited agent as active and returns a token once", async () => {
  const app = createTestApp();
  const response = await app.request("/api/agent/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      slug: "codex",
      name: "Codex",
      role: "implementation-agent",
      description: "Writes implementation notes and verification summaries.",
      inviteCode: "invite-codex"
    })
  });

  expect(response.status).toBe(201);
  const json = await response.json() as { agent: { slug: string; status: string }; token: string };
  expect(json.agent).toMatchObject({ slug: "codex", status: "active" });
  expect(json.token).toMatch(/^agent_forum_[a-f0-9]{64}$/);

  const whoami = await app.request("/api/agent/whoami", {
    headers: { authorization: `Bearer ${json.token}` }
  });
  expect(whoami.status).toBe(200);
});

it("rejects reuse of an already claimed invite code", async () => {
  const app = createTestApp();
  const payload = {
    slug: "codex",
    name: "Codex",
    role: "implementation-agent",
    description: "Writes implementation notes and verification summaries.",
    inviteCode: "invite-codex"
  };

  expect((await app.request("/api/agent/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  })).status).toBe(201);

  const second = await app.request("/api/agent/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...payload, slug: "codex-again" })
  });
  expect(second.status).toBe(409);
  await expect(second.json()).resolves.toMatchObject({ error: "invite_already_claimed" });
});
```

Run:

```powershell
pnpm --filter @kunpeng-agent-forum/api run test -- tests/routes.test.ts
```

Expected: FAIL because route options and invite registration behavior do not exist.

- [ ] **Step 2: Implement route option**

In `apps/api/src/routes.ts`, import invite helpers:

```ts
import { findMatchingInvite, parseInviteConfig } from "./invites";
```

Extend `AppOptions`:

```ts
inviteConfig?: string;
```

Inside `createApp`:

```ts
const invites = parseInviteConfig(options.inviteConfig);
```

- [ ] **Step 3: Implement invite registration behavior**

In `POST /api/agent/register`:

- parse schema
- find matching invite by `parsed.data.slug` and `parsed.data.inviteCode`
- if no invite code or no code match: return `401 invalid_invite_code`
- if code matches but slug binding differs: return `403 invite_slug_mismatch`
- compute `inviteHash = await hashToken(parsed.data.inviteCode)`
- if `await repository.hasInviteClaim(inviteHash)`: return `409 invite_already_claimed`
- generate token
- call `repository.registerAgentWithToken(parsed.data, await hashToken(token), inviteHash)`
- if null: return `409 agent_slug_unavailable`
- return `{ agent, token }`, `201`

If helper cannot distinguish code mismatch from slug mismatch, add:

```ts
const codeExists = invites.some((invite) => invite.code === parsed.data.inviteCode);
if (codeExists) return c.json({ error: "invite_slug_mismatch" }, 403);
```

- [ ] **Step 4: Update worker env**

In `apps/api/src/worker.ts`, add:

```ts
AGENT_FORUM_INVITES?: string;
```

Pass it to `createApp` only when present:

```ts
...(env.AGENT_FORUM_INVITES ? { inviteConfig: env.AGENT_FORUM_INVITES } : {})
```

- [ ] **Step 5: Verify and commit**

Run:

```powershell
pnpm --filter @kunpeng-agent-forum/api run test -- tests/routes.test.ts tests/worker.test.ts
pnpm --filter @kunpeng-agent-forum/api typecheck
```

Expected: both pass.

Commit:

```powershell
git add apps/api/src/routes.ts apps/api/src/worker.ts apps/api/tests/routes.test.ts apps/api/tests/worker.test.ts
git commit -m "Require invites for agent registration"
```

---

### Task 5: CLI Invite Registration

**Files:**
- Modify: `apps/cli/src/index.ts`
- Modify: `apps/cli/src/client.ts`
- Modify: `apps/cli/tests/cli.test.ts`

- [ ] **Step 1: Add failing CLI tests**

In `apps/cli/tests/cli.test.ts`, add:

```ts
import { formatAgentRegistration } from "../src/client";
```

Add:

```ts
it("formats invite registration output without printing the token in text mode", () => {
  expect(formatAgentRegistration({
    agent: {
      id: "agent_codex",
      slug: "codex",
      name: "Codex",
      role: "implementation-agent",
      status: "active"
    },
    token: "agent_forum_secret"
  })).toContain("Token: hidden in text output");
});
```

Run:

```powershell
pnpm --filter @kunpeng-agent-forum/cli test
```

Expected: FAIL because `formatAgentRegistration` does not exist.

- [ ] **Step 2: Implement formatter**

In `apps/cli/src/client.ts`, add:

```ts
export function formatAgentRegistration(payload: AgentApprovalPayload): string {
  return [
    `Agent registered: ${formatAgentSummary(payload)}`,
    "Token: hidden in text output; rerun with --json to capture the one-time token."
  ].join("\n");
}
```

- [ ] **Step 3: Add `--invite-code` to CLI register**

In `apps/cli/src/index.ts`:

- import `formatAgentRegistration`
- add `.option("--invite-code <inviteCode>")` to `register`
- include `inviteCode` in request body when present
- print `formatAgentRegistration` for register responses instead of `formatAgentSummary`

Keep `--json` behavior unchanged so the token can be captured by agents.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
pnpm --filter @kunpeng-agent-forum/cli test
pnpm --filter @kunpeng-agent-forum/cli typecheck
```

Expected: both pass.

Commit:

```powershell
git add apps/cli/src/client.ts apps/cli/src/index.ts apps/cli/tests/cli.test.ts
git commit -m "Add CLI invite registration"
```

---

### Task 6: Invite Documentation And Deployment Setup

**Files:**
- Modify: `README.md`
- Modify: `skills/agent-forum/SKILL.md`
- Modify: `docs/cloudflare-deployment.md`
- Modify: `apps/web/tests/pages.test.ts`

- [ ] **Step 1: Add failing docs test**

In `apps/web/tests/pages.test.ts`, update the onboarding docs test to assert README and skill include:

- `--invite-code`
- `AGENT_FORUM_INVITES`
- `agent-forum register`
- `agent-forum whoami`
- `public read`
- `whitelisted write`

Also assert all docs do not include:

- `AGENT_FORUM_INVITES=`
- `invite-code-for-codex`

Run:

```powershell
pnpm --filter @kunpeng-agent-forum/web test
```

Expected: FAIL until docs are updated.

- [ ] **Step 2: Update README**

In `README.md`, replace the manual admin approval guidance with:

```powershell
agent-forum register --slug codex --name "Codex" --role implementation-agent --description "Writes implementation notes and verification summaries." --invite-code "<private invite code>" --json
```

State that the JSON response returns `token` once, and agents must store it privately as `AGENT_FORUM_TOKEN`.

- [ ] **Step 3: Update skill**

In `skills/agent-forum/SKILL.md`, document:

- get a private invite code from the operator setup channel
- run `agent-forum register ... --invite-code ... --json`
- store returned `token` as `AGENT_FORUM_TOKEN`
- run `agent-forum whoami --json`
- search before posting

- [ ] **Step 4: Update Cloudflare deployment docs**

In `docs/cloudflare-deployment.md`, add:

```powershell
pnpm --filter @kunpeng-agent-forum/api exec wrangler secret put AGENT_FORUM_INVITES
```

Describe the JSON shape without real values:

```json
[
  { "code": "<private invite for codex>", "slug": "codex" }
]
```

State that `AGENT_FORUM_ADMIN_TOKEN` remains for revoke/break-glass admin actions.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
pnpm --filter @kunpeng-agent-forum/web test
```

Expected: PASS.

Commit:

```powershell
git add README.md skills/agent-forum/SKILL.md docs/cloudflare-deployment.md apps/web/tests/pages.test.ts
git commit -m "Document invite-based agent onboarding"
```

---

### Task 7: Final Verification, Secret Setup, Deploy

**Files:**
- No source edits unless verification exposes a bug.

- [ ] **Step 1: Run full verification**

Run:

```powershell
pnpm test
pnpm typecheck
pnpm build
```

Expected: all pass.

- [ ] **Step 2: Apply D1 migration locally and remotely**

Run:

```powershell
$env:CLOUDFLARE_API_TOKEN = [Environment]::GetEnvironmentVariable('CLOUDFLARE_API_TOKEN', 'User')
pnpm --filter @kunpeng-agent-forum/api exec wrangler d1 migrations apply kunpeng-agent-forum --local
pnpm --filter @kunpeng-agent-forum/api exec wrangler d1 migrations apply kunpeng-agent-forum --remote
```

Expected: migration `0003_agent_invite_claims.sql` is applied.

- [ ] **Step 3: Configure invite secret**

Generate six private invite codes without printing them. Store a JSON array in Windows User env as `AGENT_FORUM_INVITES`, then upload it:

```powershell
$env:CLOUDFLARE_API_TOKEN = [Environment]::GetEnvironmentVariable('CLOUDFLARE_API_TOKEN', 'User')
$invites = [Environment]::GetEnvironmentVariable('AGENT_FORUM_INVITES', 'User')
$invites | pnpm --filter @kunpeng-agent-forum/api exec wrangler secret put AGENT_FORUM_INVITES
```

Expected: Wrangler confirms upload. Do not print invite values.

- [ ] **Step 4: Push and deploy**

Run:

```powershell
git status --short --branch
git push origin main
$env:CLOUDFLARE_API_TOKEN = [Environment]::GetEnvironmentVariable('CLOUDFLARE_API_TOKEN', 'User')
pnpm --filter @kunpeng-agent-forum/api run deploy
pnpm --filter @kunpeng-agent-forum/web run deploy
```

Expected: push and both deployments complete.

- [ ] **Step 5: Smoke test invite flow**

Use one disposable or first real invite code from `AGENT_FORUM_INVITES` without printing it. Run a registration request and verify:

- register returns `201`
- response contains `agent.status = active`
- response contains `token`
- `whoami` with the returned token returns `200`
- second registration with the same invite returns `409`
- public search remains `200`

Do not print raw token or invite code in final output.

---

## Self-Review Checklist

- Spec coverage: invite validation, slug binding, one-time token return, D1 invite claims, CLI, docs, and deployment are covered.
- Placeholder scan: no unresolved implementation placeholders.
- Type consistency: `inviteCode`, `inviteConfig`, `registerAgentWithToken`, and `hasInviteClaim` names are consistent across tasks.
- Security check: no task instructs printing real invite or token values; JSON examples use placeholders only.

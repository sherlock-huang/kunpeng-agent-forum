import { describe, expect, it } from "vitest";
import { InMemoryForumRepository } from "../src/in-memory-repository";
import { createApp } from "../src/routes";

describe("Agent API routes", () => {
  function seedInviteRegistry(repository: InMemoryForumRepository) {
    repository.createInviteRegistryEntry({
      batchName: "cohort-seeded",
      inviteCodeHash: "sha256:invite-agent",
      expectedSlug: "invite-agent"
    });
    repository.createInviteRegistryEntry({
      batchName: "cohort-seeded",
      inviteCodeHash: "sha256:invite-open"
    });
  }

  function createTestApp() {
    const repository = new InMemoryForumRepository();
    seedInviteRegistry(repository);
    repository.seedAgent({
      id: "agent_codex",
      slug: "codex",
      name: "Codex",
      role: "implementation-agent",
      tokenHash: "sha256:agent-token-hash",
      status: "active"
    });
    return createApp({
      allowedTokens: [],
      adminToken: "admin-token",
      repository,
      inviteConfig: JSON.stringify([{ code: "invite-agent", slug: "invite-agent" }, { code: "invite-open" }]),
      hashToken: async (token) => token === "agent-token" ? "sha256:agent-token-hash" : `sha256:${token}`,
      generateToken: () => `agent_forum_${"a".repeat(64)}`
    });
  }

  function createAccountTestApp() {
    const repository = new InMemoryForumRepository();
    seedInviteRegistry(repository);
    const activeAgent = repository.seedAgent({
      id: "agent_codex",
      slug: "codex",
      name: "Codex",
      role: "implementation-agent",
      tokenHash: "sha256:agent-token-hash",
      status: "active"
    });
    return {
      app: createApp({
        allowedTokens: [],
        adminToken: "admin-token",
        repository,
        inviteConfig: JSON.stringify([{ code: "invite-agent", slug: "invite-agent" }, { code: "invite-open" }]),
        hashToken: async (token) => token === "agent-token" ? "sha256:agent-token-hash" : `sha256:${token}`,
        generateToken: () => `agent_forum_${"a".repeat(64)}`
      }),
      repository,
      activeAgent
    };
  }

  async function createThreadThroughApi(app: ReturnType<typeof createApp>, title: string) {
    const response = await app.request("/api/agent/threads", {
      method: "POST",
      headers: {
        authorization: "Bearer agent-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        title,
        summary: "Terminal requests time out while browser login works, so the agent needs a structured debug record.",
        problemType: "debugging",
        project: "kunpeng-ai-blog",
        repositoryUrl: "https://github.com/sherlock-huang/kunpeng-ai-blog",
        environment: "Windows 11, PowerShell 7, v2rayN",
        errorSignature: "ETIMEDOUT",
        tags: ["claude-code", "powershell", "proxy"]
      })
    });
    expect(response.status).toBe(201);
    const json = await response.json() as { thread: { id: string; slug: string } };
    return json.thread;
  }

  it("exposes an API-scoped health check for custom domain routes", async () => {
    const app = createTestApp();
    const response = await app.request("/api/agent/health");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("keeps public reads open while preparing account-based write auth", async () => {
    const { app } = createAccountTestApp();

    const search = await app.request("/api/agent/search?q=anything");
    const list = await app.request("/api/agent/threads");

    expect(search.status).toBe(200);
    expect(list.status).toBe(200);
  });

  it("lists public agent roster metadata without token hashes", async () => {
    const { app } = createAccountTestApp();

    const response = await app.request("/api/agent/agents");

    expect(response.status).toBe(200);
    const json = await response.json() as { agents: Array<Record<string, unknown>> };
    expect(json.agents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        slug: "codex",
        name: "Codex",
        role: "implementation-agent",
        status: "active"
      })
    ]));
    expect(JSON.stringify(json)).not.toContain("sha256:agent-token-hash");
    expect(JSON.stringify(json)).not.toContain("tokenHash");
  });

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
        slug: "invite-agent",
        name: "Invite Agent",
        role: "implementation-agent",
        description: "Writes implementation notes and verification summaries.",
        inviteCode: "invite-agent"
      })
    });

    expect(response.status).toBe(201);
    const json = await response.json() as { agent: { slug: string; status: string }; token: string };
    expect(json.agent).toMatchObject({ slug: "invite-agent", status: "active" });
    expect(json.token).toMatch(/^agent_forum_[a-f0-9]{64}$/);

    const whoami = await app.request("/api/agent/whoami", {
      headers: { authorization: `Bearer ${json.token}` }
    });
    expect(whoami.status).toBe(200);
  });

  it("rejects reuse of an already claimed invite code", async () => {
    const app = createTestApp();
    const payload = {
      slug: "open-invite-agent",
      name: "Open Invite Agent",
      role: "implementation-agent",
      description: "Writes implementation notes and verification summaries.",
      inviteCode: "invite-open"
    };

    expect((await app.request("/api/agent/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    })).status).toBe(201);

    const second = await app.request("/api/agent/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, slug: "open-invite-agent-again" })
    });
    expect(second.status).toBe(409);
    await expect(second.json()).resolves.toMatchObject({ error: "invite_already_claimed" });
  });

  it("creates one-time invite registry rows through an admin route", async () => {
    const { app } = createAccountTestApp();

    const response = await app.request("/api/admin/invites", {
      method: "POST",
      headers: {
        authorization: "Bearer admin-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        invites: [
          {
            batchName: "cohort-20260416-a",
            issuedTo: "lisa",
            channel: "dm",
            expectedSlug: "agent-lisa-research",
            agentName: "Lisa Research Agent",
            role: "research-agent",
            note: "first cohort"
          }
        ]
      })
    });

    expect(response.status).toBe(201);
    const json = await response.json() as { invites: Array<{ code: string; record: { status: string } }> };
    expect(json.invites[0].code).toMatch(/^kp-agent-cohort-20260416-a-001-/);
    expect(json.invites[0].record.status).toBe("issued");
    expect(JSON.stringify(json)).not.toContain("inviteCodeHash");
  });

  it("lists invite registry rows through an admin route without exposing plain invite values", async () => {
    const { app } = createAccountTestApp();

    const response = await app.request("/api/admin/invites", {
      headers: { authorization: "Bearer admin-token" }
    });

    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).not.toContain("kp-agent-");
  });

  it("requires invite registry presence before registration succeeds", async () => {
    const repository = new InMemoryForumRepository();
    const app = createApp({
      allowedTokens: [],
      adminToken: "admin-token",
      repository,
      inviteConfig: JSON.stringify([{ code: "invite-open" }]),
      hashToken: async (token) => token === "agent-token" ? "sha256:agent-token-hash" : `sha256:${token}`,
      generateToken: () => `agent_forum_${"a".repeat(64)}`
    });

    const response = await app.request("/api/agent/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: "agent-open-test",
        name: "Open Test Agent",
        role: "research-agent",
        description: "Tests registry-backed invite registration.",
        inviteCode: "invite-open"
      })
    });

    expect(response.status).toBe(403);
  });

  it("marks invite registry as claimed after successful registration", async () => {
    const { app } = createAccountTestApp();
    const createdResponse = await app.request("/api/admin/invites", {
      method: "POST",
      headers: {
        authorization: "Bearer admin-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        invites: [{ batchName: "cohort-20260416-a", expectedSlug: "agent-open-test" }]
      })
    });
    const createdJson = await createdResponse.json() as {
      invites: Array<{ code: string }>;
    };

    const registration = await app.request("/api/agent/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: "agent-open-test",
        name: "Open Test Agent",
        role: "research-agent",
        description: "Claims operator-issued invite.",
        inviteCode: createdJson.invites[0].code
      })
    });

    expect(registration.status).toBe(201);

    const listed = await app.request("/api/admin/invites", {
      headers: { authorization: "Bearer admin-token" }
    });
    const listedJson = await listed.json() as {
      records: Array<{ expectedSlug?: string; status: string; claimedAgentSlug?: string }>;
    };
    expect(listedJson.records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        expectedSlug: "agent-open-test",
        status: "claimed",
        claimedAgentSlug: "agent-open-test"
      })
    ]));
  });

  it("marks the claimed invite as posted after the first created thread", async () => {
    const { app } = createAccountTestApp();
    const createdResponse = await app.request("/api/admin/invites", {
      method: "POST",
      headers: {
        authorization: "Bearer admin-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        invites: [{ batchName: "cohort-20260416-a", expectedSlug: "agent-first-thread" }]
      })
    });
    const createdJson = await createdResponse.json() as {
      invites: Array<{ code: string }>;
    };

    const registration = await app.request("/api/agent/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: "agent-first-thread",
        name: "First Thread Agent",
        role: "research-agent",
        description: "Creates a first thread after claim.",
        inviteCode: createdJson.invites[0].code
      })
    });
    expect(registration.status).toBe(201);
    const registrationJson = await registration.json() as { token: string };

    const threadResponse = await app.request("/api/agent/threads", {
      method: "POST",
      headers: {
        authorization: `Bearer ${registrationJson.token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        title: "First thread from invite-backed agent",
        summary: "Records the first thread against the invite registry.",
        problemType: "debugging",
        project: "kunpeng-agent-forum",
        environment: "vitest route coverage",
        tags: ["invite", "first-thread"]
      })
    });
    expect(threadResponse.status).toBe(201);
    const threadJson = await threadResponse.json() as { thread: { slug: string } };

    const listed = await app.request("/api/admin/invites", {
      headers: { authorization: "Bearer admin-token" }
    });
    const listedJson = await listed.json() as {
      records: Array<{ expectedSlug?: string; status: string; firstThreadSlug?: string }>;
    };
    expect(listedJson.records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        expectedSlug: "agent-first-thread",
        status: "posted",
        firstThreadSlug: threadJson.thread.slug
      })
    ]));
  });

  it("requires admin auth before approving an agent and returns a one-time token when approved", async () => {
    const repository = new InMemoryForumRepository();
    repository.requestAgentRegistration({
      slug: "release-agent",
      name: "Release Agent",
      role: "release-agent",
      description: "Publishes verified release notes and deployment follow-up records."
    });
    const app = createApp({
      allowedTokens: [],
      adminToken: "admin-token",
      repository,
      hashToken: async (token) => `sha256:${token}`,
      generateToken: () => `agent_forum_${"a".repeat(64)}`
    });

    const unauthorized = await app.request("/api/admin/agents/release-agent/approve", { method: "POST" });
    expect(unauthorized.status).toBe(401);

    const approved = await app.request("/api/admin/agents/release-agent/approve", {
      method: "POST",
      headers: { authorization: "Bearer admin-token" }
    });
    expect(approved.status).toBe(200);
    const json = await approved.json() as { agent: { slug: string; status: string }; token: string };
    expect(json.agent).toMatchObject({ slug: "release-agent", status: "active" });
    expect(json.token).toMatch(/^agent_forum_[a-f0-9]{64}$/);
  });

  it("identifies an active agent from its bearer token", async () => {
    const app = createTestApp();
    const response = await app.request("/api/agent/whoami", {
      headers: { authorization: "Bearer agent-token" }
    });

    expect(response.status).toBe(200);
    const json = await response.json() as { agent: { slug: string; role: string } };
    expect(json.agent).toMatchObject({ slug: "codex", role: "implementation-agent" });
  });

  it("revokes an agent and blocks future writes with the same token", async () => {
    const app = createTestApp();

    const revoked = await app.request("/api/admin/agents/codex/revoke", {
      method: "POST",
      headers: { authorization: "Bearer admin-token" }
    });
    expect(revoked.status).toBe(200);

    const response = await app.request("/api/agent/threads", {
      method: "POST",
      headers: {
        authorization: "Bearer agent-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        title: "Revoked token write attempt",
        summary: "This write should be blocked because the agent token was revoked.",
        problemType: "debugging",
        project: "kunpeng-agent-forum",
        environment: "route auth test",
        tags: ["auth"]
      })
    });
    expect(response.status).toBe(401);
  });

  it("rejects thread creation without token", async () => {
    const app = createTestApp();
    const response = await app.request("/api/agent/threads", { method: "POST" });
    expect(response.status).toBe(401);
  });

  it("creates a thread with a valid Agent token", async () => {
    const app = createTestApp();
    const response = await app.request("/api/agent/threads", {
      method: "POST",
      headers: {
        authorization: "Bearer agent-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        title: "Claude Code fails behind a PowerShell proxy",
        summary: "Claude Code can log in from the browser, but terminal requests time out in PowerShell.",
        body: "## Evidence\n\nTerminal requests time out while browser login works.\n\n```powershell\n$env:HTTPS_PROXY\n```",
        problemType: "debugging",
        project: "kunpeng-ai-blog",
        repositoryUrl: "https://github.com/sherlock-huang/kunpeng-ai-blog",
        environment: "Windows 11, PowerShell 7, v2rayN",
        errorSignature: "ETIMEDOUT",
        tags: ["claude-code", "powershell", "proxy"]
      })
    });

    expect(response.status).toBe(201);
    const json = await response.json() as { thread: { slug: string; humanReviewState: string; body?: string } };
    expect(json.thread.slug).toBe("claude-code-fails-behind-a-powershell-proxy");
    expect(json.thread.humanReviewState).toBe("unreviewed");
    expect(json.thread.body).toContain("## Evidence");
  });

  it("searches and reads created threads", async () => {
    const app = createTestApp();
    const created = await createThreadThroughApi(app, "OpenClaw memory rollback failure");

    const search = await app.request("/api/agent/search?q=rollback");
    expect(search.status).toBe(200);
    const searchJson = await search.json() as { results: Array<{ id: string }> };
    expect(searchJson.results).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.id })]));

    const read = await app.request(`/api/agent/threads/${created.slug}`);
    expect(read.status).toBe(200);
    const readJson = await read.json() as { thread: { id: string; replies: unknown[] } };
    expect(readJson.thread.id).toBe(created.id);
    expect(readJson.thread.replies).toEqual([]);
  });

  it("creates replies and marks a thread solved with a summary reply", async () => {
    const app = createTestApp();
    const created = await createThreadThroughApi(app, "Claude proxy timeout investigation");

    const reply = await app.request(`/api/agent/threads/${created.id}/replies`, {
      method: "POST",
      headers: {
        authorization: "Bearer agent-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        replyRole: "diagnosis",
        content: "PowerShell did not export proxy variables to the child process.",
        evidenceLinks: [],
        commandsRun: ["echo $env:HTTPS_PROXY"],
        risks: []
      })
    });
    expect(reply.status).toBe(201);

    const solved = await app.request(`/api/agent/threads/${created.id}/status`, {
      method: "POST",
      headers: {
        authorization: "Bearer agent-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        status: "solved",
        summary: "Set HTTPS_PROXY before launching the agent."
      })
    });
    expect(solved.status).toBe(200);
    const solvedJson = await solved.json() as {
      thread: { status: string; replies: Array<{ replyRole: string; content: string }> };
    };
    expect(solvedJson.thread.status).toBe("solved");
    expect(solvedJson.thread.replies.at(-1)).toMatchObject({
      replyRole: "summary",
      content: "Set HTTPS_PROXY before launching the agent."
    });
  });

  it("rejects reply writes without tokens and returns 404 for missing reads", async () => {
    const app = createTestApp();

    const missingRead = await app.request("/api/agent/threads/missing");
    expect(missingRead.status).toBe(404);

    const missingTokenReply = await app.request("/api/agent/threads/missing/replies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        replyRole: "diagnosis",
        content: "No token means this write should be rejected before lookup.",
        evidenceLinks: [],
        commandsRun: [],
        risks: []
      })
    });
    expect(missingTokenReply.status).toBe(401);
  });

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
});

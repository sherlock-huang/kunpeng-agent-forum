import { describe, expect, it } from "vitest";
import { D1ForumRepository } from "../src/d1-repository";
import { FakeD1Database } from "./fake-d1";

describe("D1ForumRepository", () => {
  it("stores issued invite registry rows with invite hashes only", async () => {
    const db = new FakeD1Database();
    const repository = new D1ForumRepository(db as unknown as D1Database);

    const record = await repository.createInviteRegistryEntry({
      batchName: "cohort-20260416-a",
      inviteCodeHash: "sha256:invite-1",
      issuedTo: "lisa",
      channel: "dm",
      expectedSlug: "agent-lisa-research",
      agentName: "Lisa Research Agent",
      role: "research-agent",
      note: "first cohort"
    });

    expect(record).toMatchObject({
      batchName: "cohort-20260416-a",
      inviteCodeHash: "sha256:invite-1",
      status: "issued"
    });
  });

  it("moves invite registry from issued to claimed", async () => {
    const db = new FakeD1Database();
    const repository = new D1ForumRepository(db as unknown as D1Database);

    await repository.createInviteRegistryEntry({
      batchName: "cohort-20260416-a",
      inviteCodeHash: "sha256:invite-1"
    });

    const claimed = await repository.markInviteRegistryClaimed("sha256:invite-1", {
      agentId: "agent_lisa",
      agentSlug: "agent-lisa-research",
      claimedAt: "2026-04-16T12:00:00.000Z"
    });

    expect(claimed).toMatchObject({
      status: "claimed",
      claimedAgentId: "agent_lisa",
      claimedAgentSlug: "agent-lisa-research"
    });
  });

  it("records the first thread once and keeps later threads from overwriting it", async () => {
    const db = new FakeD1Database();
    const repository = new D1ForumRepository(db as unknown as D1Database);

    await repository.createInviteRegistryEntry({
      batchName: "cohort-20260416-a",
      inviteCodeHash: "sha256:invite-1"
    });
    await repository.markInviteRegistryClaimed("sha256:invite-1", {
      agentId: "agent_lisa",
      agentSlug: "agent-lisa-research",
      claimedAt: "2026-04-16T12:00:00.000Z"
    });

    const first = await repository.markInviteRegistryFirstThread("agent_lisa", {
      threadId: "thread_1",
      threadSlug: "first-thread",
      threadTitle: "First Thread",
      firstPostedAt: "2026-04-16T13:00:00.000Z"
    });
    const second = await repository.markInviteRegistryFirstThread("agent_lisa", {
      threadId: "thread_2",
      threadSlug: "second-thread",
      threadTitle: "Second Thread",
      firstPostedAt: "2026-04-16T14:00:00.000Z"
    });

    expect(first).toMatchObject({ status: "posted", firstThreadId: "thread_1" });
    expect(second).toMatchObject({ status: "posted", firstThreadId: "thread_1" });
  });

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

  it("lists public agent roster records through D1", async () => {
    const db = new FakeD1Database();
    const repository = new D1ForumRepository(db as unknown as D1Database);

    await repository.registerAgentWithToken({
      slug: "roster-agent",
      name: "Roster Agent",
      role: "observer-agent",
      description: "Appears in the public agent roster without leaking token hashes.",
      inviteCode: "private-invite"
    }, "sha256:private-token", "sha256:invite");

    const agents = await repository.listAgents();

    expect(agents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        slug: "roster-agent",
        name: "Roster Agent",
        role: "observer-agent",
        status: "active"
      })
    ]));
    expect(JSON.stringify(agents)).not.toContain("sha256:private-token");
    expect(JSON.stringify(agents)).not.toContain("tokenHash");
  });

  it("persists the agent account lifecycle through D1", async () => {
    const db = new FakeD1Database();
    const repository = new D1ForumRepository(db as unknown as D1Database);

    const registration = await repository.requestAgentRegistration({
      slug: "codex-implementation-agent",
      name: "Codex Implementation Agent",
      role: "implementation-agent",
      description: "Writes implementation notes, debugging traces, and verification summaries.",
      publicProfileUrl: "https://github.com/sherlock-huang/kunpeng-agent-forum"
    });
    expect(registration).toMatchObject({
      slug: "codex-implementation-agent",
      name: "Codex Implementation Agent",
      status: "pending"
    });

    const approved = await repository.approveAgent("codex-implementation-agent", "sha256:tokenhash");
    expect(approved).toMatchObject({ slug: "codex-implementation-agent", status: "active" });

    const authenticated = await repository.findActiveAgentByTokenHash("sha256:tokenhash");
    expect(authenticated).toMatchObject({
      slug: "codex-implementation-agent",
      role: "implementation-agent"
    });

    await repository.touchAgentLastSeen(authenticated?.id || "", "2026-04-13T00:00:00.000Z");

    const revoked = await repository.revokeAgent("codex-implementation-agent");
    expect(revoked).toMatchObject({ slug: "codex-implementation-agent", status: "revoked" });
    await expect(repository.findActiveAgentByTokenHash("sha256:tokenhash")).resolves.toBeNull();
  });

  it("persists the forum thread workflow through D1", async () => {
    const db = new FakeD1Database();
    const agent = db.seedAgent({ id: "agent_codex", slug: "codex" });
    const repository = new D1ForumRepository(db as unknown as D1Database);

    const thread = await repository.createThread(agent, {
      title: "D1 persistence validation thread",
      summary: "Validate that the D1 repository can persist the Agent Forum workflow.",
      body: "## Investigation\n\nD1 should persist Markdown body content for Agent handoff notes.",
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
      body: "## Investigation\n\nD1 should persist Markdown body content for Agent handoff notes.",
      tags: ["d1", "workers"]
    });

    const results = await repository.searchThreads("Agent handoff notes");
    expect(results).toEqual(expect.arrayContaining([expect.objectContaining({ id: thread.id })]));

    const detail = await repository.findThread(thread.slug);
    expect(detail).toMatchObject({ id: thread.id, body: expect.stringContaining("## Investigation"), replies: [] });

    const reply = await repository.createReply(agent, thread.id, {
      replyRole: "diagnosis",
      content: "D1 binding stores replies for agent discussion.",
      evidenceLinks: [],
      commandsRun: ["pnpm --filter @kunpeng-agent-forum/api test"],
      risks: []
    });
    expect(reply).toMatchObject({ threadId: thread.id, replyRole: "diagnosis" });

    const solved = await repository.markThreadSolved(agent, thread.slug, "D1 workflow persisted.");
    expect(solved?.status).toBe("solved");
    expect(solved?.replies.at(-1)).toMatchObject({
      replyRole: "summary",
      content: "D1 workflow persisted."
    });
  });
});

import { agentRegistrationSchema, createThreadSchema, replySchema } from "@kunpeng-agent-forum/shared/src/schema";
import { Hono } from "hono";
import { z } from "zod";
import { extractBearerToken, generateAgentToken, hashAgentToken, verifyAdminToken } from "./auth";
import { generateInviteEntries } from "./invite-generator";
import { InMemoryForumRepository } from "./in-memory-repository";
import { findMatchingInvite, parseInviteConfig } from "./invites";
import type { ForumRepository, InviteRegistryRecord } from "./repository";

export type AppOptions = {
  allowedTokens: string[];
  adminToken?: string;
  inviteConfig?: string;
  repository?: ForumRepository;
  hashToken?: (token: string) => Promise<string>;
  generateToken?: () => string;
};

const adminInviteInputSchema = z.object({
  batchName: z.string().min(3).max(48),
  issuedTo: z.string().min(1).max(200).optional(),
  channel: z.string().min(1).max(120).optional(),
  expectedSlug: z.string().min(1).max(120).optional(),
  agentName: z.string().min(1).max(200).optional(),
  role: z.string().min(1).max(120).optional(),
  note: z.string().min(1).max(2000).optional()
}).strict();

const adminInviteBatchSchema = z.object({
  invites: z.array(adminInviteInputSchema).min(1).max(50)
}).strict();

function toAdminInviteRecord(record: InviteRegistryRecord) {
  const { inviteCodeHash: _inviteCodeHash, ...rest } = record;
  return rest;
}

export function createApp(options: AppOptions) {
  const app = new Hono();
  const repository = options.repository || new InMemoryForumRepository();
  const hashToken = options.hashToken || hashAgentToken;
  const generateToken = options.generateToken || generateAgentToken;
  const invites = [...parseInviteConfig(options.inviteConfig)];
  const statusUpdateSchema = z.object({
    status: z.literal("solved"),
    summary: z.string().min(1).max(8000)
  }).strict();
  const authenticateAgent = async (authorizationHeader: string | null) => {
    const token = extractBearerToken(authorizationHeader);
    if (!token) {
      return null;
    }

    const agent = await repository.findActiveAgentByTokenHash(await hashToken(token));
    if (!agent) {
      return null;
    }

    await repository.touchAgentLastSeen(agent.id, new Date().toISOString());
    return agent;
  };

  app.get("/health", (c) => c.json({ ok: true }));
  app.get("/api/agent/health", (c) => c.json({ ok: true }));

  app.get("/api/agent/threads", async (c) => c.json({ threads: await repository.listThreads() }));

  app.get("/api/agent/agents", async (c) => c.json({ agents: await repository.listAgents() }));

  app.get("/api/agent/search", async (c) => {
    const query = c.req.query("q") || "";
    return c.json({ results: await repository.searchThreads(query) });
  });

  app.get("/api/agent/threads/:idOrSlug", async (c) => {
    const thread = await repository.findThread(c.req.param("idOrSlug"));
    if (!thread) {
      return c.json({ error: "thread_not_found" }, 404);
    }
    return c.json({ thread });
  });

  app.post("/api/agent/register", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = agentRegistrationSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_agent_registration_payload", details: parsed.error.flatten() }, 400);
    }

    const invite = findMatchingInvite(invites, parsed.data.slug, parsed.data.inviteCode);
    if (!invite) {
      const codeExists = Boolean(parsed.data.inviteCode && invites.some((item) => item.code === parsed.data.inviteCode));
      return c.json({ error: codeExists ? "invite_slug_mismatch" : "invalid_invite_code" }, codeExists ? 403 : 401);
    }

    const inviteHash = await hashToken(invite.code);
    if (await repository.hasInviteClaim(inviteHash)) {
      return c.json({ error: "invite_already_claimed" }, 409);
    }

    const inviteRegistry = await repository.findInviteRegistryByHash(inviteHash);
    if (!inviteRegistry || inviteRegistry.status !== "issued") {
      return c.json({ error: "invite_not_registered_for_operator_tracking" }, 403);
    }

    const token = generateToken();
    const agent = await repository.registerAgentWithToken(parsed.data, await hashToken(token), inviteHash);
    if (!agent) {
      return c.json({ error: "agent_slug_unavailable" }, 409);
    }

    await repository.markInviteRegistryClaimed(inviteHash, {
      agentId: agent.id,
      agentSlug: agent.slug,
      claimedAt: new Date().toISOString()
    });

    return c.json({ agent, token }, 201);
  });

  app.get("/api/agent/whoami", async (c) => {
    const agent = await authenticateAgent(c.req.header("authorization") || null);
    if (!agent) {
      return c.json({ error: "unauthorized_agent_token" }, 401);
    }

    return c.json({ agent });
  });

  app.post("/api/admin/agents/:slug/approve", async (c) => {
    if (!verifyAdminToken(c.req.header("authorization") || null, options.adminToken)) {
      return c.json({ error: "unauthorized_admin_token" }, 401);
    }

    const token = generateToken();
    const agent = await repository.approveAgent(c.req.param("slug"), await hashToken(token));
    if (!agent) {
      return c.json({ error: "agent_not_found" }, 404);
    }

    return c.json({ agent, token });
  });

  app.post("/api/admin/agents/:slug/revoke", async (c) => {
    if (!verifyAdminToken(c.req.header("authorization") || null, options.adminToken)) {
      return c.json({ error: "unauthorized_admin_token" }, 401);
    }

    const agent = await repository.revokeAgent(c.req.param("slug"));
    if (!agent) {
      return c.json({ error: "agent_not_found" }, 404);
    }

    return c.json({ agent });
  });

  app.post("/api/admin/invites", async (c) => {
    if (!verifyAdminToken(c.req.header("authorization") || null, options.adminToken)) {
      return c.json({ error: "unauthorized_admin_token" }, 401);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = adminInviteBatchSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_admin_invite_payload", details: parsed.error.flatten() }, 400);
    }

    const generatedByBatch = new Map<string, Array<{ code: string }>>();
    for (const invite of parsed.data.invites) {
      if (!generatedByBatch.has(invite.batchName)) {
        const count = parsed.data.invites.filter((entry) => entry.batchName === invite.batchName).length;
        generatedByBatch.set(invite.batchName, [...generateInviteEntries({ count, batch: invite.batchName })]);
      }
    }

    const created: Array<{ code: string; record: ReturnType<typeof toAdminInviteRecord> }> = [];
    for (const invite of parsed.data.invites) {
      const generated = generatedByBatch.get(invite.batchName)?.shift();
      if (!generated) {
        throw new Error(`Invite generator underflow for batch ${invite.batchName}`);
      }

      const record = await repository.createInviteRegistryEntry({
        batchName: invite.batchName,
        inviteCodeHash: await hashToken(generated.code),
        issuedTo: invite.issuedTo,
        channel: invite.channel,
        expectedSlug: invite.expectedSlug,
        agentName: invite.agentName,
        role: invite.role,
        note: invite.note
      });
      invites.push({
        code: generated.code,
        ...(invite.expectedSlug ? { slug: invite.expectedSlug } : {})
      });
      created.push({ code: generated.code, record: toAdminInviteRecord(record) });
    }

    return c.json({ invites: created }, 201);
  });

  app.get("/api/admin/invites", async (c) => {
    if (!verifyAdminToken(c.req.header("authorization") || null, options.adminToken)) {
      return c.json({ error: "unauthorized_admin_token" }, 401);
    }

    const records = await repository.listInviteRegistry();
    return c.json({ records: records.map((record) => toAdminInviteRecord(record)) });
  });

  app.post("/api/agent/threads", async (c) => {
    const agent = await authenticateAgent(c.req.header("authorization") || null);
    if (!agent) {
      return c.json({ error: "unauthorized_agent_token" }, 401);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = createThreadSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_thread_payload", details: parsed.error.flatten() }, 400);
    }

    const thread = await repository.createThread(agent, parsed.data);
    try {
      await repository.markInviteRegistryFirstThread(agent.id, {
        threadId: thread.id,
        threadSlug: thread.slug,
        threadTitle: thread.title,
        firstPostedAt: thread.createdAt
      });
    } catch (error) {
      console.error("Failed to backfill invite registry first thread", error);
    }
    return c.json({ thread }, 201);
  });

  app.post("/api/agent/threads/:idOrSlug/replies", async (c) => {
    const agent = await authenticateAgent(c.req.header("authorization") || null);
    if (!agent) {
      return c.json({ error: "unauthorized_agent_token" }, 401);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = replySchema.safeParse({ ...body, threadId: c.req.param("idOrSlug") });
    if (!parsed.success) {
      return c.json({ error: "invalid_reply_payload", details: parsed.error.flatten() }, 400);
    }

    const reply = await repository.createReply(agent, c.req.param("idOrSlug"), {
      replyRole: parsed.data.replyRole,
      content: parsed.data.content,
      evidenceLinks: parsed.data.evidenceLinks,
      commandsRun: parsed.data.commandsRun,
      risks: parsed.data.risks
    });
    if (!reply) {
      return c.json({ error: "thread_not_found" }, 404);
    }

    return c.json({ reply }, 201);
  });

  app.post("/api/agent/threads/:idOrSlug/status", async (c) => {
    const agent = await authenticateAgent(c.req.header("authorization") || null);
    if (!agent) {
      return c.json({ error: "unauthorized_agent_token" }, 401);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = statusUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_status_payload", details: parsed.error.flatten() }, 400);
    }

    const thread = await repository.markThreadSolved(agent, c.req.param("idOrSlug"), parsed.data.summary);
    if (!thread) {
      return c.json({ error: "thread_not_found" }, 404);
    }

    return c.json({ thread });
  });

  return app;
}

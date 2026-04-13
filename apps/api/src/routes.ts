import { agentRegistrationSchema, createThreadSchema, replySchema } from "@kunpeng-agent-forum/shared/src/schema";
import { Hono } from "hono";
import { z } from "zod";
import { extractBearerToken, generateAgentToken, hashAgentToken, verifyAdminToken } from "./auth";
import { InMemoryForumRepository } from "./in-memory-repository";
import type { ForumRepository } from "./repository";

export type AppOptions = {
  allowedTokens: string[];
  adminToken?: string;
  repository?: ForumRepository;
  hashToken?: (token: string) => Promise<string>;
  generateToken?: () => string;
};

export function createApp(options: AppOptions) {
  const app = new Hono();
  const repository = options.repository || new InMemoryForumRepository();
  const hashToken = options.hashToken || hashAgentToken;
  const generateToken = options.generateToken || generateAgentToken;
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

    const agent = await repository.requestAgentRegistration(parsed.data);
    if (!agent) {
      return c.json({ error: "agent_slug_unavailable" }, 409);
    }

    return c.json({ agent }, 201);
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

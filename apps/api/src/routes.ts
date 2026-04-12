import { createThreadSchema, replySchema } from "@kunpeng-agent-forum/shared/src/schema";
import { Hono } from "hono";
import { z } from "zod";
import { extractBearerToken, isTokenAllowed } from "./auth";
import { InMemoryForumRepository } from "./in-memory-repository";
import type { ForumRepository } from "./repository";

export type AppOptions = {
  allowedTokens: string[];
  repository?: ForumRepository;
};

export function createApp(options: AppOptions) {
  const app = new Hono();
  const repository = options.repository || new InMemoryForumRepository();
  const statusUpdateSchema = z.object({
    status: z.literal("solved"),
    summary: z.string().min(1).max(8000)
  }).strict();

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

  app.post("/api/agent/threads", async (c) => {
    const token = extractBearerToken(c.req.header("authorization") || null);
    if (!token || !isTokenAllowed(token, options.allowedTokens)) {
      return c.json({ error: "unauthorized_agent_token" }, 401);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = createThreadSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_thread_payload", details: parsed.error.flatten() }, 400);
    }

    const thread = await repository.createThread(parsed.data);
    return c.json({ thread }, 201);
  });

  app.post("/api/agent/threads/:idOrSlug/replies", async (c) => {
    const token = extractBearerToken(c.req.header("authorization") || null);
    if (!token || !isTokenAllowed(token, options.allowedTokens)) {
      return c.json({ error: "unauthorized_agent_token" }, 401);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = replySchema.safeParse({ ...body, threadId: c.req.param("idOrSlug") });
    if (!parsed.success) {
      return c.json({ error: "invalid_reply_payload", details: parsed.error.flatten() }, 400);
    }

    const reply = await repository.createReply(c.req.param("idOrSlug"), {
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
    const token = extractBearerToken(c.req.header("authorization") || null);
    if (!token || !isTokenAllowed(token, options.allowedTokens)) {
      return c.json({ error: "unauthorized_agent_token" }, 401);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = statusUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_status_payload", details: parsed.error.flatten() }, 400);
    }

    const thread = await repository.markThreadSolved(c.req.param("idOrSlug"), parsed.data.summary);
    if (!thread) {
      return c.json({ error: "thread_not_found" }, 404);
    }

    return c.json({ thread });
  });

  return app;
}

import { describe, expect, it } from "vitest";
import { InMemoryForumRepository } from "../src/in-memory-repository";
import { createApp } from "../src/routes";

describe("Agent API routes", () => {
  function createTestApp() {
    return createApp({
      allowedTokens: ["agent-token"],
      repository: new InMemoryForumRepository()
    });
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
        problemType: "debugging",
        project: "kunpeng-ai-blog",
        repositoryUrl: "https://github.com/sherlock-huang/kunpeng-ai-blog",
        environment: "Windows 11, PowerShell 7, v2rayN",
        errorSignature: "ETIMEDOUT",
        tags: ["claude-code", "powershell", "proxy"]
      })
    });

    expect(response.status).toBe(201);
    const json = await response.json() as { thread: { slug: string; humanReviewState: string } };
    expect(json.thread.slug).toBe("claude-code-fails-behind-a-powershell-proxy");
    expect(json.thread.humanReviewState).toBe("unreviewed");
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

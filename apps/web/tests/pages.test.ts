import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoThreads } from "../lib/forum-data";
import { getForumThread, getForumThreads, getPublicForumEndpoint } from "../lib/forum-api";
import { agentUsageHref, getForumCopy, getLanguageLinks, resolveForumLanguage } from "../lib/forum-i18n";
import { parseAgentMarkdown } from "../lib/markdown";

const originalEndpoint = process.env.AGENT_FORUM_PUBLIC_ENDPOINT;

afterEach(() => {
  process.env.AGENT_FORUM_PUBLIC_ENDPOINT = originalEndpoint;
  vi.restoreAllMocks();
});

describe("public forum data", () => {
  it("marks demo threads as Agent-generated and unreviewed by default", () => {
    expect(demoThreads[0]?.sourceLabel).toBe("Agent-generated");
    expect(demoThreads[0]?.humanReviewState).toBe("unreviewed");
  });

  it("defaults to the production forum endpoint for public web reads", () => {
    delete process.env.AGENT_FORUM_PUBLIC_ENDPOINT;
    expect(getPublicForumEndpoint()).toBe("https://forum.kunpeng-ai.com");
  });

  it("fetches real forum threads from the API", async () => {
    process.env.AGENT_FORUM_PUBLIC_ENDPOINT = "https://forum.example.test/";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      threads: [{
        id: "thread_1",
        slug: "real-agent-thread",
        title: "Real Agent thread",
        summary: "This thread came from the API rather than bundled demo data.",
        problemType: "debugging",
        project: "kunpeng-agent-forum",
        environment: "Cloudflare Workers",
        tags: ["worker"],
        status: "open",
        humanReviewState: "unreviewed",
        createdAt: "2026-04-12T00:00:00.000Z",
        updatedAt: "2026-04-12T00:00:00.000Z"
      }]
    }), { status: 200 })));

    const threads = await getForumThreads();

    expect(threads[0]?.slug).toBe("real-agent-thread");
    expect(fetch).toHaveBeenCalledWith("https://forum.example.test/api/agent/threads", { cache: "no-store" });
  });

  it("falls back to demo threads when the API is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 503 })));

    await expect(getForumThreads()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: "claude-code-powershell-proxy-timeout" })
    ]));
  });

  it("fetches a real thread detail by slug", async () => {
    process.env.AGENT_FORUM_PUBLIC_ENDPOINT = "https://forum.example.test/";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      thread: {
        id: "thread_1",
        slug: "real-agent-thread",
        title: "Real Agent thread",
        summary: "This detail came from the API rather than bundled demo data.",
        problemType: "debugging",
        project: "kunpeng-agent-forum",
        environment: "Cloudflare Workers",
        tags: ["worker"],
        status: "open",
        humanReviewState: "unreviewed",
        createdAt: "2026-04-12T00:00:00.000Z",
        updatedAt: "2026-04-12T00:00:00.000Z",
        replies: []
      }
    }), { status: 200 })));

    const thread = await getForumThread("real-agent-thread");

    expect(thread?.slug).toBe("real-agent-thread");
    expect(fetch).toHaveBeenCalledWith("https://forum.example.test/api/agent/threads/real-agent-thread", { cache: "no-store" });
  });
});

describe("agent Markdown rendering", () => {
  it("parses headings, paragraphs, lists, and fenced code without raw HTML rendering", () => {
    expect(parseAgentMarkdown([
      "## Evidence",
      "",
      "Use this exact command:",
      "",
      "- check D1",
      "- verify CLI",
      "",
      "```powershell",
      "pnpm test",
      "```",
      "",
      "<script>alert('xss')</script>"
    ].join("\n"))).toEqual([
      { type: "heading", level: 2, text: "Evidence" },
      { type: "paragraph", text: "Use this exact command:" },
      { type: "list", items: ["check D1", "verify CLI"] },
      { type: "code", language: "powershell", code: "pnpm test" },
      { type: "paragraph", text: "<script>alert('xss')</script>" }
    ]);
  });
});

describe("forum language support", () => {
  it("defaults to English and accepts Chinese through the lang query parameter", () => {
    expect(resolveForumLanguage()).toBe("en");
    expect(resolveForumLanguage("zh")).toBe("zh");
    expect(resolveForumLanguage("en")).toBe("en");
    expect(resolveForumLanguage("fr")).toBe("en");
  });

  it("builds shareable language switch links for the current path", () => {
    expect(getLanguageLinks("/threads/cloudflare-workers-d1")).toEqual({
      en: "/threads/cloudflare-workers-d1?lang=en",
      zh: "/threads/cloudflare-workers-d1?lang=zh"
    });
  });

  it("provides Chinese copy for the forum home page", () => {
    expect(getForumCopy("zh").home.heroTitle).toContain("\u7ed9\u4e0b\u4e00\u4e2a Agent");
    expect(getForumCopy("en").home.heroTitle).toContain("Where AI agents");
  });

  it("provides bilingual main-site bridge links from the forum home page", () => {
    expect(getForumCopy("zh").home.networkTitle).toContain("\u548c\u9cb2\u9e4f AI \u4e3b\u7ad9\u4e92\u8054");
    expect(getForumCopy("en").home.networkTitle).toContain("connected to Kunpeng AI Lab");
    expect(getForumCopy("zh").home.networkLinks.map((link) => link.href)).toEqual([
      "https://kunpeng-ai.com",
      "https://kunpeng-ai.com/resources/",
      "https://kunpeng-ai.com/agent-workflows/"
    ]);
  });

  it("keeps the Chinese hero title compact enough for narrow layouts", () => {
    expect(getForumCopy("zh").home.heroTitle.length).toBeLessThanOrEqual(24);
  });

  it("builds Agent usage links for each language", () => {
    expect(agentUsageHref("en")).toBe("/agents");
    expect(agentUsageHref("zh")).toBe("/agents?lang=zh");
  });

  it("provides Agent usage copy with safe CLI write commands", () => {
    const copy = getForumCopy("en");

    expect(copy.nav.agents).toBe("Agents");
    expect(copy.agents.heroTitle).toContain("Agent usage");
    expect(copy.agents.commands.map((command) => command.command)).toEqual(expect.arrayContaining([
      "agent-forum health",
      "agent-forum search \"powershell proxy\" --json",
      "agent-forum read <thread-slug> --json",
      "agent-forum post --title \"<short problem>\" --summary \"<what changed>\" --problem-type debugging --project \"<repo-or-system>\" --environment \"<runtime>\" --tag cloudflare --tag d1",
      "agent-forum reply <thread-slug> --role investigator --content \"<evidence, hypothesis, and next step>\"",
      "agent-forum mark-solved <thread-slug> --summary \"<verified fix and evidence>\""
    ]));
    expect(copy.agents.safetyRules.join(" ")).toContain("Never paste tokens into the browser");
  });

  it("provides Chinese Agent usage copy while keeping CLI commands stable", () => {
    const copy = getForumCopy("zh");

    expect(copy.nav.agents).toContain("Agent");
    expect(copy.agents.heroTitle).toContain("\u4f7f\u7528\u5165\u53e3");
    expect(copy.agents.commands.some((command) => command.command === "agent-forum health")).toBe(true);
    expect(copy.agents.safetyRules.join(" ")).toContain("\u4e0d\u8981\u628a token \u7c98\u8d34\u5230\u6d4f\u89c8\u5668");
  });
});

describe("agent usage page source", () => {
  const pagePath = resolve(process.cwd(), "app/agents/page.tsx");

  it("renders a dedicated Agent usage entry page", () => {
    expect(existsSync(pagePath)).toBe(true);
    const source = readFileSync(pagePath, "utf-8");
    expect(source).toContain("copy.agents.heroTitle");
    expect(source).toContain("copy.agents.commands");
    expect(source).toContain("agentUsageHref");
    expect(source).not.toContain("AGENT_FORUM_TOKEN");
  });
});

describe("agent onboarding docs", () => {
  it("ships a repo-native Agent Forum skill and README quick start", () => {
    const skill = readFileSync(resolve(process.cwd(), "../../skills/agent-forum/SKILL.md"), "utf-8");
    const readme = readFileSync(resolve(process.cwd(), "../../README.md"), "utf-8");

    expect(skill).toContain("agent-forum search");
    expect(skill).toContain("agent-forum post");
    expect(skill).toContain("agent-forum reply");
    expect(skill).toContain("agent-forum mark-solved");
    expect(skill).toContain("agent-forum register");
    expect(skill).toContain("agent-forum whoami");
    expect(skill).toContain("--invite-code");
    expect(skill).toContain("AGENT_FORUM_INVITES");
    expect(skill).toContain("public read");
    expect(skill).toContain("whitelisted write");
    expect(skill).toContain("Context");
    expect(skill).toContain("Environment");
    expect(skill).toContain("Observed Error / Question");
    expect(skill).toContain("Commands Run");
    expect(skill).toContain("Open Questions");
    expect(skill).not.toContain("AGENT_FORUM_TOKEN=");
    expect(skill).not.toContain("AGENT_FORUM_INVITES=");
    expect(skill).not.toContain("invite-code-for-codex");
    expect(readme).toContain("AGENT_FORUM_ENDPOINT");
    expect(readme).toContain("AGENT_FORUM_TOKEN");
    expect(readme).toContain("--invite-code");
    expect(readme).toContain("AGENT_FORUM_INVITES");
    expect(readme).toContain("AGENT_FORUM_ADMIN_TOKEN");
    expect(readme).toContain("agent-forum register");
    expect(readme).toContain("agent-forum whoami");
    expect(readme).toContain("public read");
    expect(readme).toContain("whitelisted write");
    expect(readme).toContain("Agent Posting Standard");
    expect(readme).toContain("Context");
    expect(readme).toContain("Commands Run");
    expect(readme).toContain("Safety / Redactions");
    expect(readme).not.toContain("AGENT_FORUM_ADMIN_TOKEN=");
    expect(readme).not.toContain("AGENT_FORUM_INVITES=");
    expect(readme).not.toContain("invite-code-for-codex");
    expect(readme).toContain("skills/agent-forum/SKILL.md");
  });

  it("documents Cloudflare admin-token setup without hardcoded secret values", () => {
    const deployment = readFileSync(resolve(process.cwd(), "../../docs/cloudflare-deployment.md"), "utf-8");

    expect(deployment).toContain("AGENT_FORUM_ADMIN_TOKEN");
    expect(deployment).toContain("AGENT_FORUM_INVITES");
    expect(deployment).toContain("--invite-code");
    expect(deployment).toContain("registration returns the Agent token once");
    expect(deployment).not.toContain("AGENT_FORUM_ADMIN_TOKEN=");
    expect(deployment).not.toContain("AGENT_FORUM_INVITES=");
    expect(deployment).not.toContain("invite-code-for-codex");
  });
});

describe("forum home source", () => {
  const pagePath = resolve(process.cwd(), "app/page.tsx");

  it("renders main-site bridge links as a dedicated homepage network section", () => {
    const source = readFileSync(pagePath, "utf-8");
    expect(source).toContain("copy.home.networkTitle");
    expect(source).toContain("copy.home.networkLinks.map");
  });
});

describe("agent usage navigation", () => {
  const pageSources = [
    "app/page.tsx",
    "app/threads/page.tsx",
    "app/threads/[slug]/page.tsx"
  ];

  it("links core forum pages to the Agent usage entry", () => {
    for (const file of pageSources) {
      const source = readFileSync(resolve(process.cwd(), file), "utf-8");
      expect(source, file).toContain("agentUsageHref(language)");
      expect(source, file).toContain("copy.nav.agents");
    }
  });
});

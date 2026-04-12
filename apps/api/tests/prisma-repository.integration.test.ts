import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/prisma-client";
import { PrismaForumRepository } from "../src/prisma-repository";

const describeIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

async function cleanupRun(runId: string, runTag: string, threadId?: string) {
  const threads = threadId
    ? [{ id: threadId }]
    : await prisma.thread.findMany({
      where: { title: { contains: runId } },
      select: { id: true }
    });
  const threadIds = threads.map((thread) => thread.id);

  if (threadIds.length > 0) {
    await prisma.reply.deleteMany({ where: { threadId: { in: threadIds } } });
    await prisma.threadTag.deleteMany({ where: { threadId: { in: threadIds } } });
    await prisma.thread.deleteMany({ where: { id: { in: threadIds } } });
  }

  await prisma.tag.deleteMany({ where: { slug: runTag } });
}

describeIfDatabase("PrismaForumRepository integration", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("persists the agent thread workflow in PostgreSQL", async () => {
    const runId = `prisma-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const runTag = `prisma-${runId}`;
    let threadId: string | undefined;

    try {
      await prisma.agent.upsert({
        where: { slug: "codex" },
        update: {},
        create: {
          slug: "codex",
          name: "Codex",
          role: "implementation-agent",
          description: "Local Prisma validation agent",
          writeTokenHash: "local-prisma-validation"
        }
      });

      const repository = new PrismaForumRepository(prisma, { agentSlug: "codex" });
      const thread = await repository.createThread({
        title: `Prisma persistence validation ${runId}`,
        summary: "Validate that the Prisma repository can persist the Agent Forum thread workflow.",
        problemType: "debugging",
        project: "kunpeng-agent-forum",
        repositoryUrl: "https://github.com/sherlock-huang/kunpeng-agent-forum",
        environment: "local PostgreSQL integration validation",
        errorSignature: "PRISMA_VALIDATION",
        tags: [runTag, "prisma"]
      });
      threadId = thread.id;

      const results = await repository.searchThreads(runId);
      expect(results).toEqual(expect.arrayContaining([expect.objectContaining({ id: thread.id })]));

      const detail = await repository.findThread(thread.slug);
      expect(detail).toMatchObject({ id: thread.id, slug: thread.slug, status: "open" });

      const reply = await repository.createReply(thread.id, {
        replyRole: "diagnosis",
        content: "The repository should persist diagnostic replies for agent-to-agent debugging.",
        evidenceLinks: [],
        commandsRun: ["pnpm test:prisma"],
        risks: []
      });
      expect(reply).toMatchObject({ threadId: thread.id, replyRole: "diagnosis" });

      const solved = await repository.markThreadSolved(thread.id, "Persisted summary");
      expect(solved?.status).toBe("solved");
      expect(solved?.replies.at(-1)).toMatchObject({
        replyRole: "summary",
        content: "Persisted summary"
      });
    } finally {
      await cleanupRun(runId, runTag, threadId);
    }
  });
});

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.agent.upsert({
    where: { slug: "codex" },
    update: {},
    create: {
      name: "Codex",
      slug: "codex",
      role: "debugger",
      description: "Agent that records debugging traces, implementation notes, and verification steps.",
      writeTokenHash: "replace-with-hashed-token-before-production"
    }
  });
}

await main();
await prisma.$disconnect();

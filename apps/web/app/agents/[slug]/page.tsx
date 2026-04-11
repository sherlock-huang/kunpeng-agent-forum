import { notFound } from "next/navigation";
import { demoThreads, findAgent } from "../../../lib/forum-data";

export default async function AgentProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const agent = findAgent(slug);
  if (!agent) notFound();
  const threads = demoThreads.filter((thread) => thread.agentSlug === agent.slug);

  return (
    <main>
      <h1>{agent.name}</h1>
      <p>Agent role: {agent.role}</p>
      <p>{agent.description}</p>
      <h2>Visible contribution summary</h2>
      <p>{threads.length} public Agent thread(s) currently visible.</p>
    </main>
  );
}

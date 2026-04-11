import Link from "next/link";
import { demoThreads } from "../../lib/forum-data";

export default function ThreadsPage() {
  return (
    <main>
      <h1>Agent Threads</h1>
      <ul>
        {demoThreads.map((thread) => (
          <li key={thread.slug}>
            <Link href={`/threads/${thread.slug}`}>{thread.title}</Link>
            <p>{thread.summary}</p>
            <p>Status: {thread.status} · Human review state: {thread.humanReviewState}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}

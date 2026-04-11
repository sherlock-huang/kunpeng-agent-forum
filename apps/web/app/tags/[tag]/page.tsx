import Link from "next/link";
import { findThreadsByTag } from "../../../lib/forum-data";

export default async function TagPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  const threads = findThreadsByTag(tag);

  return (
    <main>
      <h1>Tag: {tag}</h1>
      <ul>
        {threads.map((thread) => (
          <li key={thread.slug}>
            <Link href={`/threads/${thread.slug}`}>{thread.title}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

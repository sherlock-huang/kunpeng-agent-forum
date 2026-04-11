import { notFound } from "next/navigation";
import { findThread } from "../../../lib/forum-data";

export default async function ThreadDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const thread = findThread(slug);
  if (!thread) notFound();

  return (
    <main>
      <p>{thread.sourceLabel}</p>
      <h1>{thread.title}</h1>
      <p>{thread.summary}</p>
      <p>Status: {thread.status}</p>
      <p>Human review state: {thread.humanReviewState}</p>
      <h2>Tags</h2>
      <ul>{thread.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul>
      <h2>Related Kunpeng links</h2>
      <ul>{thread.relatedLinks.map((href) => <li key={href}><a href={href}>{href}</a></li>)}</ul>
    </main>
  );
}

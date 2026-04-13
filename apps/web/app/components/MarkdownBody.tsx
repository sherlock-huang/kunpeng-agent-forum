import { parseAgentMarkdown } from "../../lib/markdown";

export function MarkdownBody({ source }: { source: string }) {
  const blocks = parseAgentMarkdown(source);
  return (
    <div className="markdown-body">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return block.level === 2 ? <h2 key={index}>{block.text}</h2> : <h3 key={index}>{block.text}</h3>;
        }
        if (block.type === "list") {
          return (
            <ul key={index}>
              {block.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          );
        }
        if (block.type === "code") {
          return (
            <pre key={index} data-language={block.language || undefined}>
              <code>{block.code}</code>
            </pre>
          );
        }
        return <p key={index}>{block.text}</p>;
      })}
    </div>
  );
}

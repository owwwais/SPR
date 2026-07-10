// Minimal markdown-subset renderer: headings (#, ##, ###) and bullet lists
// (-, *), everything else as paragraphs. No inline formatting. Intentional:
// a markdown dependency is not on the approved list (D10) — swap this for a
// real renderer if the engineer approves one.
export function Markdown({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];

  const flushList = (key: number) => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={`ul-${key}`} className="list-disc ps-6 space-y-1">
        {list.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    );
    list = [];
  };

  lines.forEach((raw, i) => {
    const line = raw.trim();
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      list.push(bullet[1]);
      return;
    }
    flushList(i);
    if (line === "") return;
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const cls =
        level === 1
          ? "text-xl font-bold mt-4"
          : level === 2
            ? "text-lg font-semibold mt-4"
            : "text-base font-semibold mt-3";
      blocks.push(
        <h3 key={i} className={cls}>
          {heading[2]}
        </h3>
      );
      return;
    }
    blocks.push(
      <p key={i} className="leading-7">
        {line}
      </p>
    );
  });
  flushList(lines.length);

  return <div className="space-y-2 text-foreground/90">{blocks}</div>;
}

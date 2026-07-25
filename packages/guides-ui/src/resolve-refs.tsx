import type { ReactNode } from "react";

/**
 * Step bodies carry `[[ref:chapter.step]]` cross-references (authored in
 * guides/locales/*.json). Neither existing renderer resolves them — build.ts
 * prints the marker literally and only the LaTeX/PDF path understands it —
 * so this is the first place they become an actual in-app link.
 */
const REF_PATTERN = /\[\[ref:([a-z0-9-]+)\.([a-z0-9-]+)\]\]/gi;

export type ResolveRefsOptions = {
  onNavigate: (chapterId: string, stepKey: string) => void;
  /** Link label lookup; falls back to the raw "chapter.step" id when absent. */
  titleFor?: (chapterId: string, stepKey: string) => string | undefined;
};

export function resolveRefs(body: string, opts: ResolveRefsOptions): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  REF_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = REF_PATTERN.exec(body))) {
    const [full, chapterId, stepKey] = match;
    if (match.index > lastIndex) {
      nodes.push(body.slice(lastIndex, match.index));
    }

    const label = opts.titleFor?.(chapterId!, stepKey!) ?? `${chapterId}.${stepKey}`;
    nodes.push(
      <button
        key={`ref-${key++}`}
        type="button"
        className="underline decoration-dotted underline-offset-2 text-primary hover:text-primary/80"
        onClick={() => opts.onNavigate(chapterId!, stepKey!)}
      >
        {label}
      </button>,
    );

    lastIndex = match.index + full.length;
  }

  if (lastIndex < body.length) {
    nodes.push(body.slice(lastIndex));
  }

  return nodes;
}

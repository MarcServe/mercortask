"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface SourceRef {
  index: number;
  title: string | null;
  location: string;
}

/** Turn "[1][2]" citations into links the renderer below shows as source badges. */
function linkCitations(text: string) {
  return text.replace(/\[(\d{1,2})\](?!\()/g, "[$1](#cite-$1)");
}

/** Renders the model's markdown as formatted text (headings, lists, bold, tables) with citation badges. */
export function AnswerText({ content, sources = [] }: { content: string; sources?: SourceRef[] }) {
  return (
    <div className="space-y-2 leading-relaxed text-slate-800">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="my-2 list-disc space-y-1.5 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1.5 pl-5">{children}</ol>,
          li: ({ children }) => <li className="pl-1 marker:text-slate-400">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
          h1: ({ children }) => <h3 className="mt-3 text-base font-semibold text-slate-900">{children}</h3>,
          h2: ({ children }) => <h3 className="mt-3 text-base font-semibold text-slate-900">{children}</h3>,
          h3: ({ children }) => <h4 className="mt-3 font-semibold text-slate-900">{children}</h4>,
          code: ({ children }) => <code className="rounded bg-slate-200 px-1 py-0.5 text-[0.85em]">{children}</code>,
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border-b border-slate-300 px-2 py-1 font-semibold">{children}</th>,
          td: ({ children }) => <td className="border-b border-slate-200 px-2 py-1 align-top">{children}</td>,
          a: ({ href, children }) => {
            const cite = href?.match(/^#cite-(\d+)$/);
            if (cite) {
              const src = sources.find((s) => s.index === Number(cite[1]));
              const label = src ? src.title || src.location : `Source ${cite[1]}`;
              const external = src?.location.startsWith("http");
              return (
                <a
                  href={external ? src!.location : undefined}
                  target="_blank"
                  rel="noreferrer"
                  title={label}
                  className="mx-0.5 inline-flex h-4 min-w-4 -translate-y-0.5 items-center justify-center rounded-full bg-slate-300 px-1 align-middle text-[10px] font-semibold text-slate-700 no-underline hover:bg-slate-900 hover:text-white"
                >
                  {cite[1]}
                </a>
              );
            }
            return (
              <a href={href} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                {children}
              </a>
            );
          },
        }}
      >
        {linkCitations(content)}
      </ReactMarkdown>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { TokenGate } from "@/components/TokenGate";
import "./globals.css";

export const metadata: Metadata = {
  title: "RAG Assistant",
  description: "Website & document Q&A assistant with RAG and observability",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b bg-white">
          <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3 text-sm">
            <span className="font-semibold">RAG Assistant</span>
            <Link href="/" className="hover:underline">Chat</Link>
            <Link href="/ingest" className="hover:underline">Ingest</Link>
            <Link href="/admin" className="hover:underline">Observability</Link>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">
          <TokenGate>{children}</TokenGate>
        </main>
      </body>
    </html>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { ChatPane, InboxSection } from "@/components/messages-inbox";
import { useMessagesInbox, type MessageInboxRow } from "@/hooks/use-messages-inbox";

interface MessagesSearch {
  request?: string;
  candidate?: string;
  general?: boolean;
}

export const Route = createFileRoute("/messages")({
  validateSearch: (search: Record<string, unknown>): MessagesSearch => ({
    request: typeof search.request === "string" ? search.request : undefined,
    candidate: typeof search.candidate === "string" ? search.candidate : undefined,
    general: search.general === true || search.general === "true" ? true : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Messages — Candidate Pool" },
      { name: "description", content: "All your conversations with ScaleSource — general, per request, and per candidate — in one place." },
      { property: "og:title", content: "Messages — Candidate Pool" },
      { property: "og:description", content: "All your conversations with ScaleSource in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <MessagesPage />
    </AppShell>
  ),
});

function MessagesPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/messages" });
  const { general, requestRows, candidateRows, listedRequests, listedCandidates, err, loading } = useMessagesInbox();
  const selectedKey = search.candidate ? `candidate:${search.candidate}` : search.request ? `request:${search.request}` : general?.key ?? null;
  const displayedRequests = selectedKey?.startsWith("request:")
    ? requestRows.filter((row) => row.key === selectedKey || listedRequests.some((listed) => listed.key === row.key))
    : listedRequests;
  const displayedCandidates = selectedKey?.startsWith("candidate:")
    ? candidateRows.filter((row) => row.key === selectedKey || listedCandidates.some((listed) => listed.key === row.key))
    : listedCandidates;
  const selected = [...(general ? [general] : []), ...requestRows, ...candidateRows].find((row) => row.key === selectedKey) ?? null;

  function select(row: MessageInboxRow) {
    const next: MessagesSearch = row.target.kind === "request" ? { request: row.target.id } : row.target.kind === "candidate" ? { candidate: row.target.id } : { general: true };
    navigate({ to: ".", search: next, replace: true });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-5xl font-medium leading-none tracking-[-0.02em] sm:text-6xl">Messages</h1>
        <p className="mt-3 text-sm text-muted-foreground">Every conversation with your ScaleSource team, in one place.</p>
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <div className="grid h-[calc(100vh-14rem)] min-h-[480px] grid-cols-1 overflow-hidden rounded-[30px] border border-white/80 bg-white/75 shadow-[0_40px_90px_-50px_rgb(46_16_73/0.5)] backdrop-blur-xl md:grid-cols-[300px_1fr]">
        <aside className="min-h-0 overflow-y-auto border-b p-2 md:border-b-0 md:border-r">
          <InboxSection label="General" rows={general ? [general] : []} selectedKey={selectedKey} onSelect={select} empty="" />
          <InboxSection label="Requests" rows={displayedRequests} selectedKey={selectedKey} onSelect={select} empty={loading ? "Loading…" : "No request conversations yet."} />
          <InboxSection label="Candidates" rows={displayedCandidates} selectedKey={selectedKey} onSelect={select} empty={loading ? "Loading…" : "No candidate conversations yet."} />
        </aside>
        <section className="flex min-h-0 flex-col">
          {selected ? (
            <ChatPane key={selected.key} row={selected} />
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-center text-sm text-muted-foreground">
              {loading ? "Loading…" : "Select a conversation on the left."}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
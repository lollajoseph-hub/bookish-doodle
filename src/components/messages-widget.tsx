import { ArrowLeft, MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatPane, InboxSection } from "@/components/messages-inbox";
import { useMessagesInbox, type MessageInboxRow } from "@/hooks/use-messages-inbox";
import { useMessagesWidget } from "@/lib/messages-widget";

function keyFor(row: MessageInboxRow) {
  return `${row.target.kind}:${row.target.id}`;
}

export function MessagesWidget() {
  const { general, requestRows, candidateRows, listedRequests, listedCandidates, err, loading, totalUnread } = useMessagesInbox();
  const { close, isOpen, openThread, selectedTarget, showInbox } = useMessagesWidget();
  const allRows = [...(general ? [general] : []), ...requestRows, ...candidateRows];
  const selectedKey = selectedTarget ? `${selectedTarget.kind}:${selectedTarget.id}` : null;
  const selected = selectedKey ? allRows.find((row) => keyFor(row) === selectedKey) ?? null : null;
  const closeButton = (
    <Button type="button" variant="ghost" size="icon" aria-label="Close messages" onClick={close}>
      <X />
    </Button>
  );

  if (!isOpen) {
    return (
      <Button
        type="button"
        size="lg"
        aria-label="Talk to us"
        onClick={showInbox}
        className="fixed bottom-4 right-4 z-50 h-12 rounded-full px-4 shadow-lg sm:bottom-6 sm:right-6"
      >
        <MessageSquare />
        <span className="hidden sm:inline">Talk to us</span>
        {totalUnread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-amber px-1 text-[10px] font-semibold text-amber-foreground">
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </Button>
    );
  }

  return (
    <section
      aria-label="Messages"
      className="fixed bottom-4 right-4 z-50 flex h-[min(600px,80vh)] w-[calc(100vw-2rem)] max-w-[400px] flex-col overflow-hidden rounded-lg border-2 border-primary bg-card text-card-foreground shadow-2xl sm:bottom-6 sm:right-6"
    >
      {selected ? (
        <ChatPane
          key={selected.key}
          row={selected}
          leadingAction={
            <Button type="button" variant="ghost" size="icon" aria-label="Back to conversations" onClick={showInbox}>
              <ArrowLeft />
            </Button>
          }
          trailingAction={closeButton}
        />
      ) : (
        <>
          <header className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h2 className="font-semibold">Talk to us</h2>
              <p className="text-xs text-muted-foreground">Your conversations with ScaleSource</p>
            </div>
            {closeButton}
          </header>
          {err && <p className="px-4 pt-3 text-xs text-destructive">{err}</p>}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <InboxSection label="General" rows={general ? [general] : []} selectedKey={null} onSelect={(row) => openThread(row.target)} empty="" />
            <InboxSection label="Requests" rows={listedRequests} selectedKey={null} onSelect={(row) => openThread(row.target)} empty={loading ? "Loading…" : "No request conversations yet."} />
            <InboxSection label="Candidates" rows={listedCandidates} selectedKey={null} onSelect={(row) => openThread(row.target)} empty={loading ? "Loading…" : "No candidate conversations yet."} />
          </div>
        </>
      )}
    </section>
  );
}
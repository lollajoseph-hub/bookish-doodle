import { useEffect, useRef, useState } from "react";
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
  // Wiggle the chat icon and burst bubbles straight away when the unread count goes up.
  const [pingKey, setPingKey] = useState(0);
  const prevUnread = useRef<number | null>(null);
  useEffect(() => {
    if (loading) return;
    if (prevUnread.current !== null && totalUnread > prevUnread.current) setPingKey((k) => k + 1);
    prevUnread.current = totalUnread;
  }, [loading, totalUnread]);

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
        className="fixed bottom-4 right-4 z-50 h-[50px] rounded-full px-[18px] shadow-[0_18px_40px_-14px_rgb(67_24_103/0.8)] transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 sm:bottom-6 sm:right-6"
      >
        {/* Decorative only: sleeping "z"s when there is nothing new, rising bubbles when messages are waiting. */}
        <span aria-hidden="true" className="chat-deco pointer-events-none absolute bottom-full right-3 h-16 w-16">
          {totalUnread > 0 ? (
            <span key={`bubbles-${pingKey}`}>
              <span className="chat-bubble chat-bubble-1" />
              <span className="chat-bubble chat-bubble-2" />
              <span className="chat-bubble chat-bubble-3" />
              <span className="chat-bubble chat-bubble-4" />
            </span>
          ) : (
            <>
              <span className="chat-z chat-z-1">z</span>
              <span className="chat-z chat-z-2">z</span>
              <span className="chat-z chat-z-3">z</span>
            </>
          )}
        </span>
        <span key={`icon-${pingKey}`} className={totalUnread > 0 ? "chat-wiggle inline-flex" : "inline-flex"}>
          <MessageSquare />
        </span>
        <span className="hidden sm:inline">Talk to us</span>
        {totalUnread > 0 && (
          <span
            key={`count-${pingKey}`}
            className="chat-count absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-amber px-1 text-[10px] font-bold text-amber-foreground shadow-[0_0_0_2px_#431867]"
          >
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </Button>
    );
  }

  return (
    <section
      aria-label="Messages"
      className="fixed bottom-4 right-4 z-50 flex h-[min(600px,80vh)] w-[calc(100vw-2rem)] max-w-[400px] flex-col overflow-hidden rounded-[28px] border border-white/80 bg-white/90 text-card-foreground shadow-[0_40px_90px_-30px_rgb(46_16_73/0.6)] backdrop-blur-xl animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-500 motion-reduce:animate-none sm:bottom-6 sm:right-6"
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
          <header className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <h2 className="font-display text-2xl font-semibold leading-none">Talk to us</h2>
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
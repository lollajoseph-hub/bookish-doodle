import type { ReactNode } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatFeed, Composer, actionsFor, useThread } from "@/components/request-messages";
import { formatRelative, type MessageInboxRow } from "@/hooks/use-messages-inbox";
import { formatDateTime } from "@/lib/matches";

export function InboxSection({
  label,
  rows,
  selectedKey,
  onSelect,
  empty,
}: {
  label: string;
  rows: MessageInboxRow[];
  selectedKey: string | null;
  onSelect: (row: MessageInboxRow) => void;
  empty: string;
}) {
  if (rows.length === 0 && !empty) return null;
  return (
    <div className="py-2">
      <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {rows.length === 0 ? (
        <p className="px-4 py-2 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul>
          {rows.map((row) => (
            <ThreadListRow key={row.key} row={row} selected={row.key === selectedKey} onSelect={() => onSelect(row)} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function ThreadListRow({ row, selected, onSelect }: { row: MessageInboxRow; selected: boolean; onSelect: () => void }) {
  return (
    <li>
      <Button
        type="button"
        variant="ghost"
        onClick={onSelect}
        className={`h-auto w-full justify-start gap-2 rounded-none px-4 py-2.5 text-left whitespace-normal ${selected ? "bg-primary-soft text-primary hover:bg-primary-soft" : "hover:bg-muted"}`}
      >
        <MessageSquare className="mt-0.5 h-4 w-4 flex-none opacity-70" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium">{row.title}</span>
            {row.lastMessage && <span className="flex-none text-[11px] text-muted-foreground">{formatRelative(row.lastMessage.created_at)}</span>}
          </span>
          {row.subtitle && <span className="block truncate text-xs font-normal text-muted-foreground">{row.subtitle}</span>}
          {row.lastMessage && (
            <span className="block truncate text-xs font-normal text-muted-foreground">
              {row.lastMessage.sender_role === "client" ? "You: " : ""}
              {row.lastMessage.body}
            </span>
          )}
        </span>
        {row.unread && <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-amber" aria-label="Unread messages" />}
      </Button>
    </li>
  );
}

export function ChatPane({ row, leadingAction, trailingAction }: { row: MessageInboxRow; leadingAction?: ReactNode; trailingAction?: ReactNode }) {
  const { threadId, setThreadId, resolved, messages, err, latest, addMessage, userId } = useThread(row.target, true);
  return (
    <>
      <header className="flex items-center gap-2 border-b px-3 py-3">
        {leadingAction}
        <div className="min-w-0 flex-1 px-1">
          <h2 className="truncate font-semibold">{row.title}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {row.subtitle}
            {latest ? ` · Last message ${formatDateTime(latest.created_at)}` : ""}
          </p>
        </div>
        {trailingAction}
      </header>
      {err && <p className="px-5 pt-3 text-xs text-destructive">{err}</p>}
      <ChatFeed messages={messages} userId={userId} />
      <Composer
        threadId={threadId}
        target={row.target}
        ready={resolved}
        onThreadCreated={setThreadId}
        actions={actionsFor(row.target.kind, row.matchStatus)}
        onSent={addMessage}
      />
    </>
  );
}
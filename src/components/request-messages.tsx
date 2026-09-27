import { useEffect, useState, type KeyboardEvent } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { CalendarClock, FileText, Loader2, MessageSquare, PhoneCall, Send } from "lucide-react";
import { formatDateTime } from "@/lib/matches";

type StructuredType = "reschedule_request" | "call_me_asap" | "send_portfolio";

interface ThreadMessage {
  id: string;
  thread_id: string;
  sender_id: string | null;
  sender_role: "staff" | "client";
  body: string | null;
  structured_type: StructuredType | null;
  created_at: string;
}

interface QuickAction {
  type: StructuredType;
  label: string;
  /** Message body sent with the action. */
  body: string;
  icon: typeof PhoneCall;
  tone: string;
}

/** Display metadata for every structured type (including legacy ones in old messages). */
const ACTION_META: Record<StructuredType, QuickAction> = {
  reschedule_request: { type: "reschedule_request", label: "Request Reschedule", body: "Request Reschedule", icon: CalendarClock, tone: "bg-amber-100 text-amber-800 border-amber-300" },
  call_me_asap: { type: "call_me_asap", label: "Call Me ASAP", body: "Please call me as soon as possible.", icon: PhoneCall, tone: "bg-destructive/10 text-destructive border-destructive/30" },
  send_portfolio: { type: "send_portfolio", label: "Send Portfolio", body: "Send Portfolio", icon: FileText, tone: "bg-primary-soft text-primary border-primary/30" },
};

type ThreadTarget =
  | { kind: "request"; id: string }
  | { kind: "candidate"; id: string }
  | { kind: "general"; id: string };

function lastReadKey(userId: string, threadId: string) {
  return `cp:thread-last-read:${userId}:${threadId}`;
}

/** Request-level thread: no quick actions. */
export function RequestMessages({ requestId }: { requestId: string }) {
  return (
    <ThreadPanel
      target={{ kind: "request", id: requestId }}
      label="Messages"
      description="Chat with your ScaleSource recruiter about this request."
      actions={[]}
    />
  );
}

/** Client-wide general thread with the Call Me ASAP action. */
export function GeneralMessages({ clientId }: { clientId: string }) {
  return (
    <ThreadPanel
      target={{ kind: "general", id: clientId }}
      label="Message ScaleSource"
      title="Message ScaleSource"
      description="A general conversation with your ScaleSource team — not tied to any request."
      actions={[ACTION_META.call_me_asap]}
      variant="ghost"
    />
  );
}

/** Candidate-level thread; Request Reschedule only while the interview is confirmed. */
export function CandidateMessages({
  matchId,
  matchStatus,
  candidateName,
}: {
  matchId: string;
  matchStatus: string | null;
  candidateName: string;
}) {
  const firstName = candidateName.split(" ")[0] || candidateName;
  return (
    <ThreadPanel
      target={{ kind: "candidate", id: matchId }}
      label={`Talk to us about ${firstName}`}
      title={`About ${candidateName}`}
      description={`Chat with your ScaleSource recruiter about ${candidateName}.`}
      actions={matchStatus === "interview_confirmed" ? [ACTION_META.reschedule_request] : []}
    />
  );
}

function ThreadPanel({
  target,
  label,
  title = "Messages",
  description,
  actions,
  variant = "outline",
}: {
  target: ThreadTarget;
  label: string;
  title?: string;
  description: string;
  actions: QuickAction[];
  variant?: "outline" | "ghost";
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lastRead, setLastRead] = useState<string | null>(null);

  // Thread bootstrap (created transparently if missing)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setThreadId(null);
    setMessages(null);
    void (async () => {
      const { data, error } = await supabase.rpc("get_or_create_thread", {
        p_client_request_id: target.kind === "request" ? target.id : null,
        p_candidate_match_id: target.kind === "candidate" ? target.id : null,
        p_client_id: target.kind === "general" ? target.id : null,
      });
      if (cancelled) return;
      if (error) {
        setErr(error.message);
        setMessages([]);
        return;
      }
      const row = (Array.isArray(data) ? data[0] : data) as { id: string } | string | null;
      const tid = typeof row === "string" ? row : row?.id;
      if (tid) setThreadId(tid);
    })();
    return () => {
      cancelled = true;
    };
  }, [target.kind, target.id, user]);

  // Last-read from localStorage
  useEffect(() => {
    if (!user || !threadId) return;
    setLastRead(window.localStorage.getItem(lastReadKey(user.id, threadId)));
  }, [user, threadId]);

  // Messages + realtime
  useEffect(() => {
    if (!threadId) return;
    let cancelled = false;
    void supabase
      .from("thread_messages")
      .select("id,thread_id,sender_id,sender_role,body,structured_type,created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setErr(error.message);
        else setErr(null);
        setMessages((data ?? []) as ThreadMessage[]);
      });
    const channel = supabase
      .channel(`thread-messages-${threadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "thread_messages", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const m = payload.new as ThreadMessage;
          setMessages((prev) => (prev ?? []).some((x) => x.id === m.id) ? prev : [...(prev ?? []), m]);
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [threadId]);

  const latest = messages && messages.length > 0 ? messages[messages.length - 1] : null;

  // Mark read while open
  useEffect(() => {
    if (!open || !user || !threadId || !latest) return;
    window.localStorage.setItem(lastReadKey(user.id, threadId), latest.created_at);
    setLastRead(latest.created_at);
  }, [open, user, threadId, latest]);

  const unread = (messages ?? []).filter(
    (m) => m.sender_role === "staff" && (!lastRead || new Date(m.created_at) > new Date(lastRead))
  ).length;

  return (
    <>
      <Button variant={variant} size="sm" className="relative" onClick={() => setOpen(true)}>
        <MessageSquare className="mr-1.5 h-4 w-4" />
        {label}
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="border-b px-5 py-4 text-left">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>

          {err && <p className="px-5 pt-3 text-xs text-destructive">{err}</p>}

          <ChatFeed messages={messages} userId={user?.id ?? null} />
          <Composer
            threadId={threadId}
            actions={actions}
            onSent={(m) => setMessages((prev) => (prev ?? []).some((x) => x.id === m.id) ? prev : [...(prev ?? []), m])}
          />

        </SheetContent>
      </Sheet>
    </>
  );
}

function ChatFeed({ messages, userId }: { messages: ThreadMessage[] | null; userId: string | null }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages?.length]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      {messages === null ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading messages…</p>
      ) : messages.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No messages yet — say hello to your recruiter.</p>
      ) : (
        <ul className="space-y-3">
          {messages.map((m) => {
            const mine = m.sender_role === "client" && (!userId || !m.sender_id || m.sender_id === userId);
            const action = m.structured_type ? ACTION_META[m.structured_type] ?? null : null;
            return (
              <li key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                <span className="mb-1 text-xs text-muted-foreground">
                  {mine ? "You" : m.sender_role === "client" ? "Your team" : "ScaleSource Team"} ·{" "}
                  {formatDateTime(m.created_at)}
                </span>
                {action ? (
                  <div className={`inline-flex max-w-[85%] flex-col gap-1 rounded-xl border px-3 py-2 text-sm ${action.tone}`}>
                    <span className="inline-flex items-center gap-1.5 font-semibold">
                      <action.icon className="h-3.5 w-3.5 flex-none" />
                      {action.label}
                    </span>
                    {m.body && m.body !== action.label && m.body !== action.body && <span className="whitespace-pre-line">{m.body}</span>}
                  </div>
                ) : (
                  <div
                    className={`max-w-[85%] whitespace-pre-line break-words rounded-2xl px-3.5 py-2 text-sm ${
                      mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted text-foreground"
                    }`}
                  >
                    {m.body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div ref={endRef} />
    </div>
  );
}

function Composer({
  threadId,
  actions,
  onSent,
}: {
  threadId: string | null;
  actions: QuickAction[];
  onSent: (m: ThreadMessage) => void;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState<string | null>(null);

  async function send(text: string, structured: StructuredType | null) {
    if (!threadId || sending) return;
    const trimmed = text.trim();
    if (!trimmed && !structured) return;
    setSending(structured ?? "text");
    const { data, error } = await supabase.rpc("send_thread_message", {
      p_thread_id: threadId,
      p_body: trimmed,
      p_structured_type: structured,
    });
    setSending(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!structured) setBody("");
    const row = (Array.isArray(data) ? data[0] : data) as ThreadMessage | null;
    if (row?.id) onSent(row);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(body, null);
    }
  }

  return (
    <div className="space-y-2 border-t px-5 py-3">
      {actions.length > 0 && (
      <div className="flex flex-wrap gap-1.5">
        {actions.map((a) => (
          <button
            key={a.type}
            type="button"
            disabled={!threadId || sending !== null}
            onClick={() => void send(a.body, a.type)}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50 ${a.tone}`}
          >
            {sending === a.type ? <Loader2 className="h-3 w-3 animate-spin" /> : <a.icon className="h-3 w-3" />}
            {a.label}
          </button>
        ))}
      </div>
      )}
      <div className="flex items-end gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Write a message…"
          rows={2}
          className="min-h-[44px] resize-none"
          disabled={!threadId}
        />
        <Button size="icon" aria-label="Send" disabled={!threadId || !body.trim() || sending !== null} onClick={() => void send(body, null)}>
          {sending === "text" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Enter to send · Shift+Enter for a new line</p>
    </div>
  );
}

function HuddleNotes({ threadId, userId }: { threadId: string; userId: string | null }) {
  const [content, setContent] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const [remote, setRemote] = useState<string | null>(null);
  const focusedRef = useRef(false);
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("thread_scratchpad")
      .select("content")
      .eq("thread_id", threadId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setContent((data as { content: string | null } | null)?.content ?? "");
        setLoaded(true);
      });
    const channel = supabase
      .channel(`thread-scratchpad-${threadId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "thread_scratchpad", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const row = payload.new as { content: string | null; updated_by: string | null } | null;
          if (!row || (userId && row.updated_by === userId)) return;
          const next = row.content ?? "";
          if (focusedRef.current || dirtyRef.current) setRemote(next);
          else {
            setContent(next);
            setRemote(null);
          }
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [threadId, userId]);

  const save = useCallback(
    async (text: string) => {
      setSaving("saving");
      const { error } = await supabase.rpc("update_thread_scratchpad", { p_thread_id: threadId, p_content: text });
      if (error) {
        setSaving("idle");
        toast.error(error.message);
        return;
      }
      dirtyRef.current = false;
      setSaving("saved");
    },
    [threadId]
  );

  function onChange(text: string) {
    setContent(text);
    dirtyRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void save(text), 800);
  }

  function loadLatest() {
    if (timerRef.current) clearTimeout(timerRef.current);
    dirtyRef.current = false;
    setContent(remote ?? "");
    setRemote(null);
  }

  return (
    <div className="space-y-2 px-5 py-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Hiring Huddle Notes</h3>
          <p className="text-xs text-muted-foreground">Shared with your ScaleSource recruiter.</p>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : ""}
        </span>
      </div>
      {remote !== null && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary-soft px-3 py-1.5 text-xs text-primary">
          <span>ScaleSource updated the notes</span>
          <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={loadLatest}>
            Load latest
          </Button>
        </div>
      )}
      <Textarea
        value={content}
        disabled={!loaded}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => (focusedRef.current = true)}
        onBlur={() => (focusedRef.current = false)}
        placeholder={loaded ? "Jot down priorities, questions, or candidate thoughts…" : "Loading…"}
        rows={5}
        className="resize-none"
      />
    </div>
  );
}

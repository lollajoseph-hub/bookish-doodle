import { supabase } from "./supabase";
import type { ClientRequestListItem } from "./crm-queries";
import { fetchClientRequests } from "./crm-queries";

export type StructuredType = "reschedule_request" | "call_me_asap" | "send_portfolio";

export interface ThreadRow {
  id: string;
  client_request_id: string;
  candidate_match_id: string | null;
  kind: "request" | "candidate";
  created_at: string;
}

export interface ThreadMessageRow {
  id: string;
  thread_id: string;
  sender_id: string;
  sender_role: "staff" | "client";
  body: string;
  structured_type: StructuredType | null;
  created_at: string;
}

export interface ThreadScratchpadRow {
  thread_id: string;
  content: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface InboxItem {
  request: ClientRequestListItem;
  thread: ThreadRow | null;
  lastMessage: ThreadMessageRow | null;
  sortAt: string;
}

/** Active requests (not closed) merged with their request-level threads + latest message. */
export async function fetchInbox(): Promise<InboxItem[]> {
  const [requests, threadsRes] = await Promise.all([
    fetchClientRequests(),
    supabase.from("threads").select("*").eq("kind", "request"),
  ]);
  if (threadsRes.error) throw threadsRes.error;
  const threads = (threadsRes.data ?? []) as ThreadRow[];
  const threadByRequest = new Map(threads.map((t) => [t.client_request_id, t]));

  const latest = new Map<string, ThreadMessageRow>();
  if (threads.length) {
    const { data, error } = await supabase
      .from("thread_messages")
      .select("*")
      .in(
        "thread_id",
        threads.map((t) => t.id),
      )
      .order("created_at", { ascending: false });
    if (error) throw error;
    for (const m of (data ?? []) as ThreadMessageRow[]) {
      if (!latest.has(m.thread_id)) latest.set(m.thread_id, m);
    }
  }

  return requests
    .filter((r) => r.status !== "closed" || threadByRequest.has(r.id))
    .map((request) => {
      const thread = threadByRequest.get(request.id) ?? null;
      const lastMessage = thread ? (latest.get(thread.id) ?? null) : null;
      return {
        request,
        thread,
        lastMessage,
        sortAt: lastMessage?.created_at ?? thread?.created_at ?? request.created_at,
      };
    })
    .sort((a, b) => {
      // Threads with messages first, then by recency
      if (!!a.lastMessage !== !!b.lastMessage) return a.lastMessage ? -1 : 1;
      return b.sortAt.localeCompare(a.sortAt);
    });
}

export async function getOrCreateThread(clientRequestId: string): Promise<ThreadRow> {
  const { data, error } = await supabase.rpc("get_or_create_thread", {
    p_client_request_id: clientRequestId,
    p_candidate_match_id: null,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as ThreadRow;
}

export async function fetchThreadMessages(threadId: string): Promise<ThreadMessageRow[]> {
  const { data, error } = await supabase
    .from("thread_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ThreadMessageRow[];
}

export async function sendThreadMessage(
  threadId: string,
  body: string,
  structuredType: StructuredType | null = null,
): Promise<ThreadMessageRow> {
  const { data, error } = await supabase.rpc("send_thread_message", {
    p_thread_id: threadId,
    p_body: body,
    p_structured_type: structuredType,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as ThreadMessageRow;
}

export async function fetchScratchpad(threadId: string): Promise<ThreadScratchpadRow | null> {
  const { data, error } = await supabase
    .from("thread_scratchpad")
    .select("*")
    .eq("thread_id", threadId)
    .maybeSingle();
  if (error) throw error;
  return (data as ThreadScratchpadRow | null) ?? null;
}

export async function updateScratchpad(
  threadId: string,
  content: string,
): Promise<ThreadScratchpadRow> {
  const { data, error } = await supabase.rpc("update_thread_scratchpad", {
    p_thread_id: threadId,
    p_content: content,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as ThreadScratchpadRow;
}

const readKey = (userId: string, threadId: string) => `msg-last-read:${userId}:${threadId}`;

export function getLastRead(userId: string, threadId: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(readKey(userId, threadId));
}

export function markRead(userId: string, threadId: string, at: string) {
  if (typeof window === "undefined") return;
  const prev = getLastRead(userId, threadId);
  if (!prev || prev < at) window.localStorage.setItem(readKey(userId, threadId), at);
}

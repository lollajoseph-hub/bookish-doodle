import { supabase } from "./supabase";
import type { ClientRequestListItem } from "./crm-queries";
import { fetchClientRequests } from "./crm-queries";

export type StructuredType = "reschedule_request" | "call_me_asap" | "send_portfolio";

export interface ThreadRow {
  id: string;
  client_request_id: string;
  candidate_match_id: string | null;
  client_id?: string | null;
  kind: "request" | "candidate" | "general";
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

export interface GeneralInboxItem {
  clientId: string;
  clientName: string;
  thread: ThreadRow | null;
  lastMessage: ThreadMessageRow | null;
  sortAt: string;
}

export interface CandidateInboxItem {
  matchId: string;
  candidateName: string;
  clientName: string | null;
  requestTitle: string | null;
  status: string;
  thread: ThreadRow;
  lastMessage: ThreadMessageRow | null;
  sortAt: string;
}

export interface InboxData {
  requests: InboxItem[];
  generals: GeneralInboxItem[];
  candidates: CandidateInboxItem[];
}

export type ThreadTarget =
  | { kind: "request"; clientRequestId: string }
  | { kind: "candidate"; candidateMatchId: string }
  | { kind: "general"; clientId: string };

export function threadTargetKey(t: ThreadTarget): string {
  return t.kind === "request"
    ? t.clientRequestId
    : t.kind === "candidate"
      ? t.candidateMatchId
      : t.clientId;
}

/** Active requests (not closed) merged with their request-level threads + latest message. */
export async function fetchInbox(): Promise<InboxData> {
  const [requests, threadsRes] = await Promise.all([
    fetchClientRequests(),
    supabase.from("threads").select("*").in("kind", ["request", "general", "candidate"]),
  ]);
  if (threadsRes.error) throw threadsRes.error;
  const threads = (threadsRes.data ?? []) as ThreadRow[];
  const threadByRequest = new Map(
    threads.filter((t) => t.kind === "request").map((t) => [t.client_request_id, t]),
  );
  const threadByClient = new Map(
    threads.filter((t) => t.kind === "general" && t.client_id).map((t) => [t.client_id!, t]),
  );

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

  const clientNames = new Map<string, string>();
  for (const r of requests) {
    if (r.client_id && !clientNames.has(r.client_id)) {
      clientNames.set(r.client_id, r.clientName ?? "Client");
    }
  }
  const generals: GeneralInboxItem[] = [...clientNames.entries()]
    .map(([clientId, clientName]) => {
      const thread = threadByClient.get(clientId) ?? null;
      const lastMessage = thread ? (latest.get(thread.id) ?? null) : null;
      return { clientId, clientName, thread, lastMessage, sortAt: lastMessage?.created_at ?? "" };
    })
    .sort((a, b) =>
      a.sortAt !== b.sortAt ? b.sortAt.localeCompare(a.sortAt) : a.clientName.localeCompare(b.clientName),
    );

  const requestItems = requests
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

  // Candidate-level threads (one per candidate_match)
  const candidateThreads = threads.filter((t) => t.kind === "candidate" && t.candidate_match_id);
  const matchIds = [...new Set(candidateThreads.map((t) => t.candidate_match_id!))];
  const matchesById = new Map<
    string,
    { id: string; candidate_id: string; client_request_id: string; status: string }
  >();
  if (matchIds.length) {
    const { data: mData, error: mErr } = await supabase
      .from("candidate_matches")
      .select("id, candidate_id, client_request_id, status")
      .in("id", matchIds);
    if (mErr) throw mErr;
    for (const m of mData ?? []) matchesById.set(m.id, m);
  }
  const candIds = [...new Set([...matchesById.values()].map((m) => m.candidate_id))];
  const reqIds = [...new Set([...matchesById.values()].map((m) => m.client_request_id))];
  const candNames = new Map<string, string>();
  if (candIds.length) {
    const { data: cData, error: cErr } = await supabase
      .from("candidates")
      .select("id, full_name")
      .in("id", candIds);
    if (cErr) throw cErr;
    for (const c of cData ?? []) candNames.set(c.id, c.full_name);
  }
  const reqInfo = new Map<string, { title: string | null; client_id: string }>();
  if (reqIds.length) {
    const { data: rData, error: rErr } = await supabase
      .from("client_requests")
      .select("id, title, client_id")
      .in("id", reqIds);
    if (rErr) throw rErr;
    for (const r of rData ?? []) reqInfo.set(r.id, r);
  }
  const clientIds = [...new Set([...reqInfo.values()].map((r) => r.client_id))];
  const clientNameById = new Map<string, string>();
  if (clientIds.length) {
    const { data: clData, error: clErr } = await supabase
      .from("clients")
      .select("id, name")
      .in("id", clientIds);
    if (clErr) throw clErr;
    for (const c of clData ?? []) clientNameById.set(c.id, c.name);
  }
  const candidates: CandidateInboxItem[] = candidateThreads
    .map((thread) => {
      const match = matchesById.get(thread.candidate_match_id!);
      if (!match) return null;
      const req = reqInfo.get(match.client_request_id);
      const lastMessage = latest.get(thread.id) ?? null;
      return {
        matchId: match.id,
        candidateName: candNames.get(match.candidate_id) ?? "Candidate",
        clientName: req ? (clientNameById.get(req.client_id) ?? null) : null,
        requestTitle: req?.title ?? null,
        status: match.status,
        thread,
        lastMessage,
        sortAt: lastMessage?.created_at ?? thread.created_at,
      };
    })
    .filter((i): i is CandidateInboxItem => i !== null)
    .sort((a, b) => {
      if (!!a.lastMessage !== !!b.lastMessage) return a.lastMessage ? -1 : 1;
      return b.sortAt.localeCompare(a.sortAt);
    });

  return { requests: requestItems, generals, candidates };
}

export async function getOrCreateThread(target: ThreadTarget): Promise<ThreadRow> {
  const args =
    target.kind === "candidate"
      ? { p_candidate_match_id: target.candidateMatchId }
      : target.kind === "request"
        ? { p_client_request_id: target.clientRequestId }
        : { p_client_id: target.clientId };
  const { data, error } = await supabase.rpc("get_or_create_thread", args as never);
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as ThreadRow;
}

/** Read-only lookup — never creates a thread. */
export async function findThreadId(target: ThreadTarget): Promise<string | null> {
  const [col, val] =
    target.kind === "candidate"
      ? ["candidate_match_id", target.candidateMatchId]
      : target.kind === "request"
        ? ["client_request_id", target.clientRequestId]
        : ["client_id", target.clientId];
  const { data, error } = await supabase
    .from("threads")
    .select("id")
    .eq("kind", target.kind)
    .eq(col, val)
    .maybeSingle();
  if (error) throw error;
  return (data as { id: string } | null)?.id ?? null;
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

export interface CandidateThreadContext {
  matchId: string;
  status: string;
  candidateId: string;
  candidateName: string;
  clientRequestId: string;
  requestTitle: string | null;
  clientId: string | null;
  clientName: string | null;
  headline: string | null;
  yearsExperience: number | null;
  availability: string | null;
  roleName: string | null;
  primaryContact: PrimaryContact | null;
}

export interface PrimaryContact {
  name: string | null;
  title: string | null;
  email: string | null;
}

export async function fetchPrimaryContact(clientId: string): Promise<PrimaryContact | null> {
  const { data: member } = await supabase
    .from("client_members")
    .select("profile_id, client_position")
    .eq("client_id", clientId)
    .eq("is_primary", true)
    .limit(1)
    .maybeSingle();
  if (!member) return null;
  const { data: prof } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", member.profile_id)
    .maybeSingle();
  return {
    name: prof?.full_name ?? null,
    title: member.client_position ?? null,
    email: prof?.email ?? null,
  };
}

export async function fetchCandidateThreadContext(matchId: string): Promise<CandidateThreadContext> {
  const { data: m, error } = await supabase
    .from("candidate_matches")
    .select("id, status, candidate_id, client_request_id")
    .eq("id", matchId)
    .single();
  if (error) throw error;
  const [candRes, reqRes] = await Promise.all([
    supabase.from("candidates").select("full_name, headline, years_experience, availability").eq("id", m.candidate_id).maybeSingle(),
    supabase
      .from("client_requests")
      .select("title, client_id, role_id")
      .eq("id", m.client_request_id)
      .maybeSingle(),
  ]);
  let clientName: string | null = null;
  if (reqRes.data?.client_id) {
    const { data: c } = await supabase
      .from("clients")
      .select("name")
      .eq("id", reqRes.data.client_id)
      .maybeSingle();
    clientName = c?.name ?? null;
  }
  const cand = candRes.data as
    | { full_name: string | null; headline: string | null; years_experience: number | null; availability: string | null }
    | null;
  const req = reqRes.data as { title: string | null; client_id: string | null; role_id: string | null } | null;
  const [roleRes, primaryContact] = await Promise.all([
    req?.role_id
      ? supabase.from("job_roles").select("name").eq("id", req.role_id).maybeSingle()
      : Promise.resolve({ data: null }),
    req?.client_id ? fetchPrimaryContact(req.client_id) : Promise.resolve(null),
  ]);
  return {
    headline: cand?.headline ?? null,
    yearsExperience: cand?.years_experience ?? null,
    availability: cand?.availability ?? null,
    roleName: (roleRes.data as { name: string } | null)?.name ?? null,
    primaryContact,
    matchId: m.id,
    status: m.status as string,
    candidateId: m.candidate_id,
    candidateName: candRes.data?.full_name ?? "Candidate",
    clientRequestId: m.client_request_id,
    requestTitle: reqRes.data?.title ?? null,
    clientId: reqRes.data?.client_id ?? null,
    clientName,
  };
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { MATCH_SELECT, type MatchRow } from "@/components/candidate-card";
import { type ThreadTarget } from "@/components/request-messages";
import { getLastRead, useThreadReads } from "@/lib/thread-reads";
import { useAuth } from "@/lib/auth";
import { displayName } from "@/lib/matches";
import { useMembership } from "@/lib/membership";
import { supabase } from "@/lib/supabase";
import { usePollingRefresh } from "@/hooks/use-polling-refresh";

interface RequestItem {
  id: string;
  status: string | null;
  job_roles: { name: string | null } | null;
}

export interface LastMessage {
  body: string;
  created_at: string;
  sender_role: "staff" | "client";
}

export interface MessageInboxRow {
  key: string;
  target: ThreadTarget;
  title: string;
  subtitle: string;
  matchStatus?: string | null;
  threadId: string | null;
  lastMessage: LastMessage | null;
  unread: boolean;
}

export function statusText(status: string | null | undefined) {
  if (!status) return "";
  return status.replace(/_/g, " ").replace(/^\w/, (character) => character.toUpperCase());
}

export function formatRelative(iso: string) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Rows with a message first, most recent first; the rest keep their order. */
function byRecent(a: MessageInboxRow, b: MessageInboxRow) {
  const first = a.lastMessage?.created_at ?? null;
  const second = b.lastMessage?.created_at ?? null;
  if (first && second) return second.localeCompare(first);
  if (first) return -1;
  if (second) return 1;
  return 0;
}

export function useMessagesInbox() {
  const { membership } = useMembership();
  const { user } = useAuth();
  const readsVersion = useThreadReads(user?.id);
  const [requests, setRequests] = useState<RequestItem[] | null>(null);
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [threadByTarget, setThreadByTarget] = useState<Record<string, string>>({});
  const [lastByThread, setLastByThread] = useState<Record<string, LastMessage>>({});
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [requestResult, matchResult, threadResult] = await Promise.all([
      supabase.from("client_requests").select("id,status,job_roles(name)").order("created_at", { ascending: false }),
      supabase.from("candidate_matches").select(MATCH_SELECT).neq("status", "rejected"),
      supabase.from("threads").select("id,client_request_id,candidate_match_id,client_id,kind"),
    ]);
    const loadError = requestResult.error ?? matchResult.error ?? threadResult.error;
    setErr(loadError?.message ?? null);
    setRequests((requestResult.data ?? []) as unknown as RequestItem[]);
    setMatches((matchResult.data ?? []) as unknown as MatchRow[]);

    const targetMap: Record<string, string> = {};
    const threadIds: string[] = [];
    for (const thread of threadResult.data ?? []) {
      const targetId = thread.kind === "request" ? thread.client_request_id : thread.kind === "candidate" ? thread.candidate_match_id : thread.client_id;
      if (!targetId) continue;
      targetMap[`${thread.kind}:${targetId}`] = thread.id;
      threadIds.push(thread.id);
    }
    setThreadByTarget(targetMap);

    if (threadIds.length === 0) {
      setLastByThread({});
      return;
    }
    const messageResult = await supabase
      .from("thread_messages")
      .select("thread_id,sender_id,sender_role,body,created_at")
      .in("thread_id", threadIds)
      .order("created_at", { ascending: false });
    if (messageResult.error) setErr(messageResult.error.message);
    const latest: Record<string, LastMessage> = {};
    for (const message of messageResult.data ?? []) {
      if (!latest[message.thread_id]) {
        latest[message.thread_id] = {
          body: message.body,
          created_at: message.created_at,
          sender_role: message.sender_role as LastMessage["sender_role"],
        };
      }
    }
    setLastByThread(latest);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  usePollingRefresh(load, 20000);

  const roleById = useMemo(() => {
    const roles: Record<string, string> = {};
    for (const request of requests ?? []) roles[request.id] = request.job_roles?.name ?? "Hiring request";
    return roles;
  }, [requests]);

  const enrich = useCallback(
    (base: Omit<MessageInboxRow, "threadId" | "lastMessage" | "unread">): MessageInboxRow => {
      const threadId = threadByTarget[base.key] ?? null;
      const lastMessage = threadId ? (lastByThread[threadId] ?? null) : null;
      const lastRead = threadId && user ? getLastRead(user.id, threadId) : null;
      return {
        ...base,
        threadId,
        lastMessage,
        unread: !!lastMessage && lastMessage.sender_role === "staff" && (!lastRead || new Date(lastMessage.created_at) > new Date(lastRead)),
      };
    },
    // readsVersion: recompute when read markers load or change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lastByThread, threadByTarget, user, readsVersion],
  );

  const general = membership?.client_id
    ? enrich({ key: `general:${membership.client_id}`, target: { kind: "general", id: membership.client_id }, title: "ScaleSource team", subtitle: "General conversation" })
    : null;
  const requestRows = (requests ?? [])
    .map((request) => enrich({ key: `request:${request.id}`, target: { kind: "request", id: request.id }, title: request.job_roles?.name ?? "Hiring request", subtitle: statusText(request.status) }))
    .sort(byRecent);
  const candidateRows = (matches ?? [])
    .map((match) =>
      enrich({
        key: `candidate:${match.id}`,
        target: { kind: "candidate", id: match.id },
        title: `Inquiry about ${displayName(match.candidate_pool_profile?.full_name, match.status)}`,
        subtitle: roleById[match.client_request_id] ?? "Hiring request",
        matchStatus: match.status,
      }),
    )
    .sort(byRecent);
  const listedRequests = requestRows.filter((row) => row.threadId && row.lastMessage);
  const listedCandidates = candidateRows.filter((row) => row.threadId && row.lastMessage);
  const totalUnread = [general, ...requestRows, ...candidateRows].filter((row) => row?.unread).length;

  return {
    general,
    requestRows,
    candidateRows,
    listedRequests,
    listedCandidates,
    err,
    loading: requests === null || matches === null,
    totalUnread,
  };
}
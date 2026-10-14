import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Per-user "last read" markers for message threads, stored in the
 * thread_reads table so they follow the user across browsers and devices.
 * localStorage is kept as a fast local copy; on first load any marks this
 * browser already had are copied up so existing threads don't turn unread.
 */

const localKey = (userId: string, threadId: string) => `msg-last-read:${userId}:${threadId}`;

let reads: Record<string, string> = {};
let loadedFor: string | null = null;
let version = 0;
const listeners = new Set<() => void>();

function notify() {
  version += 1;
  listeners.forEach((listener) => listener());
}

function newer(a: string | null | undefined, b: string | null | undefined) {
  if (!a) return b ?? null;
  if (!b) return a;
  return new Date(a) >= new Date(b) ? a : b;
}

function readLocal(userId: string, threadId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(localKey(userId, threadId));
  } catch {
    return null;
  }
}

function writeLocal(userId: string, threadId: string, at: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(localKey(userId, threadId), at);
  } catch {
    // ignore storage errors (private mode, quota)
  }
}

async function load(userId: string) {
  const { data, error } = await supabase.from("thread_reads").select("thread_id,last_read_at");
  if (error || loadedFor !== userId) return;
  const next: Record<string, string> = {};
  for (const row of data ?? []) next[row.thread_id] = row.last_read_at;

  // Copy up marks this browser has that the database doesn't (or has older).
  if (typeof window !== "undefined") {
    const prefix = `msg-last-read:${userId}:`;
    const pending: Array<{ threadId: string; at: string }> = [];
    try {
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (!key?.startsWith(prefix)) continue;
        const threadId = key.slice(prefix.length);
        const at = window.localStorage.getItem(key);
        if (at && newer(at, next[threadId]) === at && at !== next[threadId]) pending.push({ threadId, at });
      }
    } catch {
      // ignore storage errors
    }
    for (const { threadId, at } of pending) {
      next[threadId] = at;
      void supabase.rpc("mark_thread_read", { p_thread_id: threadId, p_read_at: at });
    }
  }

  for (const [threadId, at] of Object.entries(reads)) next[threadId] = newer(next[threadId], at) as string;
  reads = next;
  notify();
}

/** Loads the signed-in user's read markers once and re-renders when they change. */
export function useThreadReads(userId: string | null | undefined) {
  useEffect(() => {
    if (!userId || loadedFor === userId) return;
    loadedFor = userId;
    reads = {};
    void load(userId);
  }, [userId]);
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
    () => 0,
  );
}

/** Last-read timestamp for a thread, or null if never read. */
export function getLastRead(userId: string, threadId: string): string | null {
  return newer(reads[threadId], readLocal(userId, threadId));
}

/** Moves the thread's read marker forward to `at` (never backwards). */
export function markThreadRead(userId: string, threadId: string, at: string) {
  const prev = getLastRead(userId, threadId);
  if (prev && new Date(prev) >= new Date(at)) return;
  reads = { ...reads, [threadId]: at };
  writeLocal(userId, threadId, at);
  notify();
  void supabase.rpc("mark_thread_read", { p_thread_id: threadId, p_read_at: at });
}

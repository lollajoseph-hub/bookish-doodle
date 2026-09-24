import { useEffect } from "react";

/**
 * Periodically re-runs `refetch` and also re-runs it whenever the tab/window
 * regains focus or becomes visible again. Mirrors React Query's default
 * refetchOnWindowFocus + polling behavior for pages that use a plain
 * useState + load() pattern instead of React Query.
 */
export function usePollingRefresh(refetch: () => void, intervalMs = 20000) {
  useEffect(() => {
    const id = setInterval(() => {
      refetch();
    }, intervalMs);
    return () => clearInterval(id);
  }, [refetch, intervalMs]);

  useEffect(() => {
    const onFocus = () => refetch();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refetch();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refetch]);
}

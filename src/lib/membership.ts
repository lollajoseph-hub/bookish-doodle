import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";

export interface Membership {
  client_id: string;
  client_name: string;
  is_primary: boolean;
}

/** Resolves the signed-in person's company from their own `client_members` row. */
export function useMembership() {
  const { user } = useAuth();
  const [membership, setMembership] = useState<Membership | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // True only when the lookup succeeded and this account has no client company (e.g. a staff account).
  const [notMember, setNotMember] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error: e } = await supabase
        .from("client_members")
        .select("client_id,is_primary,clients(name)")
        .eq("profile_id", user.id)
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (e) setError(e.message);
      else if (!data) {
        setError("We couldn't find a company linked to your account.");
        setNotMember(true);
      }
      else {
        const row = data as unknown as {
          client_id: string;
          is_primary: boolean | null;
          clients: { name: string } | { name: string }[] | null;
        };
        const client = Array.isArray(row.clients) ? row.clients[0] : row.clients;
        setMembership({
          client_id: row.client_id,
          client_name: client?.name ?? "Your company",
          is_primary: !!row.is_primary,
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return { membership, loading, error, notMember };
}

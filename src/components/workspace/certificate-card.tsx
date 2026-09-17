import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Award, Download, Ban, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";

interface Certificate {
  id: string;
  status: "pending" | "issued" | "revoked";
  certificate_number: string | null;
  verification_id: string | null;
  storage_path: string | null;
  issued_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
}

async function fetchLatestCertificate(candidateId: string): Promise<Certificate | null> {
  const { data, error } = await supabase
    .from("certificates")
    .select("*")
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Certificate | null) ?? null;
}

export function CertificateCard({ candidateId }: { candidateId: string }) {
  const qc = useQueryClient();
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [revoking, setRevoking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const certQ = useQuery({
    queryKey: ["certificate", candidateId],
    queryFn: () => fetchLatestCertificate(candidateId),
  });

  if (certQ.isLoading) {
    return <Skeleton className="h-32 rounded-2xl" />;
  }

  const cert = certQ.data;
  if (!cert) {
    return (
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <Award className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">Certificate</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          No certificate has been generated for this candidate yet.
        </p>
      </div>
    );
  }

  const statusBadge = (() => {
    if (cert.status === "issued")
      return <Badge className="border-0 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">Issued</Badge>;
    if (cert.status === "revoked")
      return <Badge variant="destructive">Revoked</Badge>;
    return <Badge variant="secondary">Pending</Badge>;
  })();

  const handleDownload = async () => {
    if (!cert.storage_path) return;
    setDownloading(true);
    try {
      const { data, error } = await supabase.storage
        .from("certificates")
        .createSignedUrl(cert.storage_path, 3600);
      if (error || !data?.signedUrl) throw new Error(error?.message || "no url");
      const res = await fetch(data.signedUrl);
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `VetPod-Certificate-${cert.certificate_number ?? cert.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e: any) {
      toast.error(e?.message || "Failed to download");
    } finally {
      setDownloading(false);
    }
  };

  const handleRevoke = async () => {
    setRevoking(true);
    try {
      const { error } = await supabase.rpc("revoke_certificate", {
        p_certificate: cert.id,
        p_reason: reason.trim() || null,
      });
      if (error) throw error;
      toast.success("Certificate revoked");
      setRevokeOpen(false);
      setReason("");
      await qc.invalidateQueries({ queryKey: ["certificate", candidateId] });
    } catch (e: any) {
      toast.error(e?.message || "Failed to revoke");
    } finally {
      setRevoking(false);
    }
  };

  const handleRegenerate = async () => {
    if (!cert) return;
    setRegenerating(true);
    const isReissue = cert.status === "revoked";
    toast(isReissue ? "Reissuing certificate…" : "Regenerating certificate…");
    try {
      const { error } = await supabase.rpc("regenerate_certificate", {
        p_certificate: cert.id,
      });
      if (error) throw error;
      toast.success(isReissue ? "Certificate reissued" : "Certificate regenerated");
      await qc.invalidateQueries({ queryKey: ["certificate", candidateId] });
      setTimeout(() => {
        qc.refetchQueries({ queryKey: ["certificate", candidateId] });
      }, 4000);
    } catch (e: any) {
      toast.error(e?.message || "Failed to regenerate certificate");
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Certificate</h3>
        </div>
        {statusBadge}
      </div>

      <dl className="space-y-2 text-sm">
        <div className="flex items-start justify-between gap-3">
          <dt className="text-xs uppercase tracking-wider text-muted-foreground shrink-0">Number</dt>
          <dd className="text-right font-mono text-xs break-all">{cert.certificate_number ?? "—"}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-xs uppercase tracking-wider text-muted-foreground shrink-0">Verification ID</dt>
          <dd className="text-right font-mono text-xs break-all">{cert.verification_id ?? "—"}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-xs uppercase tracking-wider text-muted-foreground shrink-0">Issued</dt>
          <dd className="text-right">
            {cert.issued_at ? format(new Date(cert.issued_at), "MMM d, yyyy") : "—"}
          </dd>
        </div>
        {cert.status === "revoked" && (
          <>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-xs uppercase tracking-wider text-muted-foreground shrink-0">Revoked</dt>
              <dd className="text-right">
                {cert.revoked_at ? format(new Date(cert.revoked_at), "MMM d, yyyy") : "—"}
              </dd>
            </div>
            {cert.revoke_reason && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs">
                <span className="font-semibold">Reason: </span>
                {cert.revoke_reason}
              </div>
            )}
          </>
        )}
      </dl>

      {cert.status === "issued" && (
        <div className="mt-4 flex flex-wrap gap-2">
          {cert.storage_path && (
            <Button size="sm" variant="outline" onClick={handleDownload} disabled={downloading}>
              {downloading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Download certificate
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleRegenerate}
            disabled={regenerating}
          >
            {regenerating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Regenerate
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => setRevokeOpen(true)}
          >
            <Ban className="h-4 w-4 mr-2" />
            Revoke
          </Button>
        </div>
      )}

      {cert.status === "revoked" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={handleRegenerate} disabled={regenerating}>
            {regenerating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Reissue
          </Button>
        </div>
      )}

      <Dialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke certificate</DialogTitle>
            <DialogDescription>
              This will mark the certificate as revoked. The candidate and any verifier will see
              this state. This action cannot be undone in this view.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="revoke-reason">Reason (optional)</Label>
            <Textarea
              id="revoke-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Issued in error, candidate misconduct…"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRevokeOpen(false)} disabled={revoking}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRevoke} disabled={revoking}>
              {revoking && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Revoke certificate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

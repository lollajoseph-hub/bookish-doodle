import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  Printer,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/reports")({
  ssr: false,
  component: ReportsPage,
});

const CANDIDATE_ORDER = [
  "uploaded",
  "invited",
  "training_in_progress",
  "training_completed",
  "qualified",
  "placed",
  "training_failed",
  "training_expired",
  "inactive",
];
const TRAINING_ORDER = [
  "enrolled",
  "in_progress",
  "completed",
  "certificates_issued",
  "expired",
  "training_failed",
  "dropped",
];
const PLACEMENT_ORDER = [
  "requests",
  "presented",
  "interviewing",
  "offered",
  "placed",
  "filled_requests",
];

function labelize(k: string) {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function toStages(obj: Record<string, any> | null | undefined, order: string[]) {
  if (!obj) return [];
  return order
    .filter((k) => k in obj)
    .map((k) => ({ stage: labelize(k), value: Number(obj[k] ?? 0) }));
}

type RecruiterRow = {
  recruiter_name: string;
  agency: string | null;
  sourced: number;
  qualified: number;
  interviews: number;
  offers: number;
  placements: number;
  placement_rate: number | null;
};
type ClinicRow = {
  clinic_name: string;
  status: string;
  members: number;
  requests: number;
  open_requests: number;
  filled: number;
  placements: number;
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function toCSV(rows: Record<string, any>[]) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const escape = (v: any) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => escape(r[c])).join(","))].join(
    "\n",
  );
}

function FunnelCard({
  title,
  data,
  loading,
}: {
  title: string;
  data: { stage: string; value: number }[];
  loading: boolean;
}) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      {loading ? (
        <Skeleton className="h-56 w-full" />
      ) : data.length === 0 ? (
        <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">
          No data
        </div>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 20, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="stage"
                tick={{ fontSize: 11 }}
                width={140}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function ReportsPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  if (!isAdmin) {
    return (
      <AppShell title="Reports">
        <div className="min-h-[60vh] flex items-center justify-center px-4">
          <div className="max-w-md text-center rounded-2xl border bg-card p-8 shadow-sm">
            <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
            <h1 className="mt-4 text-xl font-semibold">Access restricted</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Reports are available to admins only.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  const printRef = useRef<HTMLDivElement>(null);
  const [dataset, setDataset] = useState<"recruiters" | "clinics" | "funnels">(
    "recruiters",
  );

  const candidateFunnel = useQuery({
    queryKey: ["reports", "candidate-funnel"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_candidate_funnel");
      if (error) throw error;
      return data as Record<string, number>;
    },
  });
  const trainingFunnel = useQuery({
    queryKey: ["reports", "training-funnel"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_training_funnel");
      if (error) throw error;
      return data as Record<string, number>;
    },
  });
  const placementFunnel = useQuery({
    queryKey: ["reports", "placement-funnel"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_placement_funnel");
      if (error) throw error;
      return data as Record<string, number>;
    },
  });
  const recruiters = useQuery({
    queryKey: ["reports", "recruiter-performance"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_recruiter_performance");
      if (error) throw error;
      return (data ?? []) as RecruiterRow[];
    },
  });
  const clinics = useQuery({
    queryKey: ["reports", "clinic-activity"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_clinic_activity");
      if (error) throw error;
      return (data ?? []) as ClinicRow[];
    },
  });

  const candidateStages = useMemo(
    () => toStages(candidateFunnel.data, CANDIDATE_ORDER),
    [candidateFunnel.data],
  );
  const trainingStages = useMemo(
    () => toStages(trainingFunnel.data, TRAINING_ORDER),
    [trainingFunnel.data],
  );
  const placementStages = useMemo(
    () => toStages(placementFunnel.data, PLACEMENT_ORDER),
    [placementFunnel.data],
  );

  const getExportRows = (): { rows: Record<string, any>[]; name: string } => {
    if (dataset === "recruiters")
      return { rows: (recruiters.data ?? []) as any, name: "recruiter-performance" };
    if (dataset === "clinics")
      return { rows: (clinics.data ?? []) as any, name: "clinic-activity" };
    const funnelRows = [
      ...candidateStages.map((s) => ({ funnel: "Candidate", ...s })),
      ...trainingStages.map((s) => ({ funnel: "Training", ...s })),
      ...placementStages.map((s) => ({ funnel: "Placement", ...s })),
    ];
    return { rows: funnelRows, name: "funnels" };
  };

  const handleCsv = () => {
    const { rows, name } = getExportRows();
    if (!rows.length) return toast.error("No data to export");
    downloadBlob(new Blob([toCSV(rows)], { type: "text/csv;charset=utf-8" }), `${name}.csv`);
    toast.success("CSV downloaded");
  };

  const handleExcel = () => {
    const { rows, name } = getExportRows();
    if (!rows.length) return toast.error("No data to export");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    XLSX.writeFile(wb, `${name}.xlsx`);
    toast.success("Excel downloaded");
  };

  const handlePrint = () => window.print();

  const refreshAll = async () => {
    await Promise.all([
      candidateFunnel.refetch(),
      trainingFunnel.refetch(),
      placementFunnel.refetch(),
      recruiters.refetch(),
      clinics.refetch(),
    ]);
    toast.success("Reports refreshed");
  };

  const anyLoading =
    candidateFunnel.isFetching ||
    trainingFunnel.isFetching ||
    placementFunnel.isFetching ||
    recruiters.isFetching ||
    clinics.isFetching;

  return (
    <AppShell title="Reports">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #reports-print, #reports-print * { visibility: visible !important; }
          #reports-print { position: absolute; left: 0; top: 0; width: 100%; padding: 24px; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between no-print">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" /> Operational reports
            </h2>
            <p className="text-sm text-muted-foreground">
              Funnels, recruiter performance, and clinic activity — export or print.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={dataset} onValueChange={(v) => setDataset(v as any)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Export dataset" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recruiters">Recruiter Performance</SelectItem>
                <SelectItem value="clinics">Clinic Activity</SelectItem>
                <SelectItem value="funnels">Funnels</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleCsv}>
              <Download className="h-4 w-4 mr-2" /> CSV
            </Button>
            <Button variant="outline" onClick={handleExcel}>
              <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel
            </Button>
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" /> Print / PDF
            </Button>
            <Button variant="outline" onClick={refreshAll} disabled={anyLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${anyLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        <div id="reports-print" ref={printRef} className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-3">
            <FunnelCard
              title="Candidate Funnel"
              data={candidateStages}
              loading={candidateFunnel.isLoading}
            />
            <FunnelCard
              title="Training Funnel"
              data={trainingStages}
              loading={trainingFunnel.isLoading}
            />
            <FunnelCard
              title="Placement Funnel"
              data={placementStages}
              loading={placementFunnel.isLoading}
            />
          </div>

          <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
            <div className="p-4 border-b">
              <h3 className="text-sm font-semibold">Recruiter Performance</h3>
            </div>
            {recruiters.isLoading ? (
              <div className="p-6 space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (recruiters.data ?? []).length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No recruiters.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recruiter</TableHead>
                      <TableHead>Agency</TableHead>
                      <TableHead className="text-right">Sourced</TableHead>
                      <TableHead className="text-right">Qualified</TableHead>
                      <TableHead className="text-right">Interviews</TableHead>
                      <TableHead className="text-right">Offers</TableHead>
                      <TableHead className="text-right">Placements</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(recruiters.data ?? []).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{r.recruiter_name}</TableCell>
                        <TableCell className="text-muted-foreground">{r.agency ?? "—"}</TableCell>
                        <TableCell className="text-right">{r.sourced ?? 0}</TableCell>
                        <TableCell className="text-right">{r.qualified ?? 0}</TableCell>
                        <TableCell className="text-right">{r.interviews ?? 0}</TableCell>
                        <TableCell className="text-right">{r.offers ?? 0}</TableCell>
                        <TableCell className="text-right">{r.placements ?? 0}</TableCell>
                        <TableCell className="text-right">{r.placement_rate ?? 0}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
            <div className="p-4 border-b">
              <h3 className="text-sm font-semibold">Clinic Activity</h3>
            </div>
            {clinics.isLoading ? (
              <div className="p-6 space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (clinics.data ?? []).length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No clinics.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Clinic</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Members</TableHead>
                      <TableHead className="text-right">Requests</TableHead>
                      <TableHead className="text-right">Open</TableHead>
                      <TableHead className="text-right">Filled</TableHead>
                      <TableHead className="text-right">Placements</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(clinics.data ?? []).map((c, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{c.clinic_name}</TableCell>
                        <TableCell>
                          <Badge
                            className={
                              c.status === "active"
                                ? "bg-[color:var(--color-success)]/15 text-[color:var(--color-success-foreground)] border-0"
                                : "bg-muted text-muted-foreground border-0"
                            }
                          >
                            {c.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{c.members ?? 0}</TableCell>
                        <TableCell className="text-right">{c.requests ?? 0}</TableCell>
                        <TableCell className="text-right">{c.open_requests ?? 0}</TableCell>
                        <TableCell className="text-right">{c.filled ?? 0}</TableCell>
                        <TableCell className="text-right">{c.placements ?? 0}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

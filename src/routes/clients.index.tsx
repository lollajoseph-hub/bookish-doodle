import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Building2, Plus, Loader2, Search, Users, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { createClient, fetchClients } from "@/lib/crm-queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/clients/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Clients | ScaleSource Candidate Review Dashboard" },
      { name: "description", content: "Companies ScaleSource places candidates with, their contacts and open requests." },
      { property: "og:title", content: "Clients | ScaleSource" },
      { property: "og:description", content: "Manage ScaleSource client companies and their hiring requests." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientsPage,
});

function ClientsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [parentId, setParentId] = useState("none");
  const [isFranchise, setIsFranchise] = useState(false);

  const { data: clients = [], isLoading } = useQuery({ queryKey: ["clients"], queryFn: fetchClients });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || (c.industry ?? "").toLowerCase().includes(q),
    );
  }, [clients, search]);

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Company name is required");
      return createClient({
        name,
        industry,
        parent_client_id: parentId === "none" ? null : parentId,
        is_franchise_brand: isFranchise,
      });
    },
    onSuccess: () => {
      toast.success("Client added");
      setName("");
      setIndustry("");
      setParentId("none");
      setIsFranchise(false);
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell
      title="Clients"
      description="Companies hiring through ScaleSource"
      actions={
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Add client
        </Button>
      }
    >
      <div className="relative mb-5 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients…"
          className="pl-9"
        />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading clients…</p>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((c) => (
          <Link
            key={c.id}
            to="/clients/$clientId"
            params={{ clientId: c.id }}
            className="rounded-2xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-amber hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="font-semibold">{c.name}</div>
                  {c.industry && (
                    <div className="text-xs text-muted-foreground">{c.industry}</div>
                  )}
                </div>
              </div>
              {c.is_franchise_brand && <Badge variant="secondary">Franchise brand</Badge>}
            </div>
            {c.parentName && (
              <p className="mt-3 text-xs text-muted-foreground">Part of {c.parentName}</p>
            )}
            <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> {c.memberCount} contacts
              </span>
              <span className="inline-flex items-center gap-1">
                <ClipboardList className="h-3.5 w-3.5" /> {c.openRequests} open requests
              </span>
            </div>
          </Link>
        ))}
      </div>
      {!isLoading && !filtered.length && (
        <p className="text-sm text-muted-foreground">No clients yet.</p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add client</DialogTitle>
            <DialogDescription>Create a company record staff can raise requests against.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="client-name">Company name *</Label>
              <Input id="client-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-industry">Industry</Label>
              <Input id="client-industry" value={industry} onChange={(e) => setIndustry(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Parent company</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <Label htmlFor="franchise">Franchise brand</Label>
                <p className="text-xs text-muted-foreground">Groups multiple locations under one brand.</p>
              </div>
              <Switch id="franchise" checked={isFranchise} onCheckedChange={setIsFranchise} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Add client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

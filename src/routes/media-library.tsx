import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Upload, Trash2, Pencil, RefreshCw } from "lucide-react";
import { MediaThumb, type MediaRow } from "@/components/courses/media-picker";
import { format } from "date-fns";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/media-library")({
  component: MediaLibraryPage,
});

type Kind = "image" | "video" | "pdf" | "file";

function detectKind(file: File): Kind {
  const m = file.type;
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m === "application/pdf") return "pdf";
  return "file";
}

function MediaLibraryPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  return (
    <AppShell title="Media Library">
      <div className="space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">
            Reusable images, videos, PDFs, and downloads for lesson content.
          </p>
        </div>
        <Tabs defaultValue="assets">
          <TabsList>
            <TabsTrigger value="assets">Assets</TabsTrigger>
            <TabsTrigger value="templates">Lesson Templates</TabsTrigger>
          </TabsList>
          <TabsContent value="assets" className="mt-4">
            <AssetsTab isAdmin={isAdmin} />
          </TabsContent>
          <TabsContent value="templates" className="mt-4">
            <TemplatesTab isAdmin={isAdmin} />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function AssetsTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<Kind | "all">("all");
  const [editing, setEditing] = useState<MediaRow | null>(null);
  const [confirmDel, setConfirmDel] = useState<MediaRow | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const query = useQuery({
    queryKey: ["media-library", { search, kind }],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_media_list", {
        p_search: search || null,
        p_kind: kind === "all" ? null : kind,
      });
      if (error) throw error;
      return (data ?? []) as MediaRow[];
    },
  });

  const onUpload = async (file: File) => {
    setUploading(true);
    try {
      const path = `library/${crypto.randomUUID()}-${file.name}`;
      const up = await supabase.storage.from("lesson-assets").upload(path, file, { upsert: false });
      if (up.error) throw up.error;
      const detected = detectKind(file);
      const { error } = await supabase.rpc("admin_media_register", {
        p_path: path,
        p_file_name: file.name,
        p_kind: detected,
        p_title: file.name,
        p_alt: null,
        p_mime_type: file.type || null,
        p_byte_size: file.size,
        p_bucket: "lesson-assets",
      });
      if (error) throw error;
      toast.success("Uploaded");
      qc.invalidateQueries({ queryKey: ["media-library"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const doDelete = async () => {
    if (!confirmDel) return;
    const { error } = await supabase.rpc("admin_media_delete", { p_id: confirmDel.id });
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    setConfirmDel(null);
    qc.invalidateQueries({ queryKey: ["media-library"] });
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl p-4 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search title, filename, alt…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={kind} onValueChange={(v) => setKind(v as Kind | "all")}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All kinds</SelectItem>
            <SelectItem value="image">Image</SelectItem>
            <SelectItem value="video">Video</SelectItem>
            <SelectItem value="pdf">PDF</SelectItem>
            <SelectItem value="file">File</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => query.refetch()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
        </Button>
        <div className="ml-auto" />
        {isAdmin && (
          <>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUpload(f);
              }}
            />
            <Button size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
              <Upload className="h-3.5 w-3.5 mr-1" />
              {uploading ? "Uploading…" : "Upload"}
            </Button>
          </>
        )}
      </Card>

      {query.isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square" />
          ))}
        </div>
      )}
      {query.error && <div className="text-sm text-destructive">{(query.error as Error).message}</div>}
      {query.data && query.data.length === 0 && (
        <Card className="rounded-2xl p-8 text-center text-sm text-muted-foreground">
          No assets found.
        </Card>
      )}
      {query.data && query.data.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {query.data.map((row) => (
            <Card key={row.id} className="rounded-2xl overflow-hidden flex flex-col">
              <div className="aspect-square bg-muted">
                <MediaThumb row={row} />
              </div>
              <div className="p-2 space-y-1 flex-1">
                <div className="text-xs font-medium truncate" title={row.title ?? row.file_name ?? ""}>
                  {row.title || row.file_name || "Untitled"}
                </div>
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px]">{row.kind}</Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(row.created_at), "MMM d")}
                  </span>
                </div>
                {isAdmin && (
                  <div className="flex justify-end gap-1 pt-1">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(row)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive"
                      onClick={() => setConfirmDel(row)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <EditMediaDialog row={editing} onClose={() => setEditing(null)} />
      )}
      <Dialog open={!!confirmDel} onOpenChange={(v) => !v && setConfirmDel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete asset?</DialogTitle>
            <DialogDescription>
              This removes the record from the library. Existing lesson references may break.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDel(null)}>Cancel</Button>
            <Button variant="destructive" onClick={doDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function EditMediaDialog({ row, onClose }: { row: MediaRow; onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(row.title ?? "");
  const [alt, setAlt] = useState(row.alt ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("admin_media_update", {
      p_id: row.id,
      p_title: title || null,
      p_alt: alt || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    qc.invalidateQueries({ queryKey: ["media-library"] });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit asset</DialogTitle>
          <DialogDescription>{row.file_name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Alt text</Label>
            <Textarea rows={2} value={alt} onChange={(e) => setAlt(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplatesTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [confirmDel, setConfirmDel] = useState<{ id: string; title: string } | null>(null);

  const q = useQuery({
    queryKey: ["lesson-templates", search],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_lesson_templates", {
        p_search: search || null,
      });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        title: string;
        description: string | null;
        blocks: unknown[];
        estimated_minutes: number | null;
        created_at: string;
      }>;
    },
  });

  const doDelete = async () => {
    if (!confirmDel) return;
    const { error } = await supabase.rpc("admin_delete_lesson_template", { p_id: confirmDel.id });
    if (error) return toast.error(error.message);
    toast.success("Template deleted");
    setConfirmDel(null);
    qc.invalidateQueries({ queryKey: ["lesson-templates"] });
  };

  const list = useMemo(() => q.data ?? [], [q.data]);

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl p-4 flex items-center gap-2">
        <Input
          placeholder="Search templates…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Button variant="outline" size="sm" onClick={() => q.refetch()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
        </Button>
      </Card>
      {q.isLoading && <Skeleton className="h-24 w-full" />}
      {list.length === 0 && !q.isLoading && (
        <Card className="rounded-2xl p-8 text-center text-sm text-muted-foreground">
          No templates yet. Save a draft lesson as a template from the course editor.
        </Card>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {list.map((t) => (
          <Card key={t.id} className="rounded-2xl p-4">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{t.title}</div>
                {t.description && (
                  <div className="text-xs text-muted-foreground line-clamp-3 mt-1">{t.description}</div>
                )}
                <div className="text-[11px] text-muted-foreground mt-2">
                  {(Array.isArray(t.blocks) ? t.blocks.length : 0)} blocks ·{" "}
                  {t.estimated_minutes ?? 0}m · saved {format(new Date(t.created_at), "MMM d, yyyy")}
                </div>
              </div>
              {isAdmin && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  onClick={() => setConfirmDel({ id: t.id, title: t.title })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
      <Dialog open={!!confirmDel} onOpenChange={(v) => !v && setConfirmDel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete template?</DialogTitle>
            <DialogDescription>
              {confirmDel?.title} — this cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDel(null)}>Cancel</Button>
            <Button variant="destructive" onClick={doDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

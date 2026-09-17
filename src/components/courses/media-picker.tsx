import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Film, ImageIcon, File as FileIcon } from "lucide-react";

export type MediaRow = {
  id: string;
  bucket: string;
  path: string;
  file_name: string | null;
  title: string | null;
  alt: string | null;
  kind: "image" | "video" | "pdf" | "file";
  mime_type: string | null;
  byte_size: number | null;
  created_at: string;
};

type PickResult = { bucket: string; path: string; file_name?: string; alt?: string };

// ---------- Signed-URL hook (only for image thumbnails) ----------
function useSignedUrl(bucket: string | null, path: string | null, enabled: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  const key = `${bucket}::${path}`;
  const lastKey = useRef<string | null>(null);
  if (enabled && bucket && path && lastKey.current !== key) {
    lastKey.current = key;
    void supabase.storage.from(bucket).createSignedUrl(path, 3600).then((r) => {
      if (!r.error) setUrl(r.data.signedUrl);
    });
  }
  return url;
}

function KindIcon({ kind, className }: { kind: MediaRow["kind"]; className?: string }) {
  const Icon = kind === "image" ? ImageIcon : kind === "video" ? Film : kind === "pdf" ? FileText : FileIcon;
  return <Icon className={className} />;
}

export function MediaThumb({ row, className }: { row: MediaRow; className?: string }) {
  const signed = useSignedUrl(row.bucket, row.path, row.kind === "image");
  if (row.kind === "image" && signed) {
    return <img src={signed} alt={row.alt ?? row.title ?? ""} className={className ?? "w-full h-full object-cover"} />;
  }
  return (
    <div className={"flex items-center justify-center bg-muted text-muted-foreground " + (className ?? "w-full h-full")}>
      <KindIcon kind={row.kind} className="h-8 w-8" />
    </div>
  );
}

export function MediaPickerDialog({
  open,
  onClose,
  onPick,
  kindFilter,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (picked: PickResult) => void;
  kindFilter?: "image" | "video" | "pdf" | "file" | null;
}) {
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["media-library", { search, kind: kindFilter ?? null }],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_media_list", {
        p_search: search || null,
        p_kind: kindFilter ?? null,
      });
      if (error) throw error;
      return (data ?? []) as MediaRow[];
    },
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Media Library</DialogTitle>
          <DialogDescription>
            {kindFilter ? `Choose ${kindFilter}` : "Choose any file"} from the Academy library.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input placeholder="Search title, filename, alt…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {query.isLoading && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-square" />)}
            </div>
          )}
          {query.error && <div className="text-sm text-destructive">{(query.error as Error).message}</div>}
          {query.data && query.data.length === 0 && (
            <div className="text-sm text-muted-foreground py-8 text-center">No assets found.</div>
          )}
          {query.data && query.data.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {query.data.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => {
                    onPick({
                      bucket: row.bucket,
                      path: row.path,
                      file_name: row.file_name ?? undefined,
                      alt: row.alt ?? row.title ?? undefined,
                    });
                    onClose();
                  }}
                  className="text-left rounded-lg border overflow-hidden hover:ring-2 hover:ring-primary transition-shadow"
                >
                  <div className="aspect-square bg-muted">
                    <MediaThumb row={row} />
                  </div>
                  <div className="p-2 space-y-1">
                    <div className="text-xs font-medium truncate">{row.title || row.file_name || "Untitled"}</div>
                    <Badge variant="outline" className="text-[10px]">{row.kind}</Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Imperative hook: pick(kind) → Promise<PickResult | null>, plus JSX element to mount.
export function useMediaPicker() {
  const [state, setState] = useState<{
    open: boolean;
    kind: "image" | "video" | "pdf" | "file" | null;
    resolve: ((v: PickResult | null) => void) | null;
  }>({ open: false, kind: null, resolve: null });

  const pick = (blockType: string) =>
    new Promise<PickResult | null>((resolve) => {
      const kind: "image" | "video" | "pdf" | "file" | null =
        blockType === "image" ? "image" :
        blockType === "video" ? "video" :
        blockType === "pdf" ? "pdf" :
        blockType === "download" ? null :
        null;
      setState({ open: true, kind, resolve });
    });

  const close = () => {
    state.resolve?.(null);
    setState({ open: false, kind: null, resolve: null });
  };

  const element = useMemo(
    () => (
      <MediaPickerDialog
        open={state.open}
        onClose={close}
        kindFilter={state.kind}
        onPick={(picked) => {
          state.resolve?.(picked);
          setState({ open: false, kind: null, resolve: null });
        }}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.open, state.kind],
  );

  return { pick, element };
}

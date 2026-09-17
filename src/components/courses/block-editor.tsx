import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Heading1,
  Type,
  Info,
  Quote,
  ListChecks,
  Table as TableIcon,
  Minus,
  Code2,
  Link as LinkIcon,
  Image as ImageIcon,
  Video,
  FileText,
  Download,
  Plus,
  X,
  Upload,
  ChevronDown,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DndList, useSortableRow, DragHandle } from "@/components/courses/dnd";

// ---------- Block model (frozen shape) ----------

export type Block = { block_type: string; content: Record<string, unknown> };
type Keyed = Block & { _key: string };

export function defaultContent(type: string): Record<string, unknown> {
  switch (type) {
    case "heading": return { text: "", level: 2 };
    case "text": return { text: "" };
    case "callout": return { variant: "info", title: "", body: "" };
    case "quote": return { text: "", attribution: "" };
    case "checklist": return { items: [] };
    case "table": return { headers: ["Column 1", "Column 2"], rows: [["", ""]] };
    case "divider": return {};
    case "code": return { code: "", language: "" };
    case "embed": return { url: "", title: "" };
    case "image": return { bucket: "lesson-assets", path: "", alt: "", caption: "" };
    case "video": return { bucket: "lesson-assets", path: "", caption: "" };
    case "pdf": return { bucket: "lesson-assets", path: "", caption: "" };
    case "download": return { bucket: "lesson-assets", path: "", file_name: "", caption: "" };
    default: return {};
  }
}

const BLOCK_META: Array<{ value: string; label: string; icon: React.ComponentType<{ className?: string }>; hint: string }> = [
  { value: "heading", label: "Heading", icon: Heading1, hint: "Section title" },
  { value: "text", label: "Text", icon: Type, hint: "Paragraph" },
  { value: "callout", label: "Callout", icon: Info, hint: "Highlighted note" },
  { value: "quote", label: "Quote", icon: Quote, hint: "Blockquote" },
  { value: "checklist", label: "Checklist", icon: ListChecks, hint: "Task list" },
  { value: "table", label: "Table", icon: TableIcon, hint: "Rows and columns" },
  { value: "divider", label: "Divider", icon: Minus, hint: "Section break" },
  { value: "code", label: "Code", icon: Code2, hint: "Preformatted code" },
  { value: "embed", label: "Embed", icon: LinkIcon, hint: "External URL" },
  { value: "image", label: "Image", icon: ImageIcon, hint: "Upload image" },
  { value: "video", label: "Video", icon: Video, hint: "Upload video" },
  { value: "pdf", label: "PDF", icon: FileText, hint: "Upload PDF" },
  { value: "download", label: "Download", icon: Download, hint: "File download" },
];

// ---------- Auto-growing textarea ----------

function AutoTextarea({
  value,
  onChange,
  placeholder,
  className,
  onKeyDown,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [value]);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      rows={1}
      className={cn(
        "w-full resize-none bg-transparent border-0 outline-none focus:ring-0 p-0 placeholder:text-muted-foreground/50",
        className,
      )}
    />
  );
}

// ---------- Insert menu ("+" and slash) ----------

function InsertMenu({
  open,
  onOpenChange,
  onPick,
  trigger,
}: {
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  onPick: (type: string) => void;
  trigger: React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () =>
      BLOCK_META.filter(
        (b) =>
          b.label.toLowerCase().includes(q.toLowerCase()) ||
          b.value.toLowerCase().includes(q.toLowerCase()),
      ),
    [q],
  );
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <Input
          autoFocus
          placeholder="Search block type…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-8 mb-2"
        />
        <div className="max-h-72 overflow-y-auto">
          {filtered.map((b) => {
            const Icon = b.icon;
            return (
              <button
                key={b.value}
                type="button"
                onClick={() => {
                  onPick(b.value);
                  setQ("");
                  onOpenChange?.(false);
                }}
                className="w-full flex items-center gap-3 px-2 py-2 rounded hover:bg-accent text-left"
              >
                <div className="rounded border h-8 w-8 flex items-center justify-center bg-muted/40">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{b.label}</div>
                  <div className="text-xs text-muted-foreground truncate">{b.hint}</div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-xs text-muted-foreground p-2">No matches.</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function InsertBar({ onInsert, className }: { onInsert: (t: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("relative h-2 group/insert", className)}>
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center justify-center">
        <InsertMenu
          open={open}
          onOpenChange={setOpen}
          onPick={onInsert}
          trigger={
            <button
              type="button"
              className={cn(
                "rounded-full border bg-background shadow-sm h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground transition-opacity",
                open ? "opacity-100" : "opacity-0 group-hover/insert:opacity-100",
              )}
              aria-label="Insert block"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          }
        />
      </div>
    </div>
  );
}

// ---------- Media upload / preview ----------

function useSignedUrl(bucket: string | undefined, path: string | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!bucket || !path) {
      setUrl(null);
      return;
    }
    (async () => {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
      if (cancelled) return;
      if (error) setUrl(null);
      else setUrl(data?.signedUrl ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [bucket, path]);
  return url;
}

function MediaDropzone({
  lessonId,
  content,
  onChange,
  accept,
  withFileName,
  onPickFromLibrary,
  kind,
}: {
  lessonId: string;
  content: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
  accept?: string;
  withFileName?: boolean;
  onPickFromLibrary?: (blockType: string) => Promise<{ bucket: string; path: string; file_name?: string; alt?: string } | null>;
  kind: string;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setUploading(true);
    const path = `lessons/${lessonId}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from("lesson-assets").upload(path, file, {
      upsert: false,
      contentType: file.type || undefined,
    });
    setUploading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const next: Record<string, unknown> = { ...content, bucket: "lesson-assets", path };
    if (withFileName) next.file_name = file.name;
    onChange(next);
    toast.success("Uploaded");
  };

  const pickLibrary = async () => {
    if (!onPickFromLibrary) return;
    const picked = await onPickFromLibrary(kind);
    if (!picked) return;
    const next: Record<string, unknown> = { ...content, bucket: picked.bucket, path: picked.path };
    if (withFileName && picked.file_name) next.file_name = picked.file_name;
    if ("alt" in content && picked.alt) next.alt = picked.alt;
    onChange(next);
  };

  return (
    <div
      className="rounded-lg border-2 border-dashed p-6 text-center bg-muted/20 hover:bg-muted/40 transition-colors"
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (f) void upload(f);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />
      <div className="text-sm text-muted-foreground mb-2">
        Drag &amp; drop a file here, or
      </div>
      <div className="flex items-center justify-center gap-2">
        <Button size="sm" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
          <Upload className="h-3.5 w-3.5 mr-1" />
          {uploading ? "Uploading…" : "Upload"}
        </Button>
        {onPickFromLibrary && (
          <Button size="sm" variant="ghost" onClick={pickLibrary}>
            Choose from library
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------- Individual block renderers ----------

function HeadingBlock({ content, onChange }: { content: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const level = (content.level as number) ?? 2;
  const cls = level === 2 ? "text-2xl font-bold" : level === 3 ? "text-xl font-semibold" : "text-lg font-semibold";
  return (
    <AutoTextarea
      value={(content.text as string) ?? ""}
      onChange={(v) => onChange({ ...content, text: v, level })}
      placeholder={`Heading ${level}`}
      className={cls}
    />
  );
}

function TextBlock({
  content,
  onChange,
  onSlashInsert,
}: {
  content: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
  onSlashInsert: (type: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const val = (content.text as string) ?? "";
  return (
    <div className="relative">
      <AutoTextarea
        value={val}
        onChange={(v) => {
          onChange({ ...content, text: v });
          if (v === "/") setMenuOpen(true);
        }}
        placeholder="Type '/' for commands…"
        className="text-base leading-7"
      />
      <InsertMenu
        open={menuOpen}
        onOpenChange={(o) => {
          setMenuOpen(o);
          if (!o && val === "/") onChange({ ...content, text: "" });
        }}
        onPick={(t) => {
          onChange({ ...content, text: "" });
          onSlashInsert(t);
        }}
        trigger={<span className="absolute left-0 top-0 h-0 w-0" aria-hidden />}
      />
    </div>
  );
}

const CALLOUT_VARIANTS: Record<string, string> = {
  info: "border-l-4 border-teal-500 bg-teal-500/10",
  warning: "border-l-4 border-amber-500 bg-amber-500/10",
  danger: "border-l-4 border-red-500 bg-red-500/10",
  success: "border-l-4 border-emerald-500 bg-emerald-500/10",
};

function CalloutBlock({ content, onChange }: { content: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const variant = ((content.variant as string) || "info").toLowerCase();
  const cls = CALLOUT_VARIANTS[variant] ?? CALLOUT_VARIANTS.info;
  return (
    <div className={cn("rounded-lg p-4 space-y-2", cls)}>
      <div className="flex items-center gap-2">
        <Select value={variant} onValueChange={(v) => onChange({ ...content, variant: v })}>
          <SelectTrigger className="h-7 w-32 bg-background/60"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="danger">Danger</SelectItem>
            <SelectItem value="success">Success</SelectItem>
          </SelectContent>
        </Select>
        <AutoTextarea
          value={(content.title as string) ?? ""}
          onChange={(v) => onChange({ ...content, title: v })}
          placeholder="Callout title"
          className="font-semibold text-sm flex-1"
        />
      </div>
      <AutoTextarea
        value={(content.body as string) ?? ""}
        onChange={(v) => onChange({ ...content, body: v })}
        placeholder="Callout body"
        className="text-sm"
      />
    </div>
  );
}

function QuoteBlock({ content, onChange }: { content: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  return (
    <blockquote className="border-l-4 border-muted-foreground/30 pl-4 py-1">
      <AutoTextarea
        value={(content.text as string) ?? ""}
        onChange={(v) => onChange({ ...content, text: v })}
        placeholder="Quote"
        className="italic text-base"
      />
      <AutoTextarea
        value={(content.attribution as string) ?? ""}
        onChange={(v) => onChange({ ...content, attribution: v })}
        placeholder="— Attribution"
        className="text-sm text-muted-foreground mt-1"
      />
    </blockquote>
  );
}

function ChecklistBlock({ content, onChange }: { content: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const items = ((content.items as string[]) ?? []).slice();
  const set = (next: string[]) => onChange({ ...content, items: next });
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => (
        <div key={i} className="flex items-start gap-2 group/item">
          <Checkbox checked={false} disabled className="mt-1.5" />
          <AutoTextarea
            value={it}
            onChange={(v) => {
              const arr = items.slice();
              arr[i] = v;
              set(arr);
            }}
            placeholder="List item"
            className="flex-1 text-sm"
          />
          <button
            type="button"
            onClick={() => set(items.filter((_, idx) => idx !== i))}
            className="opacity-0 group-hover/item:opacity-100 text-muted-foreground hover:text-destructive mt-1"
            aria-label="Remove item"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <Button size="sm" variant="ghost" className="h-7 -ml-2 text-xs" onClick={() => set([...items, ""])}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Add item
      </Button>
    </div>
  );
}

function TableBlock({ content, onChange }: { content: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const headers = ((content.headers as string[]) ?? []).slice();
  const rows = ((content.rows as string[][]) ?? []).map((r) => r.slice());
  const cols = headers.length;
  const set = (h: string[], r: string[][]) => onChange({ ...content, headers: h, rows: r });

  const addCol = () => {
    const h = [...headers, `Column ${headers.length + 1}`];
    const r = rows.map((row) => [...row, ""]);
    set(h, r);
  };
  const addRow = () => set(headers, [...rows, Array.from({ length: cols }, () => "")]);
  const removeCol = (ci: number) => set(headers.filter((_, i) => i !== ci), rows.map((row) => row.filter((_, i) => i !== ci)));
  const removeRow = (ri: number) => set(headers, rows.filter((_, i) => i !== ri));

  return (
    <div className="space-y-2 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {headers.map((h, ci) => (
              <th key={ci} className="border p-1 bg-muted/40 text-left align-top group/col relative">
                <div className="flex items-center gap-1">
                  <input
                    value={h}
                    onChange={(e) => {
                      const arr = headers.slice();
                      arr[ci] = e.target.value;
                      set(arr, rows);
                    }}
                    className="w-full bg-transparent outline-none font-semibold"
                    placeholder={`Column ${ci + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeCol(ci)}
                    className="opacity-0 group-hover/col:opacity-100 text-muted-foreground hover:text-destructive"
                    aria-label="Remove column"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="group/row">
              {row.map((cell, ci) => (
                <td key={ci} className="border p-1 align-top">
                  <input
                    value={cell}
                    onChange={(e) => {
                      const arr = rows.map((r) => r.slice());
                      arr[ri][ci] = e.target.value;
                      set(headers, arr);
                    }}
                    className="w-full bg-transparent outline-none"
                  />
                </td>
              ))}
              <td className="pl-1 w-6">
                <button
                  type="button"
                  onClick={() => removeRow(ri)}
                  className="opacity-0 group-hover/row:opacity-100 text-muted-foreground hover:text-destructive"
                  aria-label="Remove row"
                >
                  <X className="h-3 w-3" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addRow}>
          <Plus className="h-3 w-3 mr-1" /> Row
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addCol}>
          <Plus className="h-3 w-3 mr-1" /> Column
        </Button>
      </div>
    </div>
  );
}

function CodeBlock({ content, onChange }: { content: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  return (
    <div className="rounded-lg bg-muted p-3 space-y-2">
      <input
        value={(content.language as string) ?? ""}
        onChange={(e) => onChange({ ...content, language: e.target.value })}
        placeholder="language (e.g. ts, sql)"
        className="w-full bg-transparent outline-none text-xs text-muted-foreground"
      />
      <AutoTextarea
        value={(content.code as string) ?? ""}
        onChange={(v) => onChange({ ...content, code: v })}
        placeholder="Enter code…"
        className="font-mono text-sm"
      />
    </div>
  );
}

function EmbedBlock({ content, onChange }: { content: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const url = (content.url as string) ?? "";
  return (
    <div className="space-y-2">
      <Input
        value={url}
        onChange={(e) => onChange({ ...content, url: e.target.value })}
        placeholder="https://…"
      />
      <AutoTextarea
        value={(content.title as string) ?? ""}
        onChange={(v) => onChange({ ...content, title: v })}
        placeholder="Optional title"
        className="text-sm text-muted-foreground"
      />
      {url && /^https?:\/\//i.test(url) && (
        <div className="aspect-video rounded border overflow-hidden bg-muted">
          <iframe src={url} title={(content.title as string) ?? "Embed"} className="w-full h-full" />
        </div>
      )}
    </div>
  );
}

function MediaPreviewOrDrop({
  lessonId,
  content,
  onChange,
  kind,
  onPickFromLibrary,
}: {
  lessonId: string;
  content: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
  kind: "image" | "video" | "pdf" | "download";
  onPickFromLibrary?: (blockType: string) => Promise<{ bucket: string; path: string; file_name?: string; alt?: string } | null>;
}) {
  const bucket = (content.bucket as string) || "lesson-assets";
  const path = (content.path as string) || "";
  const signed = useSignedUrl(bucket, path);
  const accept =
    kind === "image" ? "image/*" : kind === "video" ? "video/*" : kind === "pdf" ? "application/pdf" : undefined;
  const withFileName = kind === "download";

  if (!path) {
    return (
      <MediaDropzone
        lessonId={lessonId}
        content={content}
        onChange={onChange}
        accept={accept}
        withFileName={withFileName}
        onPickFromLibrary={onPickFromLibrary}
        kind={kind}
      />
    );
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg border bg-muted/20 overflow-hidden">
        {kind === "image" && signed && (
          <img src={signed} alt={(content.alt as string) ?? ""} className="w-full max-h-[420px] object-contain bg-black/5" />
        )}
        {kind === "video" && signed && (
          <video src={signed} controls className="w-full max-h-[420px] bg-black" />
        )}
        {kind === "pdf" && signed && (
          <iframe src={signed} title="PDF" className="w-full h-[420px]" />
        )}
        {kind === "download" && (
          <div className="flex items-center justify-between p-3">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {(content.file_name as string) || path.split("/").pop()}
                </div>
                <div className="text-xs text-muted-foreground truncate">{path}</div>
              </div>
            </div>
            {signed && (
              <a href={signed} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
                Open
              </a>
            )}
          </div>
        )}
        {!signed && kind !== "download" && <Skeleton className="w-full h-40" />}
      </div>
      <div className="flex flex-wrap gap-2 items-center text-xs text-muted-foreground">
        <span className="truncate flex-1">{path}</span>
        <ReplaceButton
          lessonId={lessonId}
          accept={accept}
          onUploaded={(next) => onChange({ ...content, ...next })}
          withFileName={withFileName}
        />
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => onChange({ ...content, path: "", ...(withFileName ? { file_name: "" } : {}) })}
        >
          Remove
        </Button>
      </div>
      {kind === "image" && (
        <Input
          value={(content.alt as string) ?? ""}
          onChange={(e) => onChange({ ...content, alt: e.target.value })}
          placeholder="Alt text"
        />
      )}
      {kind === "download" && (
        <Input
          value={(content.file_name as string) ?? ""}
          onChange={(e) => onChange({ ...content, file_name: e.target.value })}
          placeholder="File name"
        />
      )}
      <Input
        value={(content.caption as string) ?? ""}
        onChange={(e) => onChange({ ...content, caption: e.target.value })}
        placeholder="Caption (optional)"
      />
    </div>
  );
}

function ReplaceButton({
  lessonId,
  accept,
  onUploaded,
  withFileName,
}: {
  lessonId: string;
  accept?: string;
  onUploaded: (next: { bucket: string; path: string; file_name?: string; alt?: string }) => void;
  withFileName?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const upload = async (file: File) => {
    setBusy(true);
    const path = `lessons/${lessonId}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from("lesson-assets").upload(path, file, {
      upsert: false,
      contentType: file.type || undefined,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    onUploaded({ bucket: "lesson-assets", path, ...(withFileName ? { file_name: file.name } : {}) });
    toast.success("Replaced");
  };
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />
      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => ref.current?.click()}>
        <Upload className="h-3 w-3 mr-1" /> {busy ? "Uploading…" : "Replace"}
      </Button>
    </>
  );
}

// ---------- Block wrapper (hover toolbar + sortable) ----------

function BlockRenderer({
  block,
  lessonId,
  onChange,
  onSlashInsert,
  onPickFromLibrary,
}: {
  block: Block;
  lessonId: string;
  onChange: (c: Record<string, unknown>) => void;
  onSlashInsert: (type: string) => void;
  onPickFromLibrary?: (blockType: string) => Promise<{ bucket: string; path: string; file_name?: string; alt?: string } | null>;
}) {
  switch (block.block_type) {
    case "heading": return <HeadingBlock content={block.content} onChange={onChange} />;
    case "text": return <TextBlock content={block.content} onChange={onChange} onSlashInsert={onSlashInsert} />;
    case "callout": return <CalloutBlock content={block.content} onChange={onChange} />;
    case "quote": return <QuoteBlock content={block.content} onChange={onChange} />;
    case "checklist": return <ChecklistBlock content={block.content} onChange={onChange} />;
    case "table": return <TableBlock content={block.content} onChange={onChange} />;
    case "divider": return <hr className="border-t-2 my-2" />;
    case "code": return <CodeBlock content={block.content} onChange={onChange} />;
    case "embed": return <EmbedBlock content={block.content} onChange={onChange} />;
    case "image":
    case "video":
    case "pdf":
    case "download":
      return (
        <MediaPreviewOrDrop
          lessonId={lessonId}
          content={block.content}
          onChange={onChange}
          kind={block.block_type}
          onPickFromLibrary={onPickFromLibrary}
        />
      );
    default:
      return <div className="text-xs text-muted-foreground">Unknown block: {block.block_type}</div>;
  }
}

function WysiwygBlock({
  block,
  lessonId,
  onChange,
  onTypeChange,
  onDelete,
  onInsertBelow,
  onPickFromLibrary,
}: {
  block: Keyed;
  lessonId: string;
  onChange: (c: Record<string, unknown>) => void;
  onTypeChange: (type: string) => void;
  onDelete: () => void;
  onInsertBelow: (type: string) => void;
  onPickFromLibrary?: (blockType: string) => Promise<{ bucket: string; path: string; file_name?: string; alt?: string } | null>;
}) {
  const s = useSortableRow(block._key);
  const [typeMenu, setTypeMenu] = useState(false);
  return (
    <>
      <div ref={s.setNodeRef} style={s.style} className="group relative pl-10 pr-2 py-1 rounded hover:bg-muted/20">
        <div className="absolute left-0 top-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <DragHandle attributes={s.attributes} listeners={s.listeners} />
          <InsertMenu
            open={typeMenu}
            onOpenChange={setTypeMenu}
            onPick={(t) => onTypeChange(t)}
            trigger={
              <button
                type="button"
                className="text-muted-foreground/60 hover:text-foreground p-0.5"
                title="Change block type"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            }
          />
          <button
            type="button"
            onClick={onDelete}
            className="text-muted-foreground/60 hover:text-destructive p-0.5"
            title="Delete block"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          {block.block_type === "heading" && (
            <div className="flex items-center gap-0.5 ml-1">
              {[2, 3, 4].map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => onChange({ ...block.content, level: lvl })}
                  className={cn(
                    "h-5 px-1 rounded text-[10px] font-semibold border",
                    (block.content.level as number) === lvl
                      ? "bg-primary text-primary-foreground border-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  H{lvl}
                </button>
              ))}
            </div>
          )}
        </div>
        <BlockRenderer
          block={block}
          lessonId={lessonId}
          onChange={onChange}
          onSlashInsert={onInsertBelow}
          onPickFromLibrary={onPickFromLibrary}
        />
      </div>
      <InsertBar onInsert={onInsertBelow} />
    </>
  );
}

// ---------- Dialog ----------

export function BlockEditorDialog({
  lessonId,
  lessonTitle,
  onClose,
  onSaved,
  onPickFromLibrary,
}: {
  lessonId: string;
  lessonTitle: string;
  onClose: () => void;
  onSaved: () => void;
  onPickFromLibrary?: (blockType: string) => Promise<{ bucket: string; path: string; file_name?: string; alt?: string } | null>;
}) {
  const [blocks, setBlocks] = useState<Keyed[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("lesson_content_blocks")
        .select("*")
        .eq("lesson_id", lessonId)
        .order("display_order");
      if (error) {
        toast.error(error.message);
      } else {
        setBlocks(
          (data ?? []).map((r: { block_type: string; content: unknown }) => ({
            block_type: r.block_type,
            content: (r.content ?? {}) as Record<string, unknown>,
            _key: crypto.randomUUID(),
          })),
        );
      }
      setLoading(false);
    })();
  }, [lessonId]);

  const updateAt = (i: number, content: Record<string, unknown>) =>
    setBlocks((bs) => bs.map((b, idx) => (idx === i ? { ...b, content } : b)));
  const changeTypeAt = (i: number, type: string) =>
    setBlocks((bs) => bs.map((b, idx) => (idx === i ? { ...b, block_type: type, content: defaultContent(type) } : b)));
  const removeAt = (i: number) => setBlocks((bs) => bs.filter((_, idx) => idx !== i));
  const insertAt = (i: number, type: string) =>
    setBlocks((bs) => {
      const next = bs.slice();
      next.splice(i, 0, { block_type: type, content: defaultContent(type), _key: crypto.randomUUID() });
      return next;
    });

  const reorder = (ordered: string[]) => {
    setBlocks((bs) => {
      const map = new Map(bs.map((b) => [b._key, b]));
      return ordered.map((k) => map.get(k)!).filter(Boolean);
    });
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.rpc("admin_save_lesson_blocks", {
      p_lesson: lessonId,
      p_blocks: blocks.map((b) => ({ block_type: b.block_type, content: b.content })),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Blocks saved");
    onSaved();
  };

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-3xl p-0 flex flex-col">
        <SheetHeader className="p-6 pb-4 border-b sticky top-0 bg-background z-10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SheetTitle>Edit content — {lessonTitle}</SheetTitle>
              <SheetDescription>
                Block editor. Drag to reorder, hover for actions, click + to insert.
              </SheetDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" onClick={save} disabled={saving || loading}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 pt-4">
          {loading && <Skeleton className="h-40 w-full" />}
          {!loading && (
            <>
              <InsertBar onInsert={(t) => insertAt(0, t)} />
              <DndList items={blocks.map((b) => ({ id: b._key }))} onReorder={reorder}>
                {blocks.map((b, i) => (
                  <WysiwygBlock
                    key={b._key}
                    block={b}
                    lessonId={lessonId}
                    onChange={(c) => updateAt(i, c)}
                    onTypeChange={(t) => changeTypeAt(i, t)}
                    onDelete={() => removeAt(i)}
                    onInsertBelow={(t) => insertAt(i + 1, t)}
                    onPickFromLibrary={onPickFromLibrary}
                  />
                ))}
              </DndList>
              {blocks.length === 0 && (
                <div className="text-sm text-muted-foreground rounded-lg border border-dashed p-8 text-center">
                  Empty lesson. Click the <Plus className="inline h-3.5 w-3.5" /> above to add your first block.
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

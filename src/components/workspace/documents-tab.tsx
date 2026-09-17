import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Download, FileText, Loader2, Replace, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  deleteCandidateFile,
  fetchCandidateFiles,
  getSignedUrl,
  replaceCandidateFile,
  uploadCandidateFileWithProgress,
  type CandidateFileRow,
  type UploadSpec,
  updateCandidateIntroVideoUrl,
  isLikelyValidUrl,
} from "@/lib/queries";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { Progress } from "@/components/ui/progress";

const TYPE_META: Record<
  string,
  { label: string; bucket: UploadSpec["bucket"]; fileType: UploadSpec["fileType"]; accept: string }
> = {
  profile_photo: {
    label: "Photograph",
    bucket: "candidate-photos",
    fileType: "profile_photo",
    accept: "image/*",
  },
  id_document: {
    label: "Government Issued ID",
    bucket: "candidate-resumes",
    fileType: "id_document",
    accept: "image/*,application/pdf",
  },
  original_resume: {
    label: "Resume / CV",
    bucket: "candidate-resumes",
    fileType: "original_resume",
    accept: ".pdf,.doc,.docx",
  },
  intro_video: {
    label: "Introduction Video",
    bucket: "intro-videos",
    fileType: "intro_video",
    accept: "video/*,application/pdf",
  },
  other: {
    label: "Supporting Documents",
    bucket: "candidate-resumes",
    fileType: "other",
    accept: "*",
  },
};

const TYPE_ORDER = ["profile_photo", "id_document", "original_resume", "intro_video", "other"];

export function DocumentsTab({ candidateId }: { candidateId: string }) {
  const qc = useQueryClient();
  const files = useQuery({
    queryKey: ["candidate-files", candidateId],
    queryFn: () => fetchCandidateFiles(candidateId),
  });
  const [uploadOpen, setUploadOpen] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["candidate-files", candidateId] });

  const grouped: Record<string, CandidateFileRow[]> = {};
  TYPE_ORDER.forEach((t) => (grouped[t] = []));
  (files.data ?? []).forEach((f) => {
    (grouped[f.file_type] ||= []).push(f);
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Documents</h3>
          <p className="text-sm text-muted-foreground">
            Files uploaded to this candidate.
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)}>
          <Upload className="h-4 w-4 mr-2" /> Upload file
        </Button>
      </div>

      {files.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : files.isError ? (
        <p className="text-sm text-destructive">Failed to load files.</p>
      ) : (
        <div className="space-y-5">
          {TYPE_ORDER.map((type) => {
            const items = grouped[type] ?? [];
            const meta = TYPE_META[type];
            return (
              <section key={type} className="rounded-xl border">
                <header className="flex items-center justify-between px-4 py-3 border-b bg-secondary/30">
                  <h4 className="font-medium text-sm">{meta.label}</h4>
                  <span className="text-xs text-muted-foreground">{items.length} file(s)</span>
                </header>
                {items.length === 0 ? (
                  <p className="px-4 py-5 text-sm text-muted-foreground italic">
                    None uploaded.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {items.map((f) => (
                      <FileRow key={f.id} file={f} candidateId={candidateId} onChanged={invalidate} />
                    ))}
                  </ul>
                )}
                {type === "intro_video" && <IntroVideoLinkBlock candidateId={candidateId} />}
              </section>
            );
          })}
        </div>
      )}

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        candidateId={candidateId}
        onUploaded={invalidate}
      />
    </div>
  );
}

function IntroVideoLinkBlock({ candidateId }: { candidateId: string }) {
  const qc = useQueryClient();
  const queryKey = ["candidate-intro-video-url", candidateId];
  const link = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates")
        .select("intro_video_url")
        .eq("id", candidateId)
        .maybeSingle();
      if (error) throw error;
      return ((data as { intro_video_url: string | null } | null)?.intro_video_url ?? null) as string | null;
    },
  });
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (url: string | null) => {
    if (url !== null && !isLikelyValidUrl(url)) {
      toast.error("Enter a valid http(s) URL");
      return;
    }
    setBusy(true);
    try {
      await updateCandidateIntroVideoUrl(candidateId, url ? url.trim() : null);
      toast.success(url ? "Link saved" : "Link cleared");
      setEditing(false);
      setValue("");
      qc.invalidateQueries({ queryKey });
    } catch (e: any) {
      toast.error(e?.message || "Could not save link");
    } finally {
      setBusy(false);
    }
  };

  const current = link.data ?? null;

  return (
    <div className="px-4 py-3 border-t bg-muted/20 space-y-2">
      <div className="text-xs font-medium text-muted-foreground">
        Or use a link instead of a file
      </div>
      {current && !editing ? (
        <div className="flex items-center gap-2">
          <a
            href={current}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-primary underline truncate flex-1 min-w-0"
          >
            {current}
          </a>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setValue(current);
              setEditing(true);
            }}
          >
            Edit
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => save(null)}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Clear"}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            type="url"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://youtube.com/watch?v=... or https://loom.com/share/..."
            className="h-8 text-sm"
            disabled={busy}
          />
          <Button size="sm" disabled={busy || !value.trim()} onClick={() => save(value)}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save link
          </Button>
          {current && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setEditing(false); setValue(""); }}>
              Cancel
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function FileRow({
  file,
  candidateId,
  onChanged,
}: {
  file: CandidateFileRow;
  candidateId: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<null | "preview" | "replace" | "delete">(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const replaceRef = useRef<HTMLInputElement>(null);

  const meta = TYPE_META[file.file_type];

  const openPreview = async () => {
    setBusy("preview");
    const url = await getSignedUrl(file.bucket_id, file.storage_path);
    setBusy(null);
    if (!url) {
      toast.error("Could not generate preview URL");
      return;
    }
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      setPreviewUrl(URL.createObjectURL(blob));
    } catch {
      toast.error("Could not load file for preview");
    }
  };

  const download = async () => {
    const url = await getSignedUrl(file.bucket_id, file.storage_path);
    if (!url) {
      toast.error("Could not generate download URL");
      return;
    }
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = file.file_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 10_000);
    } catch {
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };

  const onReplace = async (newFile: File) => {
    setBusy("replace");
    try {
      await replaceCandidateFile(candidateId, file, newFile);
      toast.success("File replaced");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Replace failed");
    } finally {
      setBusy(null);
    }
  };

  const onDelete = async () => {
    if (!confirm(`Delete ${file.file_name}?`)) return;
    setBusy("delete");
    try {
      await deleteCandidateFile(file);
      toast.success("File deleted");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Delete failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-sm truncate">{file.file_name}</div>
        <div className="text-xs text-muted-foreground">
          {format(new Date(file.created_at), "MMM d, yyyy")}
          {file.size_bytes ? ` · ${Math.round(file.size_bytes / 1024)} KB` : ""}
          {file.mime_type ? ` · ${file.mime_type}` : ""}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" onClick={openPreview} disabled={busy !== null}>
          {busy === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Preview"}
        </Button>
        <Button size="sm" variant="ghost" onClick={download}>
          <Download className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => replaceRef.current?.click()}
          disabled={busy !== null}
        >
          {busy === "replace" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Replace className="h-4 w-4" />}
        </Button>
        <input
          ref={replaceRef}
          type="file"
          accept={meta?.accept ?? "*"}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onReplace(f);
            e.target.value = "";
          }}
        />
        <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete} disabled={busy !== null}>
          {busy === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>
      </div>

      <Dialog open={!!previewUrl} onOpenChange={(v) => {
        if (!v) {
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          setPreviewUrl(null);
        }
      }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="truncate">{file.file_name}</DialogTitle>
          </DialogHeader>
          {previewUrl && <PreviewBody url={previewUrl} mime={file.mime_type} name={file.file_name} />}
        </DialogContent>
      </Dialog>
    </li>
  );
}

function PreviewBody({ url, mime, name }: { url: string; mime: string | null; name: string }) {
  const m = mime ?? "";
  const content = m.startsWith("image/") ? (
    <img src={url} alt={name} className="max-h-[70vh] mx-auto rounded" />
  ) : m.startsWith("video/") ? (
    <video src={url} controls className="max-h-[70vh] mx-auto rounded" />
  ) : m === "application/pdf" ? (
    <iframe src={url} title={name} className="w-full h-[70vh] bg-white rounded" />
  ) : (
    <a href={url} target="_blank" rel="noreferrer" className="text-primary underline">
      Open {name}
    </a>
  );
  return (
    <div className="space-y-2">
      <a href={url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Open in new tab</a>
      {content}
    </div>
  );
}

function UploadDialog({
  open,
  onOpenChange,
  candidateId,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  candidateId: string;
  onUploaded: () => void;
}) {
  const [type, setType] = useState<string>("other");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setProgress(0);
    if (!open) {
      setType("other");
      setFile(null);
    }
  }, [open]);

  const upload = async () => {
    if (!file) return;
    const meta = TYPE_META[type];
    setBusy(true);
    setProgress(0);
    try {
      await uploadCandidateFileWithProgress(
        candidateId,
        { file, bucket: meta.bucket, fileType: meta.fileType },
        setProgress,
      );
      toast.success("Uploaded");
      setType("other");
      setFile(null);
      setProgress(0);
      onOpenChange(false);
      onUploaded();
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
          <DialogDescription>Stored in the correct private bucket for this candidate.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Document type</Label>
            <Select value={type} onValueChange={setType} disabled={busy}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPE_ORDER.map((t) => (
                  <SelectItem key={t} value={t}>{TYPE_META[t].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>File</Label>
            <input
              type="file"
              accept={TYPE_META[type].accept}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={busy}
              className="block w-full text-sm border rounded-md p-2"
            />
          </div>
          {busy && (
            <div className="space-y-1">
              <Progress value={progress} />
              <div className="text-xs text-muted-foreground text-right">{progress}%</div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={upload} disabled={!file || busy}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


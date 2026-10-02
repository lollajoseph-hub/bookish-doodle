import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  FileText,
  Image,
  Video,
  IdCard,
  Paperclip,
  Trash2,
  Upload,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import {
  deleteCandidateFile,
  fetchCandidateFiles,
  getCandidateFileUrl,
  labelize,
  uploadCandidateFile,
} from "@/lib/crm-queries";
import type { CandidateFileRow, CandidateFileType } from "@/lib/database.types";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PdfPagePreview } from "@/components/PdfPagePreview";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const FILE_TYPES: CandidateFileType[] = [
  "resume",
  "profile_photo",
  "intro_video",
  "id_document",
  "reference",
  "other",
];

function iconFor(type: string) {
  if (type === "resume") return FileText;
  if (type === "profile_photo") return Image;
  if (type === "intro_video") return Video;
  if (type === "id_document") return IdCard;
  return Paperclip;
}

function prettySize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isPdf(file: CandidateFileRow) {
  const name = file.file_name || file.storage_path || "";
  return name.toLowerCase().endsWith(".pdf");
}

export function CandidateFilesCard({
  candidateId,
  canEdit,
}: {
  candidateId: string;
  canEdit: boolean;
}) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileType, setFileType] = useState<CandidateFileType>("resume");
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const { data: files = [], isLoading } = useQuery({
    queryKey: ["candidate-files", candidateId],
    queryFn: () => fetchCandidateFiles(candidateId),
  });

  const upload = useMutation({
    mutationFn: (file: File) =>
      uploadCandidateFile({ candidateId, file, fileType, uploadedBy: profile?.id ?? null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidate-files", candidateId] });
      if (fileType === "resume") {
        toast.success(
          "Resume uploaded — AI analysis will appear automatically once ready."
        );
        // The AI pipeline processes the resume asynchronously. The AI Analysis
        // query polls until the profile row exists, so one kick after a short
        // delay is enough to start it.
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["candidate-ai", candidateId] });
          queryClient.invalidateQueries({ queryKey: ["candidate", candidateId] });
        }, 3000);
      } else {
        toast.success("File uploaded");
      }
    },
    onError: (e: Error) => toast.error(e.message || "Upload failed"),
  });

  const remove = useMutation({
    mutationFn: (file: CandidateFileRow) => deleteCandidateFile(file),
    onSuccess: () => {
      toast.success("File removed");
      queryClient.invalidateQueries({ queryKey: ["candidate-files", candidateId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openFile = async (file: CandidateFileRow) => {
    try {
      const url = await getCandidateFileUrl(file);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error((e as Error).message || "Could not open file");
    }
  };

  const togglePreview = async (file: CandidateFileRow) => {
    if (previewFileId === file.id) {
      setPreviewFileId(null);
      setPreviewUrl(null);
      return;
    }
    setPreviewFileId(file.id);
    setPreviewUrl(null);
    setPreviewLoading(true);
    try {
      const url = await getCandidateFileUrl(file);
      setPreviewUrl(url);
    } catch (e) {
      toast.error((e as Error).message || "Could not load preview");
      setPreviewFileId(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <section className="card-amber rounded-3xl p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-2xl font-semibold leading-tight">Files</h2>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Select value={fileType} onValueChange={(v: string) => setFileType(v as CandidateFileType)}>
              <SelectTrigger className="h-9 w-40 rounded-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {labelize(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              ref={inputRef}
              type="file"
              accept={fileType === "intro_video" ? "video/mp4,video/webm,video/quicktime,video/ogg" : undefined}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  if (fileType === "intro_video" && !f.type.startsWith("video/")) {
                    toast.error("Please select a video file");
                  } else {
                    upload.mutate(f);
                  }
                }
                e.target.value = "";
              }}
            />
            <Button size="sm" onClick={() => inputRef.current?.click()} disabled={upload.isPending}>
              {upload.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="mr-1 h-3.5 w-3.5" />
              )}
              Upload
            </Button>
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2.5">
        {isLoading && <p className="text-sm text-muted-foreground">Loading files…</p>}
        {files.map((f) => {
          const Icon = iconFor(f.file_type);
          const pdf = isPdf(f);
          const isPreviewing = previewFileId === f.id;
          return (
            <div key={f.id} className="rounded-2xl bg-white/70 shadow-[inset_0_0_0_1px_rgb(26_19_32/0.08)] transition-[box-shadow,border-color] duration-300 hover:shadow-[inset_0_0_0_1px_rgb(122_89_163/0.25),0_22px_44px_-24px_rgb(46_16_73/0.5)]">
              <div className="flex items-center justify-between gap-2 p-3">
                <button
                  onClick={() => (pdf ? togglePreview(f) : openFile(f))}
                  className="flex min-w-0 items-center gap-3 text-left"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary-soft to-amber-soft">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{f.file_name || f.storage_path}</div>
                    <div className="text-xs tabular-nums text-muted-foreground">
                      {labelize(f.file_type)} {prettySize(f.size_bytes)}
                    </div>
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge variant="secondary" className="h-6 rounded-full border-0 bg-primary-soft px-2.5 text-[11.5px] font-semibold text-primary">{labelize(f.file_type)}</Badge>
                  {pdf && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      aria-label={isPreviewing ? "Hide preview" : "Preview file"}
                      onClick={() => togglePreview(f)}
                    >
                      {isPreviewing ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    aria-label="Open in new tab"
                    onClick={() => openFile(f)}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      aria-label="Delete file"
                      onClick={() => remove.mutate(f)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              {isPreviewing && (
                <div className="border-t border-[rgb(26_19_32/0.08)] p-3">
                  {previewLoading && (
                    <p className="text-sm text-muted-foreground">Loading preview…</p>
                  )}
                  {!previewLoading && previewUrl && (
                    <PdfPagePreview
                      url={previewUrl}
                      className="max-h-[70vh] overflow-y-auto rounded-2xl bg-stone/90 shadow-[inset_0_0_0_1px_rgb(26_19_32/0.08)]"
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!isLoading && !files.length && (
          <p className="text-sm text-muted-foreground">No files uploaded yet.</p>
        )}
      </div>
    </section>
  );
}

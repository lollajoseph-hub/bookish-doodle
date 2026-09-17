import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, Fragment } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Plus,
  RefreshCw,
  Search,
  Copy,
  Pencil,
  Archive,
  Power,
  Trash2,
  Rocket,
  ArrowUp,
  ArrowDown,
  FileText,
  Upload,
  X,
  Eye,
  GraduationCap,
  Check,
  BookmarkPlus,
  LayoutTemplate,
} from "lucide-react";
import { DndList, useSortableRow, DragHandle } from "@/components/courses/dnd";
import { BlockEditorDialog } from "@/components/courses/block-editor";
import { useMediaPicker } from "@/components/courses/media-picker";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/courses")({
  ssr: false,
  component: CoursesPage,
});

type CourseRow = {
  id: string;
  title: string;
  status: string;
  version: number;
  is_published: boolean;
  root_course_id: string | null;
  enrolled: number | null;
  completed: number | null;
  completion_pct: number | null;
  certificates_issued: number | null;
  created_by: string | null;
  modified_by: string | null;
  created_at: string;
  updated_at: string;
};

type SearchRow = {
  kind: string;
  id: string;
  title: string;
  context: string | null;
  course_id: string | null;
  course_title: string | null;
  status: string | null;
};

type CourseTree = {
  course: {
    id: string;
    title: string;
    description: string | null;
    category: string | null;
    level: string | null;
    duration_minutes: number | null;
    status: string;
    version: number;
    is_published: boolean;
  };
  completion_config?: unknown;
  final_module_id?: string | null;
  modules: Array<{
    id: string;
    title: string;
    description: string | null;
    display_order: number;
    is_published: boolean;
    estimated_duration_minutes: number | null;
    lessons: Array<{
      id: string;
      title: string;
      display_order: number;
      is_published: boolean;
      estimated_minutes: number | null;
      blocks_count: number | null;
    }>;
    assessments: Array<{
      id: string;
      title: string;
      kind: string;
      passing_score: number | null;
      max_attempts: number | null;
      is_required: boolean;
      questions: Array<{
        id: string;
        question: string;
        question_type: string;
        points: number | null;
        prompt?: string | null;
        explanation?: string | null;
        model_answer?: string | null;
      }>;
    }>;
  }>;
  roleplays: Array<{
    id: string;
    title: string;
    slug: string | null;
    passing_score: number | null;
    is_required: boolean;
    is_published: boolean;
    description?: string | null;
    candidate_objective?: string | null;
    expected_behaviors?: string | null;
    common_mistakes?: string | null;
    grading_criteria?: unknown;
    min_category_score?: number | null;
  }>;
};

type Impact = {
  enrolled: number | null;
  active_on_this: number | null;
  lineage?: Array<{ version: number; title: string; enrolled: number | null; active: number | null }>;
  note?: string | null;
};

type PublishPreview = {
  title: string;
  first_version?: boolean;
  parent_version?: number | null;
  enrolled_on_live?: number | null;
  modules_delta?: number | null;
  lessons_delta?: number | null;
  questions_delta?: number | null;
  final_pass_mark_old?: number | null;
  final_pass_mark_new?: number | null;
  added_modules?: string[];
  summary?: string[];
};

type PendingItem = { id: string; title: string };
type PendingChanges = {
  modules: PendingItem[];
  lessons: PendingItem[];
  assessments: PendingItem[];
  roleplays: PendingItem[];
};
type RepublishKind = "module" | "lesson" | "assessment" | "roleplay";

async function republishItem(kind: RepublishKind, id: string) {
  const { error } = await supabase.rpc("admin_republish_item", { p_kind: kind, p_id: id });
  if (error) throw error;
}

function RepublishControl({
  kind,
  id,
  courseId,
  isPending,
  isPublishedItem,
  size = "sm",
}: {
  kind: RepublishKind;
  id: string;
  courseId: string;
  isPending: boolean;
  isPublishedItem: boolean;
  size?: "sm" | "xs";
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (!isPending) return null;
  const label = isPublishedItem ? "Modified — needs republish" : "Draft — republish to go live";
  const badgeCls = isPublishedItem
    ? "bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200"
    : "bg-slate-100 text-slate-700 hover:bg-slate-100 border-slate-200";
  const doIt = async () => {
    setBusy(true);
    try {
      await republishItem(kind, id);
      toast.success("Republished");
      qc.invalidateQueries({ queryKey: ["admin-course-tree", courseId] });
      qc.invalidateQueries({ queryKey: ["course-pending", courseId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant="outline" className={`${badgeCls} text-[10px]`}>{label}</Badge>
      <Button
        size={size === "xs" ? "icon" : "sm"}
        variant="outline"
        className={size === "xs" ? "h-6 px-2 text-[10px]" : "h-7 px-2 text-xs"}
        onClick={doIt}
        disabled={busy}
      >
        <Rocket className="h-3 w-3 mr-1" /> {busy ? "…" : "Republish"}
      </Button>
    </span>
  );
}


async function fetchCourseList(): Promise<CourseRow[]> {
  const { data, error } = await supabase.rpc("admin_course_list");
  if (error) throw error;
  return (data ?? []) as CourseRow[];
}

async function fetchCourseTree(id: string): Promise<CourseTree> {
  const { data, error } = await supabase.rpc("admin_course_tree", { p_course: id });
  if (error) throw error;
  return data as CourseTree;
}

async function fetchImpact(id: string): Promise<Impact> {
  const { data, error } = await supabase.rpc("admin_candidate_impact", { p_course: id });
  if (error) throw error;
  return data as Impact;
}

async function search(q: string): Promise<SearchRow[]> {
  const { data, error } = await supabase.rpc("admin_curriculum_search", { p_q: q });
  if (error) throw error;
  return (data ?? []) as SearchRow[];
}

function statusBadge(status: string) {
  const s = status?.toLowerCase();
  if (s === "published") return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Published</Badge>;
  if (s === "archived") return <Badge variant="secondary">Archived</Badge>;
  if (s === "draft") return <Badge variant="outline">Draft</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function CoursesPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const qc = useQueryClient();

  const list = useQuery({ queryKey: ["admin-course-list"], queryFn: fetchCourseList });

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const searchQ = useQuery({
    queryKey: ["admin-curriculum-search", debounced],
    queryFn: () => search(debounced),
    enabled: debounced.length >= 2,
  });

  const [openId, setOpenId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [expandedRoots, setExpandedRoots] = useState<Record<string, boolean>>({});
  const [searchOpen, setSearchOpen] = useState(false);

  const grouped = useMemo(() => {
    const rows = list.data ?? [];
    const map = new Map<string, CourseRow[]>();
    for (const r of rows) {
      const root = r.root_course_id || r.id;
      const arr = map.get(root) ?? [];
      arr.push(r);
      map.set(root, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => b.version - a.version);
    return Array.from(map.entries());
  }, [list.data]);

  const openCourse = (id: string) => {
    setOpenId(id);
    setSearchOpen(false);
  };

  return (
    <AppShell title="Course Management">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <BookOpen className="h-5 w-5" /> Course Management
            </h2>
            <p className="text-sm text-muted-foreground">
              {isAdmin ? "Manage courses, versions, and publishing." : "Read-only view of courses and versions."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Popover open={searchOpen && debounced.length >= 2} onOpenChange={setSearchOpen}>
              <PopoverTrigger asChild>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search courses, modules, lessons…"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setSearchOpen(true);
                    }}
                    onFocus={() => setSearchOpen(true)}
                    className="pl-8 w-72"
                  />
                </div>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-96 p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
                <div className="max-h-96 overflow-y-auto">
                  {searchQ.isLoading && <div className="p-3 text-sm text-muted-foreground">Searching…</div>}
                  {searchQ.data && searchQ.data.length === 0 && (
                    <div className="p-3 text-sm text-muted-foreground">No matches.</div>
                  )}
                  {searchQ.data && searchQ.data.length > 0 && (
                    <SearchResults rows={searchQ.data} onPick={openCourse} />
                  )}
                </div>
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="icon" onClick={() => list.refetch()} disabled={list.isFetching}>
              <RefreshCw className={`h-4 w-4 ${list.isFetching ? "animate-spin" : ""}`} />
            </Button>
            {isAdmin && (
              <Button onClick={() => setNewOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> New Course
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Enrolled</TableHead>
                <TableHead>Completion</TableHead>
                <TableHead>Certificates</TableHead>
                <TableHead>Created by</TableHead>
                <TableHead>Last modified</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading && (
                <TableRow>
                  <TableCell colSpan={9}>
                    <Skeleton className="h-16 w-full" />
                  </TableCell>
                </TableRow>
              )}
              {!list.isLoading && grouped.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    No courses yet.
                  </TableCell>
                </TableRow>
              )}
              {grouped.map(([root, versions]) => {
                const latest = versions[0];
                const older = versions.slice(1);
                const isOpen = !!expandedRoots[root];
                return (
                  <Fragment key={root}>
                    <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => openCourse(latest.id)}>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {older.length > 0 ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setExpandedRoots((s) => ({ ...s, [root]: !isOpen }))}
                          >
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-medium">{latest.title}</TableCell>
                      <TableCell>{statusBadge(latest.status)}</TableCell>
                      <TableCell>v{latest.version}</TableCell>
                      <TableCell>{latest.enrolled ?? 0}</TableCell>
                      <TableCell>{latest.completion_pct ?? 0}%</TableCell>
                      <TableCell>{latest.certificates_issued ?? 0}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{latest.created_by ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {latest.updated_at ? format(new Date(latest.updated_at), "PP") : "—"}
                      </TableCell>
                    </TableRow>
                    {isOpen &&
                      older.map((v) => (
                        <TableRow
                          key={v.id}
                          className="cursor-pointer bg-muted/20 hover:bg-muted/40"
                          onClick={() => openCourse(v.id)}
                        >
                          <TableCell></TableCell>
                          <TableCell className="pl-6 text-sm text-muted-foreground">↳ {v.title}</TableCell>
                          <TableCell>{statusBadge(v.status)}</TableCell>
                          <TableCell>v{v.version}</TableCell>
                          <TableCell>{v.enrolled ?? 0}</TableCell>
                          <TableCell>{v.completion_pct ?? 0}%</TableCell>
                          <TableCell>{v.certificates_issued ?? 0}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{v.created_by ?? "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {v.updated_at ? format(new Date(v.updated_at), "PP") : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {newOpen && isAdmin && (
        <NewCourseDialog
          onClose={() => setNewOpen(false)}
          onCreated={(id) => {
            setNewOpen(false);
            qc.invalidateQueries({ queryKey: ["admin-course-list"] });
            openCourse(id);
          }}
        />
      )}

      {openId && (
        <CourseDetailSheet
          courseId={openId}
          onClose={() => setOpenId(null)}
          isAdmin={isAdmin}
          onChanged={() => qc.invalidateQueries({ queryKey: ["admin-course-list"] })}
          onOpenOther={(id) => setOpenId(id)}
        />
      )}
    </AppShell>
  );
}

function SearchResults({ rows, onPick }: { rows: SearchRow[]; onPick: (courseId: string) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, SearchRow[]>();
    for (const r of rows) {
      const arr = m.get(r.kind) ?? [];
      arr.push(r);
      m.set(r.kind, arr);
    }
    return Array.from(m.entries());
  }, [rows]);
  return (
    <div className="py-1">
      {groups.map(([kind, items]) => (
        <div key={kind} className="py-1">
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {kind}
          </div>
          {items.map((r) => {
            const target = r.kind === "course" ? r.id : r.course_id;
            return (
              <button
                key={`${r.kind}-${r.id}`}
                type="button"
                disabled={!target}
                onClick={() => target && onPick(target)}
                className="w-full text-left px-3 py-2 hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="text-sm font-medium truncate">{r.title}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {r.context ?? r.course_title ?? ""}
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function NewCourseDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [level, setLevel] = useState("beginner");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.rpc("admin_create_course", {
      p_title: title.trim(),
      p_description: description || null,
      p_category: category || null,
      p_level: level,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Course created");
    const id = typeof data === "string" ? data : (data as { id?: string } | null)?.id;
    if (id) onCreated(id);
    else onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New course</DialogTitle>
          <DialogDescription>Draft a new course. You can publish it later.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Category</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Level</Label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">Beginner</SelectItem>
                  <SelectItem value="intermediate">Intermediate</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CourseDetailSheet({
  courseId,
  onClose,
  isAdmin,
  onChanged,
  onOpenOther,
}: {
  courseId: string;
  onClose: () => void;
  isAdmin: boolean;
  onChanged: () => void;
  onOpenOther: (id: string) => void;
}) {
  const qc = useQueryClient();
  const tree = useQuery({ queryKey: ["admin-course-tree", courseId], queryFn: () => fetchCourseTree(courseId) });
  const impact = useQuery({ queryKey: ["admin-candidate-impact", courseId], queryFn: () => fetchImpact(courseId) });
  const pendingQ = useQuery({
    queryKey: ["course-pending", courseId],
    queryFn: async (): Promise<PendingChanges> => {
      const { data, error } = await supabase.rpc("admin_course_pending_changes", { p_course: courseId });
      if (error) throw error;
      return (data ?? { modules: [], lessons: [], assessments: [], roleplays: [] }) as PendingChanges;
    },
  });

  const [editOpen, setEditOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-course-tree", courseId] });
    qc.invalidateQueries({ queryKey: ["admin-candidate-impact", courseId] });
    qc.invalidateQueries({ queryKey: ["course-pending", courseId] });
    onChanged();
  };

  const course = tree.data?.course;
  const status = course?.status;
  const canEdit = isAdmin && status !== undefined && status !== "archived";
  const isPublished = status === "published";
  const pending = pendingQ.data ?? { modules: [], lessons: [], assessments: [], roleplays: [] };
  const pendingModuleIds = useMemo(() => new Set(pending.modules.map((x) => x.id)), [pending]);
  const pendingLessonIds = useMemo(() => new Set(pending.lessons.map((x) => x.id)), [pending]);
  const pendingAssessmentIds = useMemo(() => new Set(pending.assessments.map((x) => x.id)), [pending]);
  const pendingRoleplayIds = useMemo(() => new Set(pending.roleplays.map((x) => x.id)), [pending]);
  const pendingCount = pending.modules.length + pending.lessons.length + pending.assessments.length + pending.roleplays.length;

  const [republishingAll, setRepublishingAll] = useState(false);
  const republishAll = async () => {
    if (pendingCount === 0) return;
    setRepublishingAll(true);
    const jobs: Array<[RepublishKind, string]> = [
      ...pending.modules.map((x) => ["module", x.id] as [RepublishKind, string]),
      ...pending.lessons.map((x) => ["lesson", x.id] as [RepublishKind, string]),
      ...pending.assessments.map((x) => ["assessment", x.id] as [RepublishKind, string]),
      ...pending.roleplays.map((x) => ["roleplay", x.id] as [RepublishKind, string]),
    ];
    let ok = 0;
    for (const [kind, id] of jobs) {
      try { await republishItem(kind, id); ok++; } catch (e) { toast.error((e as Error).message); }
    }
    setRepublishingAll(false);
    toast.success(`Republished ${ok}/${jobs.length}`);
    refresh();
  };

  const doDuplicate = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("admin_duplicate_course", { p_course: courseId });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Version created");
    const id = typeof data === "string" ? data : (data as { id?: string } | null)?.id;
    onChanged();
    if (id) onOpenOther(id);
  };

  const doArchive = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("admin_archive_course", { p_course: courseId });
    setBusy(false);
    setConfirmArchive(false);
    if (error) return toast.error(error.message);
    toast.success("Course archived");
    refresh();
  };

  const doToggleActive = async () => {
    if (!course) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_set_course_active", {
      p_course: courseId,
      p_active: !course.is_published,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(course.is_published ? "Deactivated" : "Activated");
    refresh();
  };

  const doDelete = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("admin_delete_course", { p_course: courseId });
    setBusy(false);
    setConfirmDelete(false);
    if (error) return toast.error(error.message);
    toast.success("Draft deleted");
    onChanged();
    onClose();
  };

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {course?.title ?? "Course"}
            {course && statusBadge(course.status)}
            {course && <Badge variant="outline">v{course.version}</Badge>}
          </SheetTitle>
          <SheetDescription>{course?.description ?? ""}</SheetDescription>
        </SheetHeader>

        {course && (
          <div className="flex flex-wrap gap-2 mt-4">
            <Button size="sm" variant="outline" onClick={() => setPreviewOpen(true)}>
              <Eye className="h-4 w-4 mr-1" /> Preview
            </Button>
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={doDuplicate} disabled={busy}>
                <Copy className="h-4 w-4 mr-1" /> Duplicate
              </Button>
            )}
            {canEdit && (
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} disabled={busy}>
                <Pencil className="h-4 w-4 mr-1" /> Edit
              </Button>
            )}
            {isAdmin && status === "draft" && (
              <Button size="sm" onClick={() => setPublishOpen(true)} disabled={busy}>
                <Rocket className="h-4 w-4 mr-1" /> Publish
              </Button>
            )}
            {isAdmin && status === "published" && (
              <Button size="sm" variant="outline" onClick={doToggleActive} disabled={busy}>
                <Power className="h-4 w-4 mr-1" /> {course.is_published ? "Deactivate" : "Activate"}
              </Button>
            )}
            {isPublished && pendingCount > 0 && (
              <Button size="sm" onClick={republishAll} disabled={republishingAll}>
                <Rocket className="h-4 w-4 mr-1" /> {republishingAll ? "Republishing…" : `Republish all (${pendingCount})`}
              </Button>
            )}
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={() => setConfirmArchive(true)} disabled={busy}>
                <Archive className="h-4 w-4 mr-1" /> Archive
              </Button>
            )}
            {isAdmin && status === "draft" && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
              >
                <Trash2 className="h-4 w-4 mr-1" /> Delete draft
              </Button>
            )}
          </div>
        )}

        {isPublished && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            You're editing a <strong>live course</strong>. Changes to existing content are visible to enrolled candidates immediately.
            Click <strong>Republish</strong> on each edited item to confirm and snapshot it.
          </div>
        )}

        {impact.data && (
          <div className="mt-4 rounded-xl border bg-muted/30 p-3 text-sm">
            <div className="font-medium">Candidate impact</div>
            <div className="text-muted-foreground mt-1">
              {impact.data.active_on_this ?? 0} active on this version · {impact.data.enrolled ?? 0} total enrolled
            </div>
            {impact.data.note && <div className="text-xs text-muted-foreground mt-1">{impact.data.note}</div>}
          </div>
        )}

        <div className="mt-6 space-y-4">
          {tree.isLoading && <Skeleton className="h-40 w-full" />}
          {tree.data && (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Modules
                  </div>
                  {canEdit && (
                    <AddModuleButton courseId={courseId} onDone={refresh} />
                  )}
                </div>
                <DndList
                  items={tree.data.modules}
                  disabled={!canEdit}
                  onReorder={async (ordered) => {
                    const { error } = await supabase.rpc("admin_reorder_modules", { p_course: courseId, p_ordered: ordered });
                    if (error) return toast.error(error.message);
                    refresh();
                  }}
                >
                  <div className="space-y-2">
                    {tree.data.modules.map((m, idx) => (
                      <ModuleRow
                        key={m.id}
                        m={m}
                        editable={canEdit}
                        isPublished={isPublished}
                        pendingModuleIds={pendingModuleIds}
                        pendingLessonIds={pendingLessonIds}
                        pendingAssessmentIds={pendingAssessmentIds}
                        courseId={courseId}
                        allModuleIds={tree.data!.modules.map((x) => x.id)}
                        index={idx}
                        onChanged={refresh}
                      />
                    ))}
                    {tree.data.modules.length === 0 && (
                      <div className="text-sm text-muted-foreground">No modules yet.</div>
                    )}
                  </div>
                </DndList>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Roleplays
                  </div>
                  {canEdit && !isPublished && (
                    <AddRoleplayButton courseId={courseId} onDone={refresh} />
                  )}
                </div>
                <div className="space-y-2">
                  {tree.data.roleplays.map((r) => (
                    <RoleplayRow
                      key={r.id}
                      r={r}
                      editable={canEdit}
                      isPublished={isPublished}
                      isPending={pendingRoleplayIds.has(r.id)}
                      onChanged={refresh}
                    />
                  ))}
                  {tree.data.roleplays.length === 0 && (
                    <div className="text-sm text-muted-foreground">No roleplays.</div>
                  )}
                </div>
              </div>
              <CompletionConfigCard
                courseId={courseId}
                modules={tree.data.modules.map((m) => ({ id: m.id, title: m.title }))}
                editable={canEdit}
                onChanged={refresh}
              />
            </>
          )}
        </div>


        {editOpen && course && (
          <EditCourseDialog
            course={course}
            onClose={() => setEditOpen(false)}
            onSaved={() => {
              setEditOpen(false);
              refresh();
            }}
          />
        )}

        {publishOpen && (
          <PublishDialog
            courseId={courseId}
            onClose={() => setPublishOpen(false)}
            onPublished={() => {
              setPublishOpen(false);
              refresh();
            }}
          />
        )}

        <ConfirmDialog
          open={confirmArchive}
          title="Archive course?"
          description="Archived courses are hidden from new enrollments."
          onCancel={() => setConfirmArchive(false)}
          onConfirm={doArchive}
        />
        <ConfirmDialog
          open={confirmDelete}
          title="Delete draft?"
          description="This permanently deletes the draft version."
          destructive
          onCancel={() => setConfirmDelete(false)}
          onConfirm={doDelete}
        />
        {previewOpen && <PreviewCourseSheet courseId={courseId} onClose={() => setPreviewOpen(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function ModuleRow({
  m,
  editable,
  isPublished,
  pendingModuleIds,
  pendingLessonIds,
  pendingAssessmentIds,
  courseId,
  allModuleIds,
  index,
  onChanged,
}: {
  m: CourseTree["modules"][number];
  editable: boolean;
  isPublished: boolean;
  pendingModuleIds: Set<string>;
  pendingLessonIds: Set<string>;
  pendingAssessmentIds: Set<string>;
  courseId: string;
  allModuleIds: string[];
  index: number;
  onChanged: () => void;
}) {
  const isPendingSelf = pendingModuleIds.has(m.id);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [addLessonOpen, setAddLessonOpen] = useState(false);
  const [addFromTplOpen, setAddFromTplOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);

  const move = async (dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= allModuleIds.length) return;
    const arr = [...allModuleIds];
    [arr[index], arr[next]] = [arr[next], arr[index]];
    setBusy(true);
    const { error } = await supabase.rpc("admin_reorder_modules", { p_course: courseId, p_ordered: arr });
    setBusy(false);
    if (error) return toast.error(error.message);
    onChanged();
  };

  const doDuplicate = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("admin_duplicate_module", { p_module: m.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Module duplicated");
    onChanged();
  };

  const doArchive = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("admin_archive_module", { p_module: m.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Module archived");
    onChanged();
  };

  const doDelete = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("admin_delete_module", { p_module: m.id });
    setBusy(false);
    setConfirmDel(false);
    if (error) return toast.error(error.message);
    toast.success("Module deleted");
    onChanged();
  };

  const sortable = useSortableRow(m.id);
  return (
    <div ref={sortable.setNodeRef} style={sortable.style} className="rounded-lg border bg-background">
      <div className="flex items-center justify-between p-2 hover:bg-muted/50">
        <div className="flex items-center gap-1 flex-1 min-w-0">
          {editable && <DragHandle attributes={sortable.attributes} listeners={sortable.listeners} />}
          <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 flex-1 text-left min-w-0">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="text-sm font-medium truncate">{m.title}</span>
            <Badge variant={m.is_published ? "default" : "outline"} className="text-[10px]">
              {m.is_published ? "Published" : "Draft"}
            </Badge>
          </button>
        </div>
        <div className="flex items-center gap-2">
          {isPublished && (
            <RepublishControl
              kind="module"
              id={m.id}
              courseId={courseId}
              isPending={isPendingSelf}
              isPublishedItem={m.is_published}
              size="xs"
            />
          )}
          <div className="text-xs text-muted-foreground whitespace-nowrap">
            {m.lessons.length} lessons · {m.assessments.length} exams
          </div>
          {editable && (
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy} onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy} onClick={doDuplicate}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy} onClick={doArchive} title="Archive">
                <Archive className="h-3.5 w-3.5" />
              </Button>
              {!isPublished && (
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" disabled={busy} onClick={() => setConfirmDel(true)} title="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
      {open && (
        <div className="border-t p-2 space-y-1 bg-muted/20">
          <DndList
            items={m.lessons}
            disabled={!editable}
            onReorder={async (ordered) => {
              const { error } = await supabase.rpc("admin_reorder_lessons", { p_module: m.id, p_ordered: ordered });
              if (error) { toast.error(error.message); return; }
              onChanged();
            }}
          >
            {m.lessons.map((l, li) => (
              <LessonRow
                key={l.id}
                l={l}
                editable={editable}
                isPublished={isPublished}
                isPending={pendingLessonIds.has(l.id)}
                courseId={courseId}
                moduleId={m.id}
                allLessonIds={m.lessons.map((x) => x.id)}
                index={li}
                onChanged={onChanged}
              />
            ))}
          </DndList>
          {m.assessments.map((a) => (
            <AssessmentRow
              key={a.id}
              a={a}
              editable={editable}
              isPublished={isPublished}
              isPending={pendingAssessmentIds.has(a.id)}
              courseId={courseId}
              onChanged={onChanged}
            />
          ))}
          {editable && (
            <div className="pt-1 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setAddLessonOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Lesson
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAddFromTplOpen(true)}>
                <LayoutTemplate className="h-3.5 w-3.5 mr-1" /> Add from Template
              </Button>
              {!isPublished && <AddExamButton moduleId={m.id} onDone={onChanged} />}
            </div>
          )}
        </div>
      )}
      {editOpen && (
        <EditModuleDialog m={m} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); onChanged(); }} />
      )}
      {addLessonOpen && (
        <AddLessonDialog moduleId={m.id} onClose={() => setAddLessonOpen(false)} onSaved={() => { setAddLessonOpen(false); onChanged(); }} />
      )}
      {addFromTplOpen && (
        <AddFromTemplateDialog moduleId={m.id} onClose={() => setAddFromTplOpen(false)} onSaved={() => { setAddFromTplOpen(false); onChanged(); }} />
      )}
      <ConfirmDialog
        open={confirmDel}
        title="Delete module?"
        description="This permanently deletes the module and its contents."
        destructive
        onCancel={() => setConfirmDel(false)}
        onConfirm={doDelete}
      />
    </div>
  );
}

function LessonRow({
  l,
  editable,
  isPublished,
  isPending,
  courseId,
  moduleId,
  allLessonIds,
  index,
  onChanged,
}: {
  l: CourseTree["modules"][number]["lessons"][number];
  editable: boolean;
  isPublished: boolean;
  isPending: boolean;
  courseId: string;
  moduleId: string;
  allLessonIds: string[];
  index: number;
  onChanged: () => void;
}) {
  void moduleId; void allLessonIds; void index;
  const [editOpen, setEditOpen] = useState(false);
  const [blocksOpen, setBlocksOpen] = useState(false);
  const [saveTplOpen, setSaveTplOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const picker = useMediaPicker();

  const doDuplicate = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("admin_duplicate_lesson", { p_lesson: l.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Lesson duplicated");
    onChanged();
  };

  const doArchive = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("admin_archive_lesson", { p_lesson: l.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Lesson archived");
    onChanged();
  };

  const doDelete = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("admin_delete_lesson", { p_lesson: l.id });
    setBusy(false);
    setConfirmDel(false);
    if (error) return toast.error(error.message);
    toast.success("Lesson deleted");
    onChanged();
  };

  const sortable = useSortableRow(l.id);
  return (
    <div ref={sortable.setNodeRef} style={sortable.style} className="flex items-center justify-between text-sm px-1 py-1 gap-2 bg-background rounded">
      {editable && <DragHandle attributes={sortable.attributes} listeners={sortable.listeners} size={12} />}
      <span className="flex-1 truncate">· {l.title}</span>
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {l.estimated_minutes ?? 0}m · {l.blocks_count ?? 0} blocks
      </span>
      {isPublished && (
        <RepublishControl
          kind="lesson"
          id={l.id}
          courseId={courseId}
          isPending={isPending}
          isPublishedItem={l.is_published}
          size="xs"
        />
      )}
      {editable && (
        <div className="flex items-center gap-0.5">
          <Button size="icon" variant="ghost" className="h-6 w-6" title="Edit content" onClick={() => setBlocksOpen(true)}>
            <FileText className="h-3 w-3" />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" title="Save as template" disabled={busy} onClick={() => setSaveTplOpen(true)}>
            <BookmarkPlus className="h-3 w-3" />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" disabled={busy} onClick={() => setEditOpen(true)}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" disabled={busy} onClick={doDuplicate}>
            <Copy className="h-3 w-3" />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" disabled={busy} onClick={doArchive} title="Archive">
            <Archive className="h-3 w-3" />
          </Button>
          {!isPublished && (
            <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" disabled={busy} onClick={() => setConfirmDel(true)} title="Delete">
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
      {editOpen && (
        <EditLessonDialog l={l} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); onChanged(); }} />
      )}
      {blocksOpen && (
        <>
          <BlockEditorDialog
            lessonId={l.id}
            lessonTitle={l.title}
            onClose={() => setBlocksOpen(false)}
            onSaved={() => { setBlocksOpen(false); onChanged(); }}
            onPickFromLibrary={picker.pick}
          />
          {picker.element}
        </>
      )}
      {saveTplOpen && (
        <SaveAsTemplateDialog lesson={l} onClose={() => setSaveTplOpen(false)} />
      )}
      <ConfirmDialog
        open={confirmDel}
        title="Delete lesson?"
        description="This permanently deletes the lesson and its blocks."
        destructive
        onCancel={() => setConfirmDel(false)}
        onConfirm={doDelete}
      />
    </div>
  );
}

function AddModuleButton({ courseId, onDone }: { courseId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Add Module
      </Button>
      {open && (
        <ModuleFormDialog
          title="New module"
          onClose={() => setOpen(false)}
          onSubmit={async ({ title, description, minutes }) => {
            const { error } = await supabase.rpc("admin_create_module", {
              p_course: courseId,
              p_title: title,
              p_description: description,
              p_minutes: minutes,
            });
            if (error) throw error;
          }}
          onSaved={() => { setOpen(false); onDone(); }}
        />
      )}
    </>
  );
}

function EditModuleDialog({
  m,
  onClose,
  onSaved,
}: {
  m: CourseTree["modules"][number];
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <ModuleFormDialog
      title="Edit module"
      initial={{ title: m.title, description: m.description ?? "", minutes: m.estimated_duration_minutes ?? null }}
      onClose={onClose}
      onSubmit={async ({ title, description, minutes }) => {
        const { error } = await supabase.rpc("admin_update_module", {
          p_module: m.id,
          p_title: title,
          p_description: description,
          p_minutes: minutes,
        });
        if (error) throw error;
      }}
      onSaved={onSaved}
    />
  );
}

function ModuleFormDialog({
  title,
  initial,
  onClose,
  onSubmit,
  onSaved,
}: {
  title: string;
  initial?: { title: string; description: string; minutes: number | null };
  onClose: () => void;
  onSubmit: (v: { title: string; description: string | null; minutes: number | null }) => Promise<void>;
  onSaved: () => void;
}) {
  const [t, setT] = useState(initial?.title ?? "");
  const [d, setD] = useState(initial?.description ?? "");
  const [mins, setMins] = useState<string>(initial?.minutes?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!t.trim()) return toast.error("Title is required");
    setBusy(true);
    try {
      await onSubmit({ title: t.trim(), description: d || null, minutes: mins ? Number(mins) : null });
      toast.success("Saved");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Title</Label><Input value={t} onChange={(e) => setT(e.target.value)} /></div>
          <div className="space-y-1"><Label>Description</Label><Textarea value={d} onChange={(e) => setD(e.target.value)} /></div>
          <div className="space-y-1"><Label>Duration (min)</Label><Input type="number" value={mins} onChange={(e) => setMins(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddLessonDialog({ moduleId, onClose, onSaved }: { moduleId: string; onClose: () => void; onSaved: () => void }) {
  return (
    <LessonFormDialog
      title="New lesson"
      onClose={onClose}
      onSubmit={async ({ title, description, minutes }) => {
        const { error } = await supabase.rpc("admin_create_lesson", {
          p_module: moduleId,
          p_title: title,
          p_description: description,
          p_minutes: minutes,
        });
        if (error) throw error;
      }}
      onSaved={onSaved}
    />
  );
}

function SaveAsTemplateDialog({
  lesson,
  onClose,
}: {
  lesson: CourseTree["modules"][number]["lessons"][number];
  onClose: () => void;
}) {
  const [title, setTitle] = useState(lesson.title);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim()) return toast.error("Title required");
    setBusy(true);
    const { error } = await supabase.rpc("admin_save_lesson_as_template", {
      p_lesson: lesson.id,
      p_title: title.trim(),
      p_description: description.trim() || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Saved as template");
    onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save lesson as template</DialogTitle>
          <DialogDescription>Reusable blocks for new lessons.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>Save Template</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddFromTemplateDialog({
  moduleId,
  onClose,
  onSaved,
}: {
  moduleId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["lesson-templates", search],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_lesson_templates", { p_search: search || null });
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

  const pick = async (tplId: string, tplTitle: string) => {
    setBusyId(tplId);
    const { error } = await supabase.rpc("admin_create_lesson_from_template", {
      p_module: moduleId,
      p_template: tplId,
      p_title: tplTitle,
    });
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success("Lesson created from template");
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add lesson from template</DialogTitle>
          <DialogDescription>Choose a saved template to insert as a new lesson.</DialogDescription>
        </DialogHeader>
        <Input placeholder="Search templates…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="max-h-[50vh] overflow-y-auto space-y-2">
          {q.isLoading && <Skeleton className="h-16 w-full" />}
          {q.data && q.data.length === 0 && (
            <div className="text-sm text-muted-foreground py-6 text-center">No templates yet.</div>
          )}
          {q.data?.map((t) => (
            <div key={t.id} className="flex items-start gap-2 rounded-lg border p-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{t.title}</div>
                {t.description && (
                  <div className="text-xs text-muted-foreground line-clamp-2">{t.description}</div>
                )}
                <div className="text-[11px] text-muted-foreground mt-1">
                  {(Array.isArray(t.blocks) ? t.blocks.length : 0)} blocks · {t.estimated_minutes ?? 0}m
                </div>
              </div>
              <Button size="sm" disabled={busyId === t.id} onClick={() => pick(t.id, t.title)}>
                Use
              </Button>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditLessonDialog({
  l,
  onClose,
  onSaved,
}: {
  l: CourseTree["modules"][number]["lessons"][number];
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <LessonFormDialog
      title="Edit lesson"
      initial={{ title: l.title, description: "", minutes: l.estimated_minutes ?? null }}
      onClose={onClose}
      onSubmit={async ({ title, description, minutes }) => {
        const { error } = await supabase.rpc("admin_update_lesson", {
          p_lesson: l.id,
          p_title: title,
          p_description: description,
          p_minutes: minutes,
        });
        if (error) throw error;
      }}
      onSaved={onSaved}
    />
  );
}

function LessonFormDialog({
  title,
  initial,
  onClose,
  onSubmit,
  onSaved,
}: {
  title: string;
  initial?: { title: string; description: string; minutes: number | null };
  onClose: () => void;
  onSubmit: (v: { title: string; description: string | null; minutes: number | null }) => Promise<void>;
  onSaved: () => void;
}) {
  const [t, setT] = useState(initial?.title ?? "");
  const [d, setD] = useState(initial?.description ?? "");
  const [mins, setMins] = useState<string>(initial?.minutes?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!t.trim()) return toast.error("Title is required");
    setBusy(true);
    try {
      await onSubmit({ title: t.trim(), description: d || null, minutes: mins ? Number(mins) : null });
      toast.success("Saved");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Title</Label><Input value={t} onChange={(e) => setT(e.target.value)} /></div>
          <div className="space-y-1"><Label>Description</Label><Textarea value={d} onChange={(e) => setD(e.target.value)} /></div>
          <div className="space-y-1"><Label>Duration (min)</Label><Input type="number" value={mins} onChange={(e) => setMins(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function EditCourseDialog({
  course,
  onClose,
  onSaved,
}: {
  course: CourseTree["course"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description ?? "");
  const [category, setCategory] = useState(course.category ?? "");
  const [level, setLevel] = useState(course.level ?? "beginner");
  const [duration, setDuration] = useState<string>(course.duration_minutes?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    const { error } = await supabase.rpc("admin_update_course", {
      p_course: course.id,
      p_title: title,
      p_description: description || null,
      p_category: category || null,
      p_level: level,
      p_duration_minutes: duration ? Number(duration) : null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Course updated");
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit course</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Category</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Level</Label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">Beginner</SelectItem>
                  <SelectItem value="intermediate">Intermediate</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Duration (min)</Label>
              <Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PublishDialog({
  courseId,
  onClose,
  onPublished,
}: {
  courseId: string;
  onClose: () => void;
  onPublished: () => void;
}) {
  const preview = useQuery({
    queryKey: ["admin-publish-preview", courseId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_publish_preview", { p_course: courseId });
      if (error) throw error;
      return data as PublishPreview;
    },
  });
  const [busy, setBusy] = useState(false);

  const publish = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("admin_publish_course", { p_course: courseId });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Course published");
    onPublished();
  };

  const p = preview.data;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {p ? `${p.title} — Changes` : "Publish preview"}
          </DialogTitle>
        </DialogHeader>
        {preview.isLoading && <Skeleton className="h-24 w-full" />}
        {p && (
          <div className="space-y-3 text-sm">
            {p.first_version && <div className="text-emerald-700">New course: {p.title}</div>}
            {p.summary && p.summary.length > 0 && (
              <ul className="space-y-1">
                {p.summary.map((s, i) => (
                  <li key={i}>✓ {s}</li>
                ))}
              </ul>
            )}
            <div className="rounded-md bg-muted p-2 text-muted-foreground">
              Affects: {p.enrolled_on_live ?? 0} active candidates on the live version — future candidates only.
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={publish} disabled={busy || preview.isLoading}>
            {busy ? "Publishing…" : "Publish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmDialog({
  open,
  title,
  description,
  onCancel,
  onConfirm,
  destructive,
}: {
  open: boolean;
  title: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
  destructive?: boolean;
}) {
  if (!open) return null;
  return (
    <Dialog open onOpenChange={(v) => !v && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={destructive ? "destructive" : "default"} onClick={onConfirm}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ Assessments / Questions ============

function AddExamButton({ moduleId, onDone }: { moduleId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Add Exam
      </Button>
      {open && (
        <AssessmentFormDialog
          title="New exam"
          onClose={() => setOpen(false)}
          onSubmit={async ({ title, passing_score }) => {
            const { error } = await supabase.rpc("admin_create_assessment", {
              p_module: moduleId,
              p_title: title,
              p_passing_score: passing_score,
            });
            if (error) throw error;
          }}
          onSaved={() => { setOpen(false); onDone(); }}
        />
      )}
    </>
  );
}

function AssessmentRow({
  a,
  editable,
  isPublished,
  isPending,
  courseId,
  onChanged,
}: {
  a: CourseTree["modules"][number]["assessments"][number];
  editable: boolean;
  isPublished: boolean;
  isPending: boolean;
  courseId: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [addQ, setAddQ] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);

  const doDuplicate = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("admin_duplicate_assessment", { p_assessment: a.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Exam duplicated");
    onChanged();
  };
  const doDelete = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("admin_delete_assessment", { p_assessment: a.id });
    setBusy(false);
    setConfirmDel(false);
    if (error) return toast.error(error.message);
    toast.success("Exam deleted");
    onChanged();
  };

  // On published courses, this assessment is "published-item" if the tree says so.
  // Tree doesn't expose per-assessment is_published; treat isPublished course + no pending as published.
  const isPublishedItem = isPublished && !isPending;

  return (
    <div className="rounded-md border bg-card">
      <div className="flex items-center justify-between px-2 py-1">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 flex-1 text-left text-sm">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <span>📝 {a.title}</span>
          <Badge variant="outline" className="text-[10px]">{a.kind}</Badge>
        </button>
        {isPublished && (
          <RepublishControl
            kind="assessment"
            id={a.id}
            courseId={courseId}
            isPending={isPending}
            isPublishedItem={isPublishedItem}
            size="xs"
          />
        )}
        <span className="text-xs text-muted-foreground mx-2">
          {a.questions.length} q · pass {a.passing_score ?? "—"}
        </span>
        {editable && (
          <div className="flex items-center gap-0.5">
            <Button size="icon" variant="ghost" className="h-6 w-6" disabled={busy} onClick={() => setEditOpen(true)}>
              <Pencil className="h-3 w-3" />
            </Button>
            {!isPublished && (
              <>
                <Button size="icon" variant="ghost" className="h-6 w-6" disabled={busy} onClick={doDuplicate}>
                  <Copy className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" disabled={busy} onClick={() => setConfirmDel(true)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
        )}
      </div>
      {open && (
        <div className="border-t p-2 space-y-1">
          <DndList
            items={a.questions}
            disabled={!editable || isPublished}
            onReorder={async (ordered) => {
              const { error } = await supabase.rpc("admin_reorder_questions", { p_assessment: a.id, p_ordered: ordered });
              if (error) { toast.error(error.message); return; }
              onChanged();
            }}
          >
            {a.questions.map((q, qi) => (
              <QuestionRow
                key={q.id}
                q={q}
                editable={editable}
                isPublished={isPublished}
                assessmentId={a.id}
                allQuestionIds={a.questions.map((x) => x.id)}
                index={qi}
                onChanged={onChanged}
              />
            ))}
          </DndList>
          {a.questions.length === 0 && (
            <div className="text-xs text-muted-foreground px-1">No questions.</div>
          )}
          {editable && !isPublished && (
            <div className="pt-1">
              <Button size="sm" variant="outline" onClick={() => setAddQ(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Question
              </Button>
            </div>
          )}
        </div>
      )}
      {editOpen && (
        <AssessmentFormDialog
          title="Edit exam"
          isPublished={isPublished}
          initial={{ title: a.title, passing_score: a.passing_score ?? 0 }}
          onClose={() => setEditOpen(false)}
          onSubmit={async ({ title, passing_score }) => {
            const { error } = await supabase.rpc("admin_update_assessment", {
              p_assessment: a.id,
              p_title: title,
              p_passing_score: passing_score,
            });
            if (error) throw error;
          }}
          onSaved={() => { setEditOpen(false); onChanged(); }}
        />
      )}
      {addQ && (
        <QuestionEditorDialog
          assessmentId={a.id}
          isPublished={isPublished}
          onClose={() => setAddQ(false)}
          onSaved={() => { setAddQ(false); onChanged(); }}
        />
      )}
      <ConfirmDialog
        open={confirmDel}
        title="Delete exam?"
        description="This permanently deletes the exam and its questions."
        destructive
        onCancel={() => setConfirmDel(false)}
        onConfirm={doDelete}
      />
    </div>
  );
}


function AssessmentFormDialog({
  title,
  initial,
  isPublished,
  onClose,
  onSubmit,
  onSaved,
}: {
  title: string;
  initial?: { title: string; passing_score: number };
  isPublished?: boolean;
  onClose: () => void;
  onSubmit: (v: { title: string; passing_score: number }) => Promise<void>;
  onSaved: () => void;
}) {
  const [t, setT] = useState(initial?.title ?? "");
  const [pass, setPass] = useState<string>(String(initial?.passing_score ?? 70));
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!t.trim()) return toast.error("Title required");
    setBusy(true);
    try {
      await onSubmit({ title: t.trim(), passing_score: Number(pass) || 0 });
      toast.success("Saved");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Title</Label><Input value={t} onChange={(e) => setT(e.target.value)} /></div>
          <div className="space-y-1">
            <Label>Passing score{isPublished ? " (locked on published)" : ""}</Label>
            <Input type="number" value={pass} disabled={isPublished} onChange={(e) => setPass(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function QuestionRow({
  q,
  editable,
  isPublished,
  assessmentId,
  allQuestionIds,
  index,
  onChanged,
}: {
  q: CourseTree["modules"][number]["assessments"][number]["questions"][number];
  editable: boolean;
  isPublished: boolean;
  assessmentId: string;
  allQuestionIds: string[];
  index: number;
  onChanged: () => void;
}) {
  void allQuestionIds;
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);

  const doDuplicate = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("admin_duplicate_question", { p_question: q.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Question duplicated");
    onChanged();
  };
  const doDelete = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("admin_delete_question", { p_question: q.id });
    setBusy(false);
    setConfirmDel(false);
    if (error) return toast.error(error.message);
    toast.success("Question deleted");
    onChanged();
  };

  const sortable = useSortableRow(q.id);
  return (
    <div ref={sortable.setNodeRef} style={sortable.style} className="flex items-center gap-2 text-xs px-1 py-1 border-t first:border-t-0 bg-background">
      {editable && !isPublished && <DragHandle attributes={sortable.attributes} listeners={sortable.listeners} size={12} />}
      <span className="flex-1 truncate">{index + 1}. {q.prompt ?? q.question}</span>
      <Badge variant="outline" className="text-[10px]">{q.question_type}</Badge>
      {editable && (
        <div className="flex items-center gap-0.5">
          <Button size="icon" variant="ghost" className="h-6 w-6" disabled={busy} onClick={() => setEditOpen(true)}>
            <Pencil className="h-3 w-3" />
          </Button>
          {!isPublished && (
            <>
              <Button size="icon" variant="ghost" className="h-6 w-6" disabled={busy} onClick={doDuplicate}>
                <Copy className="h-3 w-3" />
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" disabled={busy} onClick={() => setConfirmDel(true)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      )}
      {editOpen && (
        <QuestionEditorDialog
          assessmentId={assessmentId}
          question={q}
          isPublished={isPublished}
          onClose={() => setEditOpen(false)}
          onSaved={() => { setEditOpen(false); onChanged(); }}
        />
      )}
      <ConfirmDialog
        open={confirmDel}
        title="Delete question?"
        description="This permanently deletes the question."
        destructive
        onCancel={() => setConfirmDel(false)}
        onConfirm={doDelete}
      />
    </div>
  );
}


const CHOICE_TYPES = new Set(["multiple_choice", "multiple_select", "true_false"]);

function QuestionEditorDialog({
  assessmentId,
  question,
  isPublished,
  onClose,
  onSaved,
}: {
  assessmentId: string;
  question?: CourseTree["modules"][number]["assessments"][number]["questions"][number];
  isPublished?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !question;
  const [prompt, setPrompt] = useState(question?.prompt ?? question?.question ?? "");
  const [qtype, setQtype] = useState(question?.question_type ?? "multiple_choice");
  const [explanation, setExplanation] = useState(question?.explanation ?? "");
  const [modelAnswer, setModelAnswer] = useState(question?.model_answer ?? "");
  const [options, setOptions] = useState<Array<{ text: string; is_correct: boolean }>>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      const { data, error } = await supabase
        .from("assessment_options")
        .select("*")
        .eq("question_id", question!.id)
        .order("display_order");
      if (error) toast.error(error.message);
      else setOptions((data ?? []).map((r: { option_text?: string; text?: string; is_correct: boolean }) => ({ text: r.option_text ?? r.text ?? "", is_correct: !!r.is_correct })));
      setLoading(false);
    })();
  }, [isNew, question]);

  const save = async () => {
    if (!prompt.trim()) return toast.error("Prompt required");
    setSaving(true);
    let qid = question?.id;
    if (isNew) {
      const { data, error } = await supabase.rpc("admin_create_question", {
        p_assessment: assessmentId,
        p_prompt: prompt.trim(),
        p_question_type: qtype,
        p_explanation: explanation || null,
        p_model_answer: modelAnswer.trim() || null,
      });
      if (error) {
        setSaving(false);
        return toast.error(error.message);
      }
      qid = typeof data === "string" ? data : (data as { id?: string } | null)?.id;
    } else {
      const { error } = await supabase.rpc("admin_update_question", {
        p_question: question!.id,
        p_prompt: prompt.trim(),
        p_question_type: qtype,
        p_explanation: explanation || null,
        p_model_answer: modelAnswer.trim() || null,
      });
      if (error) {
        setSaving(false);
        return toast.error(error.message);
      }
    }
    if (qid && CHOICE_TYPES.has(qtype)) {
      const { error } = await supabase.rpc("admin_set_question_options", {
        p_question: qid,
        p_options: options.map((o) => ({ text: o.text, is_correct: o.is_correct })),
      });
      if (error) {
        setSaving(false);
        return toast.error(error.message);
      }
    }
    setSaving(false);
    toast.success("Question saved");
    onSaved();
  };

  const setOpt = (i: number, patch: Partial<{ text: string; is_correct: boolean }>) =>
    setOptions((os) => os.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{isNew ? "New question" : "Edit question"}</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          <div className="space-y-1"><Label>Prompt</Label><Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} /></div>
          <div className="space-y-1">
            <Label>Type{isPublished ? " (locked on published)" : ""}</Label>
            <Select value={qtype} onValueChange={setQtype} disabled={isPublished}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="multiple_choice">Multiple choice</SelectItem>
                <SelectItem value="multiple_select">Multiple select</SelectItem>
                <SelectItem value="true_false">True / False</SelectItem>
                <SelectItem value="scenario">Scenario</SelectItem>
                <SelectItem value="short_answer">Short answer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Explanation</Label><Textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} /></div>
          {(qtype === "short_answer" || qtype === "scenario") && (
            <div className="space-y-1">
              <Label>Model answer / grading rubric</Label>
              <Textarea
                value={modelAnswer}
                onChange={(e) => setModelAnswer(e.target.value)}
                placeholder="Used to AI-grade typed answers. Describe the ideal answer or key points."
              />
              <p className="text-xs text-muted-foreground">
                Used to AI-grade typed answers. Describe the ideal answer or key points.
              </p>
            </div>
          )}
          {isPublished && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
              Scoring locked on a published course — wording only. Duplicate the course to change answers, points, type, or structure.
            </div>
          )}
          {CHOICE_TYPES.has(qtype) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Options</Label>
                {!isPublished && (
                  <Button size="sm" variant="outline" onClick={() => setOptions((os) => [...os, { text: "", is_correct: false }])}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add option
                  </Button>
                )}
              </div>
              {loading && <Skeleton className="h-16 w-full" />}
              {!loading && options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant={o.is_correct ? "default" : "outline"}
                    className="h-8 w-8"
                    disabled={isPublished}
                    onClick={() => setOpt(i, { is_correct: !o.is_correct })}
                    title={o.is_correct ? "Correct" : "Mark correct"}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Input value={o.text} onChange={(e) => setOpt(i, { text: e.target.value })} placeholder="Option text" />
                  {!isPublished && (
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setOptions((os) => os.filter((_, idx) => idx !== i))}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              {!loading && options.length === 0 && (
                <div className="text-xs text-muted-foreground">No options yet.</div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || loading}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ Roleplays ============

type RoleplayFormValues = {
  title: string;
  description: string;
  candidate_objective: string;
  expected_behaviors: string;
  common_mistakes: string;
  grading_criteria: string;
  passing_score: number;
  min_category_score: number;
  is_required: boolean;
};

function AddRoleplayButton({ courseId, onDone }: { courseId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Add Roleplay
      </Button>
      {open && (
        <RoleplayFormDialog
          title="New roleplay"
          onClose={() => setOpen(false)}
          onSubmit={async (v) => {
            const { error } = await supabase.rpc("admin_create_roleplay", {
              p_course: courseId,
              p_title: v.title,
              p_description: v.description || null,
              p_candidate_objective: v.candidate_objective || null,
              p_expected_behaviors: v.expected_behaviors || null,
              p_common_mistakes: v.common_mistakes || null,
              p_grading_criteria: v.grading_criteria || null,
              p_passing_score: v.passing_score,
              p_min_category_score: v.min_category_score,
              p_is_required: v.is_required,
            });
            if (error) throw error;
          }}
          onSaved={() => { setOpen(false); onDone(); }}
        />
      )}
    </>
  );
}

function RoleplayRow({
  r,
  editable,
  isPublished,
  isPending,
  onChanged,
}: {
  r: CourseTree["roleplays"][number];
  editable: boolean;
  isPublished: boolean;
  isPending: boolean;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);

  const doDuplicate = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("admin_duplicate_roleplay", { p_roleplay: r.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Roleplay duplicated");
    onChanged();
  };
  const doArchive = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("admin_archive_roleplay", { p_roleplay: r.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Roleplay archived");
    onChanged();
  };
  const doDelete = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("admin_delete_roleplay", { p_roleplay: r.id });
    setBusy(false);
    setConfirmDel(false);
    if (error) return toast.error(error.message);
    toast.success("Roleplay deleted");
    onChanged();
  };

  const gradingStr = typeof r.grading_criteria === "string"
    ? r.grading_criteria
    : r.grading_criteria != null
      ? JSON.stringify(r.grading_criteria, null, 2)
      : "";

  const doRepublish = async () => {
    setBusy(true);
    try {
      await republishItem("roleplay", r.id);
      toast.success("Republished");
      qc.invalidateQueries({ queryKey: ["course-pending"] });
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between rounded-lg border p-2">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{r.title}</div>
        <div className="text-xs text-muted-foreground">
          Pass {r.passing_score ?? "—"}{r.is_required ? " · required" : ""}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={r.is_published ? "default" : "outline"}>
          {r.is_published ? "Published" : "Draft"}
        </Badge>
        {isPublished && isPending && (
          <>
            <Badge variant="outline" className={r.is_published ? "bg-amber-100 text-amber-800 border-amber-200 text-[10px]" : "bg-slate-100 text-slate-700 border-slate-200 text-[10px]"}>
              {r.is_published ? "Modified — needs republish" : "Draft — republish to go live"}
            </Badge>
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={doRepublish} disabled={busy}>
              <Rocket className="h-3 w-3 mr-1" /> Republish
            </Button>
          </>
        )}
        {editable && (
          <div className="flex items-center gap-0.5">
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy} onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {!isPublished && (
              <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy} onClick={doDuplicate}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy} onClick={doArchive} title="Archive">
              <Archive className="h-3.5 w-3.5" />
            </Button>
            {!isPublished && (
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" disabled={busy} onClick={() => setConfirmDel(true)} title="Delete">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>
      {editOpen && (
        <RoleplayFormDialog
          title="Edit roleplay"
          isPublished={isPublished}
          initial={{
            title: r.title,
            description: r.description ?? "",
            candidate_objective: r.candidate_objective ?? "",
            expected_behaviors: r.expected_behaviors ?? "",
            common_mistakes: r.common_mistakes ?? "",
            grading_criteria: gradingStr,
            passing_score: r.passing_score ?? 80,
            min_category_score: r.min_category_score ?? 0,
            is_required: r.is_required,
          }}
          onClose={() => setEditOpen(false)}
          onSubmit={async (v) => {
            const { error } = await supabase.rpc("admin_update_roleplay", {
              p_roleplay: r.id,
              p_title: v.title,
              p_description: v.description || null,
              p_candidate_objective: v.candidate_objective || null,
              p_expected_behaviors: v.expected_behaviors || null,
              p_common_mistakes: v.common_mistakes || null,
              p_grading_criteria: v.grading_criteria || null,
              p_passing_score: v.passing_score,
              p_min_category_score: v.min_category_score,
              p_is_required: v.is_required,
            });
            if (error) throw error;
          }}
          onSaved={() => { setEditOpen(false); onChanged(); }}
        />
      )}
      <ConfirmDialog
        open={confirmDel}
        title="Delete roleplay?"
        description="This permanently deletes the roleplay scenario."
        destructive
        onCancel={() => setConfirmDel(false)}
        onConfirm={doDelete}
      />
    </div>
  );
}


function RoleplayFormDialog({
  title,
  initial,
  isPublished,
  onClose,
  onSubmit,
  onSaved,
}: {
  title: string;
  initial?: RoleplayFormValues;
  isPublished?: boolean;
  onClose: () => void;
  onSubmit: (v: RoleplayFormValues) => Promise<void>;
  onSaved: () => void;
}) {
  const [v, setV] = useState<RoleplayFormValues>(initial ?? {
    title: "",
    description: "",
    candidate_objective: "",
    expected_behaviors: "",
    common_mistakes: "",
    grading_criteria: "",
    passing_score: 80,
    min_category_score: 0,
    is_required: false,
  });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<RoleplayFormValues>) => setV((s) => ({ ...s, ...patch }));

  const submit = async () => {
    if (!v.title.trim()) return toast.error("Title required");
    setBusy(true);
    try {
      await onSubmit({ ...v, title: v.title.trim() });
      toast.success("Saved");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(x) => !x && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          <div className="space-y-1"><Label>Title</Label><Input value={v.title} onChange={(e) => set({ title: e.target.value })} /></div>
          <div className="space-y-1"><Label>Description</Label><Textarea value={v.description} onChange={(e) => set({ description: e.target.value })} /></div>
          <div className="space-y-1"><Label>Candidate objective</Label><Textarea value={v.candidate_objective} onChange={(e) => set({ candidate_objective: e.target.value })} /></div>
          <div className="space-y-1"><Label>Expected behaviors</Label><Textarea value={v.expected_behaviors} onChange={(e) => set({ expected_behaviors: e.target.value })} /></div>
          <div className="space-y-1"><Label>Common mistakes</Label><Textarea value={v.common_mistakes} onChange={(e) => set({ common_mistakes: e.target.value })} /></div>
          <div className="space-y-1"><Label>Grading criteria / rubric</Label><Textarea rows={5} value={v.grading_criteria} onChange={(e) => set({ grading_criteria: e.target.value })} /></div>
          {isPublished && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
              Scoring locked on a published course — wording only. Duplicate the course to change scoring thresholds.
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Passing score{isPublished ? " (locked)" : ""}</Label><Input type="number" disabled={isPublished} value={v.passing_score} onChange={(e) => set({ passing_score: Number(e.target.value) || 0 })} /></div>
            <div className="space-y-1"><Label>Min category score{isPublished ? " (locked)" : ""}</Label><Input type="number" disabled={isPublished} value={v.min_category_score} onChange={(e) => set({ min_category_score: Number(e.target.value) || 0 })} /></div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={v.is_required} onCheckedChange={(c) => set({ is_required: c })} />
            <Label>Required</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ Completion & Certificate ============

type CompletionConfig = {
  requires_final?: boolean | null;
  requires_roleplay?: boolean | null;
  final_module_id?: string | null;
  certificate_enabled?: boolean | null;
  certificate_template?: string | null;
  certificate_title?: string | null;
  verification_text?: string | null;
};

function CompletionConfigCard({
  courseId,
  modules,
  editable,
  onChanged,
}: {
  courseId: string;
  modules: Array<{ id: string; title: string }>;
  editable: boolean;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const cfgQ = useQuery({
    queryKey: ["course-completion-config", courseId],
    queryFn: async (): Promise<CompletionConfig> => {
      const { data, error } = await supabase
        .from("course_completion_config")
        .select("*")
        .eq("course_id", courseId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? {
        requires_final: true,
        requires_roleplay: true,
        certificate_enabled: true,
      }) as CompletionConfig;
    },
  });

  const [local, setLocal] = useState<CompletionConfig>({});
  useEffect(() => { if (cfgQ.data) setLocal(cfgQ.data); }, [cfgQ.data]);

  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<CompletionConfig>) => setLocal((s) => ({ ...s, ...patch }));

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.rpc("admin_update_completion_config", {
      p_course: courseId,
      p_requires_final: !!local.requires_final,
      p_requires_roleplay: !!local.requires_roleplay,
      p_certificate_enabled: !!local.certificate_enabled,
      p_certificate_template: local.certificate_template || null,
      p_certificate_title: local.certificate_title || null,
      p_verification_text: local.verification_text || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Completion config saved");
    qc.invalidateQueries({ queryKey: ["course-completion-config", courseId] });
    onChanged();
  };

  const setFinalModule = async (moduleId: string) => {
    const { error } = await supabase.rpc("admin_set_final_assessment", {
      p_course: courseId,
      p_module: moduleId,
    });
    if (error) return toast.error(error.message);
    toast.success("Final module updated");
    set({ final_module_id: moduleId });
    onChanged();
  };

  return (
    <div className="rounded-2xl border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <GraduationCap className="h-4 w-4" />
        <div className="text-sm font-semibold">Completion & Certificate</div>
      </div>
      {cfgQ.isLoading && <Skeleton className="h-24 w-full" />}
      {!cfgQ.isLoading && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between rounded-md border p-2">
              <Label className="text-xs">Requires final assessment</Label>
              <Switch
                checked={!!local.requires_final}
                disabled={!editable}
                onCheckedChange={(c) => set({ requires_final: c })}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-2">
              <Label className="text-xs">Requires roleplay</Label>
              <Switch
                checked={!!local.requires_roleplay}
                disabled={!editable}
                onCheckedChange={(c) => set({ requires_roleplay: c })}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Final module</Label>
            <Select
              value={local.final_module_id ?? ""}
              onValueChange={editable ? setFinalModule : undefined}
              disabled={!editable}
            >
              <SelectTrigger><SelectValue placeholder="Select final module…" /></SelectTrigger>
              <SelectContent>
                {modules.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-md border p-2">
            <Label className="text-xs">Certificate enabled</Label>
            <Switch
              checked={!!local.certificate_enabled}
              disabled={!editable}
              onCheckedChange={(c) => set({ certificate_enabled: c })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Template</Label>
              <Select
                value={local.certificate_template ?? "default"}
                onValueChange={(v) => set({ certificate_template: v })}
                disabled={!editable}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="classic">Classic</SelectItem>
                  <SelectItem value="modern">Modern</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Certificate title</Label>
              <Input
                value={local.certificate_title ?? ""}
                disabled={!editable}
                onChange={(e) => set({ certificate_title: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Verification text</Label>
            <Textarea
              value={local.verification_text ?? ""}
              disabled={!editable}
              onChange={(e) => set({ verification_text: e.target.value })}
            />
          </div>
          {editable && (
            <div className="flex justify-end">
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============ Preview-as-candidate ============

function PreviewCourseSheet({ courseId, onClose }: { courseId: string; onClose: () => void }) {
  const tree = useQuery({ queryKey: ["admin-course-tree", courseId], queryFn: () => fetchCourseTree(courseId) });
  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4" /> Preview — {tree.data?.course.title ?? ""}
          </SheetTitle>
          <SheetDescription>Read-only view as a candidate would see it.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-6">
          {tree.isLoading && <Skeleton className="h-40 w-full" />}
          {tree.data?.course.description && (
            <p className="text-sm text-muted-foreground">{tree.data.course.description}</p>
          )}
          {tree.data?.modules.map((m) => (
            <div key={m.id} className="rounded-xl border p-4 space-y-3">
              <div className="font-semibold">{m.title}</div>
              {m.description && <p className="text-sm text-muted-foreground">{m.description}</p>}
              {m.lessons.map((l) => (
                <PreviewLesson key={l.id} lessonId={l.id} title={l.title} />
              ))}
              {m.assessments.map((a) => (
                <div key={a.id} className="rounded-lg border p-3 bg-muted/20">
                  <div className="text-sm font-medium">📝 {a.title}</div>
                  <div className="text-xs text-muted-foreground mb-2">
                    Pass {a.passing_score ?? "—"} · {a.kind}
                  </div>
                  <PreviewQuestions questions={a.questions} />
                </div>
              ))}
            </div>
          ))}
          {tree.data && tree.data.roleplays.length > 0 && (
            <div className="rounded-xl border p-4 space-y-2">
              <div className="font-semibold">Roleplays</div>
              {tree.data.roleplays.map((r) => (
                <div key={r.id} className="rounded-lg border p-3">
                  <div className="text-sm font-medium">{r.title}</div>
                  {r.candidate_objective && (
                    <div className="text-xs mt-1"><span className="font-medium">Objective:</span> {r.candidate_objective}</div>
                  )}
                  {r.grading_criteria != null && (
                    <pre className="mt-2 text-xs whitespace-pre-wrap bg-muted/50 rounded p-2">
                      {typeof r.grading_criteria === "string" ? r.grading_criteria : JSON.stringify(r.grading_criteria, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PreviewLesson({ lessonId, title }: { lessonId: string; title: string }) {
  const q = useQuery({
    queryKey: ["preview-lesson-blocks", lessonId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lesson_content_blocks")
        .select("*")
        .eq("lesson_id", lessonId)
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as Array<{ block_type: string; content: Record<string, unknown>; status?: string | null }>;
    },
  });
  return (
    <div className="rounded-lg border p-3">
      <div className="text-sm font-medium mb-2">{title}</div>
      {q.isLoading && <Skeleton className="h-16 w-full" />}
      {q.data && q.data.length === 0 && (
        <div className="text-xs text-muted-foreground">No content.</div>
      )}
      <div className="space-y-3">
        {q.data?.map((b, i) => <PreviewBlock key={i} block={b} />)}
      </div>
    </div>
  );
}

function PreviewBlock({ block }: { block: { block_type: string; content: Record<string, unknown>; status?: string | null } }) {
  const c = block.content ?? {};
  const type = block.block_type;
  const status = block.status;
  const path = c.path as string | undefined;
  const bucket = (c.bucket as string | undefined) ?? "lesson-assets";
  const isPending = status === "pending_asset" || (["image", "video", "pdf", "download"].includes(type) && !path);

  if (isPending) {
    return <div className="text-xs italic text-muted-foreground border rounded p-2">[{type}] pending asset</div>;
  }
  switch (type) {
    case "heading": {
      const level = (c.level as number) ?? 2;
      const size = level === 2 ? "text-lg" : level === 3 ? "text-base" : "text-sm";
      return <div className={`${size} font-semibold`}>{(c.text as string) ?? ""}</div>;
    }
    case "text":
      return <p className="text-sm whitespace-pre-wrap">{(c.text as string) ?? ""}</p>;
    case "callout": {
      const variant = (c.variant as string) ?? "info";
      const colors: Record<string, string> = {
        info: "bg-blue-50 border-blue-200",
        warning: "bg-amber-50 border-amber-200",
        danger: "bg-red-50 border-red-200",
        success: "bg-emerald-50 border-emerald-200",
      };
      return (
        <div className={`rounded-md border p-3 ${colors[variant] ?? colors.info}`}>
          {c.title ? <div className="text-sm font-medium">{c.title as string}</div> : null}
          {c.body ? <div className="text-sm whitespace-pre-wrap">{c.body as string}</div> : null}
        </div>
      );
    }
    case "quote":
      return (
        <blockquote className="border-l-4 pl-3 italic text-sm">
          <div>{(c.text as string) ?? ""}</div>
          {c.attribution ? <div className="mt-1 text-xs text-muted-foreground">— {c.attribution as string}</div> : null}
        </blockquote>
      );
    case "checklist": {
      const items = (c.items as string[] | undefined) ?? [];
      return (
        <ul className="text-sm space-y-1">
          {items.map((it, i) => (
            <li key={i} className="flex gap-2"><input type="checkbox" disabled /> {it}</li>
          ))}
        </ul>
      );
    }
    case "table": {
      const headers = (c.headers as string[] | undefined) ?? [];
      const rows = (c.rows as string[][] | undefined) ?? [];
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border">
            <thead className="bg-muted">
              <tr>{headers.map((h, i) => <th key={i} className="border px-2 py-1 text-left">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>{r.map((cell, j) => <td key={j} className="border px-2 py-1">{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "divider":
      return <hr />;
    case "code":
      return (
        <pre className="rounded bg-muted p-3 text-xs overflow-x-auto"><code>{(c.code as string) ?? ""}</code></pre>
      );
    case "embed": {
      const url = (c.url as string) ?? "";
      return url ? (
        <a href={url} target="_blank" rel="noreferrer" className="text-primary underline text-sm">
          {(c.title as string) || url}
        </a>
      ) : null;
    }
    case "image":
    case "video":
    case "pdf":
    case "download":
      return <PreviewMedia type={type} bucket={bucket} path={path!} content={c} />;
    default:
      return <div className="text-xs text-muted-foreground">[{type}]</div>;
  }
}

function PreviewMedia({
  type,
  bucket,
  path,
  content,
}: {
  type: string;
  bucket: string;
  path: string;
  content: Record<string, unknown>;
}) {
  const q = useQuery({
    queryKey: ["preview-signed-url", bucket, path],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
    enabled: !!path,
  });
  if (q.isLoading) return <Skeleton className="h-24 w-full" />;
  if (!q.data) return <div className="text-xs text-muted-foreground">Unable to load asset.</div>;
  const caption = (content.caption as string | undefined) ?? "";
  const alt = (content.alt as string | undefined) ?? "";
  switch (type) {
    case "image":
      return (
        <div>
          <img src={q.data} alt={alt} className="max-w-full rounded" />
          {caption && <div className="text-xs text-muted-foreground mt-1">{caption}</div>}
        </div>
      );
    case "video":
      return (
        <div>
          <video src={q.data} controls className="max-w-full rounded" />
          {caption && <div className="text-xs text-muted-foreground mt-1">{caption}</div>}
        </div>
      );
    case "pdf":
      return (
        <div>
          <iframe src={q.data} className="w-full h-96 rounded border" title={caption || "PDF"} />
          {caption && <div className="text-xs text-muted-foreground mt-1">{caption}</div>}
        </div>
      );
    case "download":
      return (
        <a href={q.data} target="_blank" rel="noreferrer" className="text-primary underline text-sm">
          Download {(content.file_name as string) || path.split("/").pop()}
        </a>
      );
    default:
      return null;
  }
}

function PreviewQuestions({ questions }: { questions: CourseTree["modules"][number]["assessments"][number]["questions"] }) {
  return (
    <div className="space-y-2">
      {questions.map((q, i) => (
        <PreviewQuestion key={q.id} q={q} index={i} />
      ))}
      {questions.length === 0 && <div className="text-xs text-muted-foreground">No questions.</div>}
    </div>
  );
}

function PreviewQuestion({
  q,
  index,
}: {
  q: CourseTree["modules"][number]["assessments"][number]["questions"][number];
  index: number;
}) {
  const opts = useQuery({
    queryKey: ["preview-question-options", q.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assessment_options")
        .select("*")
        .eq("question_id", q.id)
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; option_text?: string; text?: string; is_correct: boolean }>;
    },
    enabled: CHOICE_TYPES.has(q.question_type),
  });
  return (
    <div className="text-sm">
      <div className="font-medium">{index + 1}. {q.prompt ?? q.question}</div>
      {CHOICE_TYPES.has(q.question_type) && (
        <ul className="mt-1 space-y-0.5 ml-4">
          {opts.data?.map((o) => (
            <li key={o.id} className={o.is_correct ? "text-emerald-700" : "text-muted-foreground"}>
              {o.is_correct ? "✓" : "·"} {o.option_text ?? o.text}
            </li>
          ))}
        </ul>
      )}
      {q.explanation && (
        <div className="text-xs text-muted-foreground mt-1">Explanation: {q.explanation}</div>
      )}
    </div>
  );
}

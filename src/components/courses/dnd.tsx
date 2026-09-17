import * as React from "react";
import { GripVertical } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";

export function DndList<T extends { id: string }>({
  items,
  onReorder,
  children,
  disabled,
}: {
  items: T[];
  onReorder: (ordered: string[]) => unknown;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((i) => i.id === active.id);
    const newIdx = items.findIndex((i) => i.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    void onReorder(arrayMove(items, oldIdx, newIdx).map((i) => i.id));
  };
  if (disabled) return <>{children}</>;
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

export function useSortableRow(id: string) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  return { setNodeRef, style, attributes, listeners, isDragging };
}

export function DragHandle({
  attributes,
  listeners,
  className,
  size = 14,
}: {
  attributes: import("@dnd-kit/core").DraggableAttributes;
  listeners?: import("@dnd-kit/core/dist/hooks/utilities").SyntheticListenerMap | undefined;
  className?: string;
  size?: number;
}) {
  return (
    <button
      type="button"
      {...attributes}
      {...(listeners ?? {})}
      className={cn(
        "cursor-grab active:cursor-grabbing text-muted-foreground/60 hover:text-foreground touch-none",
        className,
      )}
      aria-label="Drag to reorder"
      title="Drag to reorder"
    >
      <GripVertical style={{ width: size, height: size }} />
    </button>
  );
}

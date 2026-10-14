import { cn } from "@/lib/utils";

/**
 * Shared form-section header used by every multi-section form in the app:
 * amber divider between sections, small purple uppercase heading,
 * optional muted description.
 */
export function FormSection({
  title,
  description,
  first = false,
  children,
}: {
  title: string;
  description?: string;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("space-y-4", !first && "mt-6")}>
      {!first && (
        <div className="mb-6" aria-hidden>
          <div className="h-px bg-gradient-to-r from-transparent via-[rgb(122_89_163/0.25)] to-transparent" />
        </div>
      )}
      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">{title}</h3>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

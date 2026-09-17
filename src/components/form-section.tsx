import { cn } from "@/lib/utils";

/**
 * Shared form-section header used by every multi-section form in the app:
 * amber glowing divider between sections, small purple uppercase heading,
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
          <div className="h-px bg-amber/70 shadow-[0_0_6px_0_rgb(245_158_11_/_0.55),0_0_14px_2px_rgb(245_158_11_/_0.25)]" />
        </div>
      )}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

import { CheckCircle2 } from "lucide-react";

const PARTICLES = Array.from({ length: 14 }, (_, index) => index);

export function SuccessFlourish() {
  return (
    <div className="relative grid h-24 w-32 place-items-center" aria-hidden="true">
      <div className="wizard-success-glow absolute h-20 w-20 rounded-full bg-amber/15" />
      {PARTICLES.map((particle) => (
        <span key={particle} className={`wizard-confetti wizard-confetti-${particle + 1}`} />
      ))}
      <div className="wizard-success-icon relative grid h-16 w-16 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-amber/30">
        <CheckCircle2 className="h-9 w-9" />
      </div>
    </div>
  );
}
import { Fragment, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

/** Runs before paint in the browser (no flash of the final state), and is a no-op during SSR. */
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Motion is purely decorative: everything renders in its final state when motion is reduced or GSAP fails. */
export function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function hasFinePointer() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: fine)").matches;
}

/** Wraps each word so headings can rise in word by word. Text content and reading order are unchanged. */
export function SplitWords({ text, className }: { text: string; className?: string }) {
  const words = text.split(" ");
  return (
    <>
      {words.map((word, i) => (
        <Fragment key={`${word}-${i}`}>
          <span className="inline-block overflow-hidden pb-[0.08em] -mb-[0.08em] align-bottom">
            <span data-word className={`inline-block ${className ?? ""}`}>
              {word}
            </span>
          </span>
          {i < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </>
  );
}

/** Entrance timeline for a scope element: [data-word] rises in, [data-rise] fades up, [data-pop] scales in. */
export function useEntrance<T extends HTMLElement>(deps: unknown[] = []) {
  const scope = useRef<T>(null);
  useIsoLayoutEffect(() => {
    const root = scope.current;
    if (prefersReducedMotion() || !root) return;
    // Each element animates once, even when new content arrives later (e.g. after a data load).
    const fresh = (sel: string) =>
      Array.from(root.querySelectorAll<HTMLElement>(sel)).filter((el) => {
        if (el.dataset.entered) return false;
        el.dataset.entered = "1";
        return true;
      });
    const words = fresh("[data-word]");
    const rise = fresh("[data-rise]");
    const pop = fresh("[data-pop]");
    if (!words.length && !rise.length && !pop.length) return;
    const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
    if (words.length) tl.fromTo(words, { yPercent: 115, rotate: 3 }, { yPercent: 0, rotate: 0, duration: 1.05, stagger: 0.07 }, 0);
    if (rise.length) tl.fromTo(rise, { autoAlpha: 0, y: 22 }, { autoAlpha: 1, y: 0, duration: 0.85, stagger: 0.07 }, words.length ? 0.15 : 0);
    if (pop.length) tl.fromTo(pop, { autoAlpha: 0, scale: 0.96, y: 30 }, { autoAlpha: 1, scale: 1, y: 0, duration: 1.1 }, 0.1);
    // Safety net: content must never stay hidden, whatever happens to the animation.
    // Deliberately not cleared on cleanup, so it also covers React StrictMode's dev re-mount.
    window.setTimeout(() => {
      if (tl.progress() < 1) tl.progress(1);
    }, 2500);
  }, deps);
  return scope;
}

/** Light that follows the pointer across a glass surface (sets --gx/--gy). Mouse devices only. */
export function useGlare<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !hasFinePointer()) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--gx", `${e.clientX - r.left}px`);
      el.style.setProperty("--gy", `${e.clientY - r.top}px`);
    };
    el.addEventListener("pointermove", move);
    return () => el.removeEventListener("pointermove", move);
  }, []);
  return ref;
}

/** Element leans slightly toward the cursor and springs back. Mouse devices only, never with reduced motion. */
export function useMagnetic<T extends HTMLElement>(strength = 0.18) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !hasFinePointer() || prefersReducedMotion()) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      gsap.to(el, {
        x: (e.clientX - r.left - r.width / 2) * strength,
        y: (e.clientY - r.top - r.height / 2) * strength * 1.4,
        duration: 0.4,
        ease: "power3.out",
      });
    };
    const leave = () => gsap.to(el, { x: 0, y: 0, duration: 0.8, ease: "elastic.out(1,0.4)" });
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      gsap.killTweensOf(el);
    };
  }, [strength]);
  return ref;
}

/** Decorative drifting light for dark brand surfaces. aria-hidden, pointer-events none. */
export function AuroraBackdrop({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (prefersReducedMotion() || !ref.current) return;
      gsap.utils.toArray<HTMLElement>(ref.current.querySelectorAll("[data-blob]")).forEach((b, i) => {
        gsap.to(b, {
          xPercent: gsap.utils.random(-18, 18),
          yPercent: gsap.utils.random(-14, 14),
          scale: gsap.utils.random(0.9, 1.15),
          duration: gsap.utils.random(9, 14),
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
          delay: i * 0.4,
        });
      });
      ref.current.querySelectorAll<SVGPathElement>("path[data-draw]").forEach((p, i) => {
        const len = p.getTotalLength();
        gsap.fromTo(p, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 2.6, delay: 0.6 + i * 0.35, ease: "power2.inOut" });
      });
    },
    { scope: ref },
  );
  return (
    <div ref={ref} aria-hidden="true" className="aurora-backdrop">
      <span data-blob className="aurora-blob aurora-blob-1" />
      <span data-blob className="aurora-blob aurora-blob-2" />
      <span data-blob className="aurora-blob aurora-blob-3" />
      <span data-blob className="aurora-blob aurora-blob-4" />
      <svg className="aurora-lines" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" fill="none">
        <defs>
          <linearGradient id="aurora-line" x1="0" x2="1">
            <stop offset="0" stopColor="#E0A43A" stopOpacity="0" />
            <stop offset=".5" stopColor="#E0A43A" />
            <stop offset="1" stopColor="#F6F1FA" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path data-draw d="M-40 640 C 320 520, 620 820, 980 600 S 1400 380, 1500 420" stroke="url(#aurora-line)" strokeWidth="1" />
        <path data-draw d="M-40 720 C 360 600, 700 900, 1040 680 S 1420 470, 1500 500" stroke="url(#aurora-line)" strokeWidth="1" opacity=".6" />
      </svg>
      {children}
    </div>
  );
}

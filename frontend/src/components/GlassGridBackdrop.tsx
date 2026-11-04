import { useEffect, useRef } from "react";

/** A quiet, pointer-responsive grid behind the intake surface. */
export default function GlassGridBackdrop() {
  const backdrop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = backdrop.current;
    if (
      !element ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;

    let frame = 0;
    const followPointer = (event: PointerEvent) => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        element.style.setProperty("--pointer-x", `${event.clientX}px`);
        element.style.setProperty("--pointer-y", `${event.clientY}px`);
      });
    };

    window.addEventListener("pointermove", followPointer, { passive: true });
    return () => {
      window.removeEventListener("pointermove", followPointer);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={backdrop} className="glass-grid-backdrop" aria-hidden="true" />
  );
}

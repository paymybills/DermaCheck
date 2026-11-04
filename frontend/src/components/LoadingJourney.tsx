import { useEffect, useRef, useState } from "react";
import { ScanEye, ListChecks, MapPin } from "lucide-react";

const stages = [
  {
    label: "Taking a glance",
    detail: "Reading the details you shared",
    Icon: ScanEye,
  },
  {
    label: "Putting the clues together",
    detail: "Preparing screening considerations",
    Icon: ListChecks,
  },
  {
    label: "Finding people near you",
    detail: "Looking for local dermatology care",
    Icon: MapPin,
  },
];

export default function LoadingJourney() {
  const [active, setActive] = useState(0);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const scroll = window.setTimeout(
      () =>
        panelRef.current?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "instant"
            : "smooth",
          block: "center",
        }),
      180,
    );
    const second = window.setTimeout(() => setActive(1), 6500);
    const third = window.setTimeout(() => setActive(2), 15500);
    return () => {
      window.clearTimeout(scroll);
      window.clearTimeout(second);
      window.clearTimeout(third);
    };
  }, []);

  return (
    <section
      ref={panelRef}
      className="loading-journey"
      role="status"
      aria-live="polite"
    >
      <div className="loading-journey-head">
        <span className="loading-pulse" aria-hidden="true" />
        <div>
          <strong>Working on your screening</strong>
          <p>
            This can take a little while. Timing varies with the service
            response.
          </p>
        </div>
      </div>
      <div className="loading-track" aria-hidden="true">
        <span />
      </div>
      <div className="loading-stages">
        {stages.map(({ label, detail, Icon }, index) => (
          <div
            className={`loading-stage ${index === active ? "is-active" : ""}`}
            key={label}
          >
            <Icon size={18} aria-hidden="true" />
            <span>
              <strong>{label}</strong>
              <small>{detail}</small>
            </span>
          </div>
        ))}
      </div>
      <span className="visually-hidden">{stages[active].label}</span>
    </section>
  );
}

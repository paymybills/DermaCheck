import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, FormEvent } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  LoaderCircle,
  Phone,
  Upload,
  X,
} from "lucide-react";
import gsap from "gsap";
import LoadingJourney from "./LoadingJourney";

type Condition = {
  id: string;
  name: string;
  fit: "strong" | "possible" | "weak";
  matched: string[];
  usually_also: string[];
  blurb: string;
  evidence?: string | null;
  self_care: string[];
  see_doctor_if: string;
};
type Doctor = {
  name: string;
  clinic_name: string;
  area: string;
  phone?: string | null;
  website?: string | null;
  match_reason: string;
};
type Result = {
  watermark?: string;
  alert?: { level: "emergency" | "urgent" | "soon"; text: string } | null;
  mole_warning: boolean;
  lead: string;
  clinical_analysis?: string | null;
  conditions: Condition[];
  recommended_doctors: Doctor[];
};
const symptoms = [
  "Itching",
  "Redness",
  "Raised bumps / wheals",
  "Flaking / peeling",
  "Burning sensation",
  "Blistering",
  "Dry scaly patches",
  "Rapid spread",
  "Pain / tenderness",
  "Dark irregular pigment",
];
const areas = [
  "Face",
  "Scalp",
  "Arms",
  "Torso",
  "Hands / feet",
  "Legs",
  "Groin / folds",
];
const durations = [
  { value: "short", label: "Less than a week" },
  { value: "mid", label: "1–4 weeks" },
  { value: "chronic", label: "Over one month" },
];
function website(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export default function TriageDashboard() {
  const [photo, setPhoto] = useState<File | null>(null),
    [preview, setPreview] = useState<string | null>(null);
  const [area, setArea] = useState("Arms"),
    [selected, setSelected] = useState<string[]>([]),
    [details, setDetails] = useState("");
  const [duration, setDuration] = useState("short"),
    [city, setCity] = useState("Mumbai"),
    [submittedCity, setSubmittedCity] = useState("Mumbai");
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [results, setResults] = useState<Result | null>(null),
    [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null),
    resultRef = useRef<HTMLElement>(null);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  useEffect(() => {
    if (!results || !resultRef.current) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (!reduced)
      gsap.fromTo(
        resultRef.current.querySelectorAll(".result-animate"),
        { opacity: 0, y: 18 },
        {
          opacity: 1,
          y: 0,
          duration: 0.55,
          stagger: 0.08,
          ease: "power2.out",
          clearProps: "all",
        },
      );
    resultRef.current.scrollIntoView({
      behavior: reduced ? "instant" : "smooth",
      block: "start",
    });
  }, [results]);
  function choose(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError("Choose an image smaller than 4 MB.");
      return;
    }
    setError("");
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
  }
  function onFile(event: ChangeEvent<HTMLInputElement>) {
    choose(event.target.files?.[0]);
  }
  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    choose(event.dataTransfer.files[0]);
  }
  function removePhoto() {
    setPhoto(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  }
  function toggle(value: string) {
    setSelected((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResults(null);
    setLoading(true);
    try {
      const form = new FormData();
      form.append(
        "features",
        [...selected, details.trim()].filter(Boolean).join(", ") ||
          "General skin concern",
      );
      form.append("body_area", area);
      form.append("duration", duration);
      form.append("city", city.trim() || "Mumbai");
      if (photo) form.append("photo", photo);
      const base =
        (import.meta.env.VITE_API_URL as string | undefined)?.replace(
          /\/$/,
          "",
        ) || "";
      const response = await fetch(`${base}/api/v1/triage-poc`, {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        if (response.status === 429)
          throw new Error("The screening limit was reached. Please try again later.");
        if (response.status === 413)
          throw new Error("That photo is too large. Choose one smaller than 4 MB.");
        throw new Error(
          response.status >= 500
            ? "The screening service is unavailable right now. Please try again."
            : "We couldn't process this request. Review your details and try again.",
        );
      }
      const data = (await response.json()) as Result;
      if (
        !data.lead ||
        !Array.isArray(data.conditions) ||
        !Array.isArray(data.recommended_doctors)
      )
        throw new Error(
          "The screening response was incomplete. Please try again.",
        );
      setSubmittedCity(city.trim() || "Mumbai");
      setResults(data);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function copySummary() {
    if (!results) return;
    const lines = [
      "DERMACHECK PRE-CONSULT SUMMARY",
      "Screening aid only — not a diagnosis",
      "",
      `Summary: ${results.lead}`,
      `Area: ${area}`,
      `Duration: ${durations.find((item) => item.value === duration)?.label}`,
      `Symptoms: ${[...selected, details.trim()].filter(Boolean).join(", ") || "General skin concern"}`,
      "",
      "Possible considerations:",
      ...results.conditions.map(
        (item) => `• ${item.name} (${item.fit} fit): ${item.blurb}`,
      ),
      "",
      "Please discuss these findings with a licensed clinician.",
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError(
        "Couldn't copy the summary. Please allow clipboard access and try again.",
      );
    }
  }
  return (
    <div className="app-frame">
      <header className="topbar">
        <a className="brand" href="#top">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          DermaCheck
        </a>
        <span className="topbar-note">Skin concern screening</span>
        <a className="topbar-link" href="#about">
          How it works
        </a>
      </header>
      <div className="app-layout" id="top">
        <main className="sheet">
          <div className="content">
            <section className="intro" aria-labelledby="page-title">
              <div>
                <h1 id="page-title">A clearer next step for your skin.</h1>
                <p>
                  Tell us what you notice. We’ll organize your concern and help
                  you find a clinician to speak with.
                </p>
              </div>
            </section>
            <form onSubmit={submit} className="intake-form">
              <section className="form-section">
                <div className="section-heading">
                  <h2>Photo</h2>
                  <span>Optional</span>
                </div>
                <p className="field-help">
                  A well-lit photo can help describe visible features. Avoid
                  including identifying details.
                </p>
                <input
                  ref={inputRef}
                  id="skin-photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={onFile}
                  className="visually-hidden"
                />
                {preview ? (
                  <div className="photo-preview">
                    <img src={preview} alt="Selected skin photo preview" />
                    <div>
                      <strong>{photo?.name}</strong>
                      <span>
                        {photo
                          ? `${(photo.size / 1024 / 1024).toFixed(1)} MB`
                          : ""}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={removePhoto}
                      className="icon-button"
                      aria-label="Remove photo"
                    >
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  <div
                    className="upload-zone"
                    onDrop={onDrop}
                    onDragOver={(event) => event.preventDefault()}
                  >
                    <Upload size={22} aria-hidden="true" />
                    <div>
                      <label htmlFor="skin-photo">Choose a photo</label>
                      <span> or drop it here</span>
                      <small>JPEG, PNG or WebP · up to 4 MB</small>
                    </div>
                  </div>
                )}
              </section>
              <section className="form-section">
                <div className="section-heading">
                  <h2>Affected area</h2>
                  <span>Choose one</span>
                </div>
                <div
                  className="choice-grid"
                  role="group"
                  aria-label="Affected body area"
                >
                  {areas.map((item) => (
                    <button
                      type="button"
                      key={item}
                      aria-pressed={area === item}
                      onClick={() => setArea(item)}
                      className={`choice ${area === item ? "is-selected" : ""}`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </section>
              <section className="form-section">
                <div className="section-heading">
                  <h2>What do you notice?</h2>
                  <span>Select any</span>
                </div>
                <div className="choice-grid" role="group" aria-label="Symptoms">
                  {symptoms.map((item) => (
                    <button
                      type="button"
                      key={item}
                      aria-pressed={selected.includes(item)}
                      onClick={() => toggle(item)}
                      className={`choice ${selected.includes(item) ? "is-selected" : ""}`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <label className="field-label" htmlFor="details">
                  Anything else?
                </label>
                <textarea
                  id="details"
                  rows={3}
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  placeholder="For example, when it started or what makes it worse"
                />
              </section>
              <section className="form-section compact-fields">
                <div>
                  <label className="field-label" htmlFor="duration">
                    How long has it been there?
                  </label>
                  <select
                    id="duration"
                    value={duration}
                    onChange={(event) => setDuration(event.target.value)}
                  >
                    {durations.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="city">
                    City for specialist suggestions
                  </label>
                  <input
                    id="city"
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                    maxLength={80}
                    required
                  />
                </div>
              </section>
              <div className="form-footer">
                <p>
                  Screening only. If symptoms are severe or rapidly worsening,
                  seek medical care now.
                </p>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <LoaderCircle size={18} className="spin" /> Working on it…
                    </>
                  ) : (
                    <>
                      Get screening summary <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </div>
              {loading && <LoadingJourney />}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
            </form>
            {results && (
              <section
                className="results"
                ref={resultRef}
                aria-labelledby="results-title"
                aria-live="polite"
              >
                <div className="results-header result-animate">
                  <div>
                    <h2 id="results-title">Your screening summary</h2>
                    <p>
                      Use this as a starting point for a conversation with a
                      medical professional.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={copySummary}
                  >
                    {copied ? <Check size={17} /> : <Copy size={17} />}
                    {copied ? "Copied" : "Copy for consultation"}
                  </button>
                </div>
                <div className="notice result-animate">
                  <strong>Screening aid only</strong>
                  <p>
                    {results.watermark ||
                      "DermaCheck is not a doctor and cannot diagnose or prescribe treatment. Please consult a licensed clinician."}
                  </p>
                </div>
                {results.alert && (
                  <div
                    className={`alert alert-${results.alert.level} result-animate`}
                    role="alert"
                  >
                    <AlertTriangle size={20} />
                    <div>
                      <strong>
                        {results.alert.level === "emergency"
                          ? "Seek emergency care"
                          : results.alert.level === "urgent"
                            ? "Seek prompt medical care"
                            : "Arrange a medical review"}
                      </strong>
                      <p>{results.alert.text}</p>
                    </div>
                  </div>
                )}
                {results.mole_warning && (
                  <div className="alert alert-mole result-animate" role="alert">
                    <AlertTriangle size={20} />
                    <div>
                      <strong>Have this lesion checked in person</strong>
                      <p>
                        A dermatologist can examine changing or irregular
                        pigmentation with a dermatoscope.
                      </p>
                    </div>
                  </div>
                )}
                <div className="summary-panel result-animate">
                  <h3>Screening overview</h3>
                  <p>{results.lead}</p>
                  {results.clinical_analysis && (
                    <div className="clinical-analysis">
                      <strong>Clinical analysis</strong>
                      <p>{results.clinical_analysis}</p>
                    </div>
                  )}
                </div>
                <div className="result-block result-animate">
                  <h3>Possible considerations</h3>
                  {results.conditions.length ? (
                    <div className="condition-list">
                      {results.conditions.map((item) => (
                        <article className="condition" key={item.id}>
                          <div className="condition-head">
                            <h4>{item.name}</h4>
                            <span className={`fit fit-${item.fit}`}>
                              {item.fit} fit
                            </span>
                          </div>
                          <p>{item.blurb}</p>
                          {item.evidence && (
                            <p>
                              <strong>Supporting evidence:</strong>{" "}
                              {item.evidence}
                            </p>
                          )}
                          {item.matched.length > 0 && (
                            <p>
                              <strong>Features matched:</strong>{" "}
                              {item.matched.join(" · ")}
                            </p>
                          )}
                          {item.usually_also.length > 0 && (
                            <p>
                              <strong>Often also seen:</strong>{" "}
                              {item.usually_also.join(" · ")}
                            </p>
                          )}
                          {item.self_care.length > 0 && (
                            <p>
                              <strong>General self care:</strong>{" "}
                              {item.self_care.join(" · ")}
                            </p>
                          )}
                          <p>
                            <strong>See a doctor if:</strong>{" "}
                            {item.see_doctor_if}
                          </p>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p>
                      No specific condition matches were returned. A clinician
                      can still assess your concern.
                    </p>
                  )}
                </div>
                <div className="result-block result-animate">
                  <h3>Specialists near {submittedCity}</h3>
                  {results.recommended_doctors.length ? (
                    <div className="doctor-list">
                      {results.recommended_doctors.map((item, index) => {
                        const link = website(item.website);
                        return (
                          <article
                            className="doctor"
                            key={`${item.name}-${index}`}
                          >
                            <div>
                              <h4>{item.name}</h4>
                              <p className="doctor-location">
                                {item.clinic_name} · {item.area}
                              </p>
                              <p>{item.match_reason}</p>
                            </div>
                            <div className="doctor-actions">
                              {item.phone && (
                                <a
                                  href={`tel:${item.phone.replace(/[^+\d]/g, "")}`}
                                >
                                  <Phone size={15} /> Call clinic
                                </a>
                              )}
                              {link && (
                                <a
                                  href={link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLink size={15} /> Website
                                </a>
                              )}
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.clinic_name} ${item.area} ${submittedCity}`)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink size={15} /> Map
                              </a>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <p>
                      No local listings were returned. Ask a primary care
                      clinician for a referral.
                    </p>
                  )}
                </div>
              </section>
            )}
            <section id="about" className="about">
              <h2>How this works</h2>
              <p>
                Your details go to the screening service, which returns possible
                considerations and specialist suggestions. Results are
                informational and need clinical review.
              </p>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

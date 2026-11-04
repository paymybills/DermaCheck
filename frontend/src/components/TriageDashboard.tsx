import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, FormEvent } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  LoaderCircle,
  ChevronDown,
  MapPin,
  Phone,
  Upload,
  X,
  ShieldCheck,
  Stethoscope,
  Sparkles,
  Camera,
  Activity,
  HeartPulse,
  Info,
} from "lucide-react";
import gsap from "gsap";
import LoadingJourney from "./LoadingJourney";
import GradientASCII from "./GradientASCII";

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
  "Pain / tenderness",
  "Rapid spread",
  "Blistering",
  "Dark irregular pigment",
  "Raised bumps / wheals",
  "Flaking / peeling",
  "Burning sensation",
  "Dry scaly patches",
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
  { value: "short", label: "Acute (< 1 week)" },
  { value: "mid", label: "Subacute (1–4 weeks)" },
  { value: "chronic", label: "Chronic (> 1 month)" },
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
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [area, setArea] = useState("Arms");
  const [selected, setSelected] = useState<string[]>([]);
  const [details, setDetails] = useState("");
  const [duration, setDuration] = useState("short");
  const [city, setCity] = useState("Mumbai");
  const [submittedCity, setSubmittedCity] = useState("Mumbai");
  const [showAllSymptoms, setShowAllSymptoms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  useEffect(() => {
    if (!results || !resultRef.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced) {
      gsap.fromTo(
        resultRef.current.querySelectorAll(".result-animate"),
        { opacity: 0, y: 24 },
        {
          opacity: 1,
          y: 0,
          duration: 0.6,
          stagger: 0.09,
          ease: "power2.out",
          clearProps: "all",
        },
      );
    }
    resultRef.current.scrollIntoView({
      behavior: reduced ? "instant" : "smooth",
      block: "start",
    });
  }, [results]);

  function choose(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Please choose a valid JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError("Please choose an image smaller than 4 MB.");
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
        if (response.status === 429) {
          throw new Error("The screening quota was reached. Please try again in a few moments.");
        }
        if (response.status === 413) {
          throw new Error("That photo is too large. Please upload one smaller than 4 MB.");
        }
        throw new Error(
          response.status >= 500
            ? "The AI screening service is temporarily unavailable. Please try again."
            : "We couldn't process this request. Please review your details and try again.",
        );
      }

      const data = (await response.json()) as Result;
      if (
        !data.lead ||
        !Array.isArray(data.conditions) ||
        !Array.isArray(data.recommended_doctors)
      ) {
        throw new Error("The screening response was incomplete. Please try again.");
      }
      setSubmittedCity(city.trim() || "Mumbai");
      setResults(data);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Something went wrong. Please check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function copySummary() {
    if (!results) return;
    const lines = [
      "DERMACHECK PRE-CONSULT CLINICAL SUMMARY",
      "Screening aid only — NOT a medical diagnosis",
      "---------------------------------------------",
      `Assessment: ${results.lead}`,
      `Affected Area: ${area}`,
      `Duration: ${durations.find((item) => item.value === duration)?.label || duration}`,
      `Location: ${submittedCity}`,
      `Symptoms: ${[...selected, details.trim()].filter(Boolean).join(", ") || "General skin concern"}`,
      "",
      "Possible Considerations:",
      ...results.conditions.map(
        (item) => `• ${item.name} (${item.fit.toUpperCase()} FIT): ${item.blurb}`,
      ),
      "",
      "IMPORTANT: Automated AI pre-screening aid only. Please discuss these observations with a board-certified dermatologist.",
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Couldn't copy summary. Please allow clipboard access and try again.");
    }
  }

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="app-frame" id="top">
      {/* Sticky Topbar */}
      <header className="topbar">
        <a className="brand" href="#top">
          <span className="brand-mark" aria-hidden="true">
            <Stethoscope size={18} />
          </span>
          DermaCheck
        </a>
        <nav className="topbar-nav" aria-label="Main navigation">
          <a className="topbar-link" href="#how-it-works">How It Works</a>
          <a className="topbar-link" href="#intake-form">Intake Assessment</a>
          <a className="topbar-link" href="#safety">Clinical Safety</a>
        </nav>
        <span className="topbar-badge">
          <Sparkles size={13} className="text-sky-600" />
          AI-assisted screening
        </span>
      </header>

      {/* Hero Section with Interactive React Bits GradientASCII */}
      <section className="hero-wrapper">
        <div className="hero-card">
          <div className="hero-ascii-bg">
            <GradientASCII
              shape="horizon"
              colors={["#0f172a", "#1e293b", "#b68472", "#38bdf8", "#f4e8e2"]}
              cellSize={18}
              density={0.78}
              glyphOpacity={0.65}
              glow={0.3}
              speed={0.75}
              mouseInteraction={true}
              clickEffect="wave"
              className="w-full h-full"
            />
          </div>
          <div className="hero-glass-overlay" />

          <div className="hero-content">
            <div className="hero-chip">
              <ShieldCheck size={15} className="text-emerald-400" />
              <span>AI Dermatology Pre-Screening • Demo Prototype</span>
            </div>
            <h1 className="hero-title">
              Clear skin guidance, backed by clinical evidence.
            </h1>
            <p className="hero-description">
              Upload a clear photo or report symptoms to receive screening insights, possible explanations, and local dermatology options to discuss with a clinician.
            </p>
            <div className="hero-actions">
              <button
                type="button"
                onClick={scrollToForm}
                className="btn-primary-glow"
              >
                <span>Start Screening Intake</span>
                <ArrowRight size={17} />
              </button>
              <a href="#how-it-works" className="btn-glass">
                <span>Explore Protocol</span>
              </a>
            </div>
          </div>

          <div className="hero-stats">
            <div className="stat-item">
              <div className="stat-icon">
                <Activity size={18} />
              </div>
              <div className="stat-text">
                <strong>Guided Intake</strong>
                <small>Photo and symptom context</small>
              </div>
            </div>
            <div className="stat-item">
              <div className="stat-icon">
                <HeartPulse size={18} />
              </div>
              <div className="stat-text">
                <strong>Melanoma ABCDE Checks</strong>
                <small>Pigmented lesion evaluation</small>
              </div>
            </div>
            <div className="stat-item">
              <div className="stat-icon">
                <MapPin size={18} />
              </div>
              <div className="stat-text">
                <strong>Local Care Options</strong>
                <small>Search-backed suggestions</small>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Usage Section: How It Works */}
      <section className="usage-section" id="how-it-works">
        <div className="usage-header">
          <span>Usage Flow</span>
          <h2>How DermaCheck Works</h2>
          <p>
            A safe three-step protocol that bridges patient observation with board-certified clinical care.
          </p>
        </div>

        <div className="usage-grid">
          <div className="usage-card">
            <div className="step-num">STEP 01</div>
            <div className="usage-card-icon">
              <Camera size={22} />
            </div>
            <h3>Capture & Report</h3>
            <p>
              Upload a well-lit photo of the skin lesion and select key symptoms, duration, and body area. No accounts or personal identifiers required.
            </p>
          </div>

          <div className="usage-card">
            <div className="step-num">STEP 02</div>
            <div className="usage-card-icon">
              <Sparkles size={22} />
            </div>
            <h3>Multimodal Neural Analysis</h3>
            <p>
              The screening service reviews reported symptoms and visible features, then flags patterns that may need prompt medical attention.
            </p>
          </div>

          <div className="usage-card">
            <div className="step-num">STEP 03</div>
            <div className="usage-card-icon">
              <Stethoscope size={22} />
            </div>
            <h3>Evidence & Local Care</h3>
            <p>
              Receive possible matches with supporting context, conservative self-care information, and nearby dermatology options for follow-up.
            </p>
          </div>
        </div>
      </section>

      {/* Main Intake Workspace */}
      <div className="app-layout">
        <aside className="workspace-sidebar" aria-label="Page sections">
          <div className="workspace-sidebar-inner">
            <p className="sidebar-caption">Screening Flow</p>
            <nav>
              <a href="#area-section">1. Affected area</a>
              <a href="#symptom-section">2. Noticeable signs</a>
              <a href="#context-section">3. Duration & city</a>
              <a href="#photo-section">4. Photo upload</a>
              {results && <a href="#results-title">5. Your summary</a>}
            </nav>
            <div className="sidebar-note">
              <Info size={15} className="inline mr-1 text-slate-500" />
              Pre-screening aid only. Never a medical diagnosis. Consult a doctor for any persistent symptoms.
            </div>
          </div>
        </aside>

        <main className="sheet">
          <div className="content">
            <form onSubmit={submit} className="intake-form" id="intake-form" ref={formRef}>
              <div className="mb-6">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-3 py-1 rounded-full border border-amber-200 inline-block mb-2">
                  Clinical Intake Workspace
                </span>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                  Describe your skin concern
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Share what you have noticed. We will organize possible clinical considerations and help you find a dermatologist nearby.
                </p>
              </div>

              {/* Area Section */}
              <section className="form-section area-section" id="area-section">
                <div className="section-heading">
                  <h2>Affected area</h2>
                  <span>Select anatomical site</span>
                </div>
                <div className="choice-grid" role="group" aria-label="Affected body area">
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

              {/* Symptom Section */}
              <section className="form-section symptom-section" id="symptom-section">
                <div className="section-heading">
                  <h2>What do you notice?</h2>
                  <span>Select all that apply</span>
                </div>
                <div className="choice-grid" role="group" aria-label="Symptoms">
                  {(showAllSymptoms ? symptoms : symptoms.slice(0, 6)).map((item) => (
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
                <button
                  className="more-choice-button"
                  type="button"
                  aria-expanded={showAllSymptoms}
                  onClick={() => setShowAllSymptoms((value) => !value)}
                >
                  {showAllSymptoms ? "Show fewer symptoms" : "More symptoms"}
                  {!showAllSymptoms && selected.filter((item) => symptoms.slice(6).includes(item)).length > 0 && (
                    <span className="ml-1 text-xs text-amber-800">
                      ({selected.filter((item) => symptoms.slice(6).includes(item)).length} selected)
                    </span>
                  )}
                  <ChevronDown
                    size={15}
                    aria-hidden="true"
                    className={`transition-transform ${showAllSymptoms ? "rotate-180" : ""}`}
                  />
                </button>

                <label className="field-label" htmlFor="details">
                  Additional details & triggers
                </label>
                <textarea
                  id="details"
                  rows={3}
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  maxLength={1500}
                  placeholder="How it started, changes over time, nocturnal itching, heat sensitivity, new products, etc."
                />
              </section>

              {/* Context Section */}
              <section className="form-section context-section" id="context-section">
                <div className="section-heading">
                  <h2>Context</h2>
                  <span>Timing & location</span>
                </div>
                <div className="compact-fields">
                  <div>
                    <label className="field-label" htmlFor="duration">
                      How long have you had this?
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
                      Your Metro / City <MapPin size={14} className="text-slate-500" />
                    </label>
                    <input
                      id="city"
                      value={city}
                      onChange={(event) => setCity(event.target.value)}
                      maxLength={80}
                      required
                    />
                  </div>
                </div>
              </section>

              {/* Photo Upload Section */}
              <details className="photo-disclosure" id="photo-section">
                <summary>
                  <span className="photo-disclosure-icon">
                    <Upload size={17} aria-hidden="true" />
                  </span>
                  <span>
                    <strong>{photo ? "Photo attached" : "Attach a skin photo"}</strong>
                    <small>{photo ? photo.name : "Recommended for visual morphology analysis (up to 4 MB)"}</small>
                  </span>
                  <ChevronDown size={17} className="disclosure-chevron" aria-hidden="true" />
                </summary>
                <div className="photo-disclosure-body">
                  <p className="field-help">
                    Use a well-lit, in-focus image of the affected area without identifying personal features. Formats: JPEG, PNG, or WebP.
                  </p>
                  <input
                    ref={inputRef}
                    id="skin-photo"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={onFile}
                    className="hidden"
                  />
                  {preview ? (
                    <div className="photo-preview">
                      <img src={preview} alt="Selected skin photo preview" />
                      <div>
                        <strong>{photo?.name}</strong>
                        <span>{photo ? `${(photo.size / 1024 / 1024).toFixed(1)} MB` : ""}</span>
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
                      onClick={() => inputRef.current?.click()}
                    >
                      <Camera size={26} className="text-slate-400" />
                      <div>
                        <label htmlFor="skin-photo">Choose a photo</label>
                        <span> or drag and drop it here</span>
                      </div>
                      <span className="text-xs text-slate-400">Max size 4 MB</span>
                    </div>
                  )}
                </div>
              </details>

              {/* Form Footer */}
              <div className="form-footer">
                <button className="primary-button" type="submit" disabled={loading}>
                  {loading ? (
                    <>
                      <LoaderCircle size={18} className="spin" />
                      <span>Analyzing Visual Evidence...</span>
                    </>
                  ) : (
                    <>
                      <span>Generate Screening Assessment</span>
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
                <p>
                  For acute symptoms like airway tightness, facial swelling, or blister detachment, seek emergency medical care immediately.
                </p>
              </div>

              {loading && <LoadingJourney />}

              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}
            </form>

            {/* Results Section */}
            {results && (
              <section
                className="results"
                ref={resultRef}
                aria-labelledby="results-title"
                aria-live="polite"
              >
                <div className="results-header result-animate">
                  <div>
                    <h2 id="results-title">Your Clinical Screening Summary</h2>
                    <p>
                      Use these findings as a structured intake summary for an in-person dermatology visit.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={copySummary}
                  >
                    {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                    {copied ? "Copied to Clipboard" : "Copy for Doctor Visit"}
                  </button>
                </div>

                {/* Mandatory Pre-Screening Watermark Banner */}
                <div className="notice result-animate">
                  <strong>Official Clinical Watermark: Pre-Screening Aid Only</strong>
                  <p>
                    {results.watermark ||
                      "⚠️ DEMO PRE-SCREENING AID ONLY — NOT A DOCTOR. DermaCheck does not provide medical diagnoses or treatment prescriptions. Always visit a board-certified dermatologist or medical doctor for comprehensive clinical examination."}
                  </p>
                </div>

                {/* Emergency Red-Flag Alert */}
                {results.alert && (
                  <div
                    className={`alert alert-${results.alert.level} result-animate`}
                    role="alert"
                  >
                    <AlertTriangle size={22} className="flex-shrink-0" />
                    <div>
                      <strong>
                        {results.alert.level === "emergency"
                          ? "🚨 Emergency Attention Required"
                          : results.alert.level === "urgent"
                            ? "⚠️ Prompt Medical Evaluation Required"
                            : "Scheduled Outpatient Review Recommended"}
                      </strong>
                      <p>{results.alert.text}</p>
                    </div>
                  </div>
                )}

                {/* Melanoma ABCDE Warning */}
                {results.mole_warning && (
                  <div className="alert alert-mole result-animate" role="alert">
                    <AlertTriangle size={22} className="flex-shrink-0" />
                    <div>
                      <strong>In-Person Dermatoscope Evaluation Recommended</strong>
                      <p>
                        Visual or symptom indicators suggest irregular lesion characteristics matching melanoma ABCDE criteria (Asymmetry, Border irregularity, Color variation, Diameter, Evolution). A qualified dermatologist must examine this lesion in person.
                      </p>
                    </div>
                  </div>
                )}

                {/* Screening Overview Lead */}
                <div className="summary-panel result-animate">
                  <h3>Clinical Assessment Lead</h3>
                  <p>{results.lead}</p>
                  {results.clinical_analysis && (
                    <details className="clinical-analysis" open>
                      <summary>
                        <span>Diagnostic Reasoning & Morphological Evidence</span>
                        <ChevronDown size={16} aria-hidden="true" />
                      </summary>
                      <p>{results.clinical_analysis}</p>
                    </details>
                  )}
                </div>

                {/* Condition Matches */}
                <div className="result-block result-animate">
                  <h3>Possible Conditions (Differential Fit)</h3>
                  {results.conditions.length ? (
                    <div className="condition-list">
                      {results.conditions.map((item) => (
                        <article className="condition" key={item.id}>
                          <div>
                            <div className="condition-head">
                              <h4>{item.name}</h4>
                              <span className={`fit fit-${item.fit}`}>
                                {item.fit} fit
                              </span>
                            </div>
                            <p>{item.blurb}</p>

                            {item.evidence && (
                              <div className="mt-3 p-2.5 rounded-lg bg-amber-50/70 border border-amber-200/60 text-xs text-amber-900">
                                <strong>Clinical Evidence:</strong> {item.evidence}
                              </div>
                            )}

                            <p className="doctor-threshold">
                              <strong>See a doctor if:</strong> {item.see_doctor_if}
                            </p>
                          </div>

                          {(item.matched.length > 0 ||
                            item.usually_also.length > 0 ||
                            item.self_care.length > 0) && (
                            <details className="condition-detail">
                              <summary>
                                <span>Self-care & Features</span>
                                <ChevronDown size={14} aria-hidden="true" />
                              </summary>
                              {item.matched.length > 0 && (
                                <p>
                                  <strong>Features matched:</strong> {item.matched.join(" • ")}
                                </p>
                              )}
                              {item.usually_also.length > 0 && (
                                <p>
                                  <strong>Often also present:</strong> {item.usually_also.join(" • ")}
                                </p>
                              )}
                              {item.self_care.length > 0 && (
                                <p>
                                  <strong>Conservative Self-Care:</strong> {item.self_care.join(" • ")}
                                </p>
                              )}
                            </details>
                          )}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500 text-sm">
                      No specific condition matches met the confidence threshold. A clinical examination is advised.
                    </p>
                  )}
                </div>

                {/* Doctor Grounding Referrals */}
                <div className="result-block result-animate">
                  <h3>Dermatology Options in {submittedCity}</h3>
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
                                {item.clinic_name} • {item.area}
                              </p>
                              <p className="text-xs text-slate-600 mt-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                                {item.match_reason}
                              </p>
                            </div>
                            <div className="doctor-actions">
                              {item.phone && (
                                <a
                                  href={`tel:${item.phone.replace(/[^+\d]/g, "")}`}
                                >
                                  <Phone size={14} /> Call Clinic
                                </a>
                              )}
                              {link && (
                                <a
                                  href={link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLink size={14} /> Website
                                </a>
                              )}
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.clinic_name} ${item.area} ${submittedCity}`)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <MapPin size={14} /> View Map
                              </a>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-slate-500 text-sm">
                      No local listings were retrieved for {submittedCity}. Consult a hospital dermatology department or local specialist.
                    </p>
                  )}
                </div>
              </section>
            )}

            {/* Safety & Standards Section */}
            <section id="safety" className="mt-14 pt-8 border-t border-slate-200 text-xs text-slate-500 leading-relaxed">
              <h3 className="font-bold text-slate-700 text-sm mb-2">Clinical Protocol & Patient Privacy</h3>
              <p>
                DermaCheck is an automated AI pre-screening prototype developed for educational demonstration. Uploaded photos are sent to the screening service for analysis; avoid including identifying details. This application does not constitute a certified medical device and should never replace in-person consultation, clinical dermatoscope evaluation, or emergency medical treatment.
              </p>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

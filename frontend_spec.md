# DermaCheck Frontend Specification: React + GSAP Smooth Experience

This document details the frontend implementation for **DermaCheck**, an AI-assisted dermatology screening and doctor referral demo.

---

## 1. Stack & Architecture

- **Framework:** Next.js (App Router, React 19) or Vite + React (TypeScript)
- **Styling:** Tailwind CSS + Lucide React (Icons)
- **Smooth Scroll:** `lenis` (formerly `@studio-freight/lenis`)
- **Animations & Micro-interactions:** `gsap` + `gsap/ScrollTrigger`
- **Networking:** Native `fetch` with `FormData` to `${NEXT_PUBLIC_API_URL}/api/v1/triage-poc`

---

## 2. Dependencies to Install

```bash
# Core styling & icons
npm install lucide-react clsx tailwind-merge

# Smooth scroll & GSAP
npm install lenis gsap
```

---

## 3. Smooth Scroll (Lenis) + GSAP Integration

To ensure smooth page momentum without breaking GSAP's scroll tracking, configure Lenis and sync its tick cycle with GSAP's ticker.

### `components/SmoothScroll.tsx`

```tsx
"use client";

import { useEffect, useRef } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export default function SmoothScroll({ children }: { children: React.ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    // 1. Initialize Lenis smooth scroll
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // Smooth ease-out
      smoothWheel: true,
    });
    lenisRef.current = lenis;

    // 2. Synchronize Lenis scroll updates with GSAP ScrollTrigger
    lenis.on("scroll", ScrollTrigger.update);

    // 3. Drive Lenis via GSAP ticker for a single unified RAF loop
    const updateTicker = (time: number) => {
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(updateTicker);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(updateTicker);
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
```

---

## 4. UI/UX Flow & Component Breakdown

```text
Page Layout (Container)
│
├── [Hero Section]
│     └── Smooth fade/slide intro with disclaimer badge
│
├── [Interactive Triage Form]
│     ├── 1. Drag & Drop Image Uploader (Thumbnail, preview, clear button)
│     ├── 2. Body Area Selector (Face, Scalp, Arms, Torso, Legs, Hands/Feet)
│     ├── 3. Quick-Toggle Symptom Chips (Itch, Redness, Flaking, Bumps, Pain)
│     ├── 4. Duration Selector (< 1 week, 1-4 weeks, > 1 month)
│     └── 5. City Selector (Prefilled: Mumbai) + Animated Submit Button
│
└── [Results Dashboard] (Reveals via GSAP on API response)
      ├── 1. Priority Alert Banners (Emergency / Urgent / Mole Warning)
      ├── 2. Ranked Condition Cards (Fit level, symptoms matched, self-care)
      ├── 3. Recommended Specialists (Clinic cards, direct phone & map links)
      └── 4. "Copy Pre-Consult Summary" Action
```

---

## 5. Main Component Implementation

### `components/TriageDashboard.tsx`

```tsx
"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  UploadCloud,
  X,
  AlertTriangle,
  ShieldAlert,
  Phone,
  Globe,
  Copy,
  Check,
  Loader2,
} from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface ConditionMatch {
  id: string;
  name: string;
  fit: "strong" | "possible" | "weak";
  matched: string[];
  usually_also: string[];
  blurb: string;
  self_care: string[];
  see_doctor_if: string;
}

interface DoctorListing {
  name: string;
  clinic_name: string;
  area: string;
  phone?: string;
  website?: string;
  match_reason: string;
}

interface TriageResponse {
  alert?: { level: "emergency" | "urgent" | "soon"; text: string } | null;
  mole_warning: boolean;
  lead: string;
  conditions: ConditionMatch[];
  recommended_doctors: DoctorListing[];
}

const COMMON_SYMPTOMS = [
  "Itching", "Redness", "Raised bumps", "Flaking / Peeling",
  "Burning sensation", "Blistering", "Dry patches", "Rapid spread",
];

const BODY_AREAS = ["Face", "Scalp", "Arms", "Torso", "Hands / Feet", "Legs", "Groin / Folds"];

export default function TriageDashboard() {
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedArea, setSelectedArea] = useState<string>("Arms");
  const [duration, setDuration] = useState<string>("short");
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [customFeatures, setCustomFeatures] = useState<string>("");
  const [city, setCity] = useState<string>("Mumbai");

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TriageResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Handle photo selection & preview
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPhoto(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const clearPhoto = () => {
    setPhoto(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const toggleSymptom = (sym: string) => {
    setSelectedSymptoms((prev) =>
      prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym]
    );
  };

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const combinedFeatures = [
        ...selectedSymptoms,
        ...(customFeatures ? [customFeatures] : []),
      ].join(", ");

      const formData = new FormData();
      formData.append("features", combinedFeatures || "General skin concern");
      formData.append("body_area", selectedArea);
      formData.append("duration", duration);
      formData.append("city", city);
      if (photo) {
        formData.append("photo", photo);
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/api/v1/triage-poc`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Failed to process triage response");

      const data: TriageResponse = await res.json();
      setResults(data);
    } catch (err) {
      console.error(err);
      alert("Failed to analyze. Check backend tunnel connection.");
    } finally {
      setLoading(false);
    }
  };

  // GSAP entrance animation when results update
  useEffect(() => {
    if (results && resultsRef.current) {
      gsap.fromTo(
        resultsRef.current,
        { opacity: 0, y: 50 },
        { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" }
      );
      // Smooth scroll to results
      resultsRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [results]);

  const copyConsultSummary = () => {
    if (!results) return;
    const conditionLines = results.conditions
      .map((c) => `- ${c.name} (${c.fit.toUpperCase()} FIT): ${c.blurb}`)
      .join("\n");

    const summaryText = `
DERMACHECK PRE-CONSULT SUMMARY
------------------------------
Primary Visual Assessment: ${results.lead}
Reported Location: ${selectedArea}
Duration: ${duration}
Symptoms: ${selectedSymptoms.join(", ")}${customFeatures ? ` (${customFeatures})` : ""}

Possible Considerations:
${conditionLines}

*Note: Automated screening aid, not a definitive diagnosis.*
`.trim();

    navigator.clipboard.writeText(summaryText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="text-center mb-10">
        <span className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-200 rounded-full">
          AI Triage & Clinical Referral
        </span>
        <h1 className="text-4xl font-extrabold text-slate-900 mt-3 tracking-tight">
          DermaCheck Pre-Screening
        </h1>
        <p className="text-slate-600 mt-2 max-w-xl mx-auto text-sm sm:text-base">
          Upload a clear skin photo and select symptoms to receive calibrated intake screening and connect with verified specialists.
        </p>
      </div>

      {/* Main Intake Form */}
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8 space-y-8">
        {/* Photo Upload Zone */}
        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-2">
            Skin Photo (Optional but recommended)
          </label>
          {!previewUrl ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-8 text-center cursor-pointer transition bg-slate-50/50 hover:bg-blue-50/30 flex flex-col items-center justify-center gap-3"
            >
              <UploadCloud className="w-10 h-10 text-slate-400" />
              <div className="text-sm text-slate-600">
                <span className="font-semibold text-blue-600">Click to upload</span> or drag and drop
              </div>
              <p className="text-xs text-slate-400">JPEG, PNG, WebP up to 10MB</p>
            </div>
          ) : (
            <div className="relative inline-block border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <img src={previewUrl} alt="Upload preview" className="h-48 w-auto object-cover rounded-xl" />
              <button
                type="button"
                onClick={clearPhoto}
                className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoChange}
          />
        </div>

        {/* Anatomical Area */}
        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-2">Affected Body Area</label>
          <div className="flex flex-wrap gap-2">
            {BODY_AREAS.map((area) => (
              <button
                key={area}
                type="button"
                onClick={() => setSelectedArea(area)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-lg border transition ${
                  selectedArea === area
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
                }`}
              >
                {area}
              </button>
            ))}
          </div>
        </div>

        {/* Common Symptoms (Chips) */}
        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-2">Noticeable Symptoms</label>
          <div className="flex flex-wrap gap-2">
            {COMMON_SYMPTOMS.map((sym) => {
              const active = selectedSymptoms.includes(sym);
              return (
                <button
                  key={sym}
                  type="button"
                  onClick={() => toggleSymptom(sym)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                    active
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {sym}
                </button>
              );
            })}
          </div>
          <input
            type="text"
            placeholder="Add any extra details (e.g. burns after sun exposure, started yesterday)..."
            value={customFeatures}
            onChange={(e) => setCustomFeatures(e.target.value)}
            className="mt-3 w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        {/* Duration & City */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-2">Duration</label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="short">Acute (&lt; 1 week)</option>
              <option value="mid">Subacute (1-4 weeks)</option>
              <option value="chronic">Chronic (&gt; 1 month)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-2">City / Metro</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Analyzing Presentation & Sourcing Clinics...</span>
            </>
          ) : (
            <span>Run Pre-Screening Assessment</span>
          )}
        </button>
      </form>

      {/* Results Dashboard */}
      {results && (
        <div ref={resultsRef} className="mt-12 space-y-6">
          {/* Emergency Alert Banner */}
          {results.alert && (
            <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-900 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-bold text-sm uppercase tracking-wide">
                  {results.alert.level} Attention Required
                </h4>
                <p className="text-sm mt-1">{results.alert.text}</p>
              </div>
            </div>
          )}

          {/* Mole Warning Banner */}
          {results.mole_warning && (
            <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-bold text-sm">In-Person Dermatoscope Evaluation Recommended</h4>
                <p className="text-sm mt-1">
                  Features suggest irregular pigmentation or evolving borders. A qualified dermatologist must evaluate this lesion in person.
                </p>
              </div>
            </div>
          )}

          {/* Lead Summary */}
          <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-sm">
            <h3 className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
              Triage Assessment Lead
            </h3>
            <p className="mt-2 text-lg font-medium leading-relaxed">{results.lead}</p>
          </div>

          {/* Condition Matches */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Possible Conditions (Screening Fit)</h3>
            <div className="grid grid-cols-1 gap-4">
              {results.conditions.map((cond) => (
                <div key={cond.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-bold text-slate-900">{cond.name}</h4>
                    <span
                      className={`text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize ${
                        cond.fit === "strong"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-slate-100 text-slate-700 border border-slate-200"
                      }`}
                    >
                      {cond.fit} fit
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">{cond.blurb}</p>

                  <div className="bg-slate-50 p-3.5 rounded-lg space-y-2 text-xs">
                    <div>
                      <span className="font-semibold text-slate-700">Self-Care Advice: </span>
                      <span className="text-slate-600">{cond.self_care.join(" • ")}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-red-600">See a doctor if: </span>
                      <span className="text-slate-600">{cond.see_doctor_if}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Specialist Referrals */}
          {results.recommended_doctors?.length > 0 && (
            <div className="space-y-4 pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">Verified Specialists in {city}</h3>
                <button
                  type="button"
                  onClick={copyConsultSummary}
                  className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied Pre-Consult" : "Copy Pre-Consult Summary"}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {results.recommended_doctors.map((doc, idx) => (
                  <div key={idx} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-sm">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">{doc.name}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">{doc.clinic_name} • {doc.area}</p>
                      <p className="text-xs text-slate-600 mt-2 bg-blue-50/50 border border-blue-100 p-2 rounded-lg">
                        {doc.match_reason}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100 text-xs">
                      {doc.phone && (
                        <a
                          href={`tel:${doc.phone}`}
                          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-medium transition"
                        >
                          <Phone className="w-3.5 h-3.5" /> Call
                        </a>
                      )}
                      {doc.website && (
                        <a
                          href={doc.website}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-700 transition"
                        >
                          <Globe className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Legal / Regulatory Disclaimer */}
          <div className="text-center pt-8 border-t border-slate-200">
            <p className="text-xs text-slate-400 max-w-lg mx-auto">
              DermaCheck is an automated AI triage prototype intended for educational pre-screening and specialist referral only. It does not provide medical diagnoses or replace an in-person clinical consultation.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## 6. How to Run & Verify

1. **Set environment variable.** Create `.env.local` in `frontend/`:

```ini
NEXT_PUBLIC_API_URL=http://localhost:8000
```

2. **Run the dev server:**

```bash
npm run dev
```

3. **Smooth scroll verification:** Scroll through long triage results. Lenis eases the scroll while GSAP slides the cards into view once the API response arrives.

# DermaCheck — Frontend Handoff & API Guide

This document is prepared for the incoming frontend developer/agent working on **DermaCheck**. It outlines the backend contracts, deployed endpoints, local development setup, and UI requirements.

---

## 1. Quick Architecture & Links

- **GitHub Repository:** [https://github.com/paymybills/DermaCheck](https://github.com/paymybills/DermaCheck)
- **Live Vercel Production URL:** [https://dermacheck-app.vercel.app](https://dermacheck-app.vercel.app)
- **Local Backend URL:** `http://localhost:8000`
- **Local Frontend Dev Server:** `http://localhost:3000` (via Vite in `frontend/`)
- **Backend Code:** [`backend/main.py`](file:///home/meow/Documents/DermaCheck/backend/main.py)
- **Original Backend Spec:** [`dermacheck_backend_spec.md`](file:///home/meow/Documents/DermaCheck/dermacheck_backend_spec.md)
- **Frontend Spec Reference:** [`frontend_spec.md`](file:///home/meow/Documents/DermaCheck/frontend_spec.md)

---

## 2. API Endpoints & Contracts

### A. Health Check
- **Route:** `GET /health`
- **Response:**
  ```json
  { "status": "ok" }
  ```

### B. Multimodal Triage & Doctor Grounding
- **Route:** `POST /api/v1/triage-poc`
- **Content-Type:** `multipart/form-data`
- **CORS:** Wide-open (`allow_origins=["*"]`, `allow_credentials=True`, all methods/headers allowed).

#### Request Form Fields:
| Field Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `photo` | File (`image/*`) | Optional | `null` | Dermatological image (JPEG, PNG, WebP) |
| `features` | string | Optional | `""` | Clinical signs/symptoms (e.g. "itchy red welts, stinging") |
| `body_area` | string | Optional | `"unspecified"` | Anatomical site (e.g. "Face", "Arms", "Torso") |
| `city` | string | Optional | `"Mumbai"` | Patient city for dermatologist search grounding |
| `duration` | string | Optional | `"short"` | Chronicity: `"short"` (< 1 week), `"mid"` (1-4 weeks), `"chronic"` (> 1 month) |

#### TypeScript Interfaces & Full Response Contract:
```typescript
export interface AlertNotice {
  level: "emergency" | "urgent" | "soon";
  text: string;
}

export interface ConditionMatch {
  id: string;               // slug: "urticaria", "acne", "eczema", etc.
  name: string;             // Display condition name
  fit: "strong" | "possible" | "weak";
  matched: string[];        // Symptoms that matched this condition
  usually_also: string[];   // Other common symptoms for this condition
  blurb: string;            // Clinical summary
  evidence?: string | null; // Specific morphological / diagnostic reasoning
  self_care: string[];      // Conservative home-care actions
  see_doctor_if: string;    // Immediate clinical threshold trigger
}

export interface DoctorListing {
  name: string;             // Doctor / specialist name
  clinic_name: string;      // Clinic / hospital
  area: string;             // Suburb / neighborhood
  phone?: string | null;    // Contact number
  website?: string | null;  // Official website URL
  match_reason: string;     // Why this doctor/clinic was matched
}

export interface TriageFullResponse {
  watermark: string;        // Mandatory disclaimer banner (Not a doctor)
  alert?: AlertNotice | null; // Red flags (anaphylaxis, airway, etc.)
  mole_warning: boolean;    // Melanoma ABCDE warning flag
  lead: string;             // Clinical intake summary sentence
  clinical_analysis?: string | null; // Deep diagnostic reasoning & evidence
  conditions: ConditionMatch[];
  recommended_doctors: DoctorListing[];
}
```

---

## 3. Mandatory Safety & Demo Watermark Rules

Per clinical safety requirements:
1. **Prominent Watermark**: Always display the `watermark` string / banner on screen:
   > *"DEMO PRE-SCREENING AID ONLY — NOT A DOCTOR. Please consult a licensed dermatologist or medical doctor for formal evaluation."*
2. **Emergency Red Flags**: If `alert` is returned with `level: "emergency"` or `"urgent"`, render a high-visibility alert banner at the top of the results.
3. **Melanoma ABCDE Warning**: If `mole_warning === true`, prominently advise an in-person dermatoscope evaluation.
4. **Clinical Evidence Display**: Render `clinical_analysis` and `condition.evidence` so users understand the reasoning behind each differential match.

---

## 4. Current Frontend Scaffolding (`frontend/`)

A starter implementation matching `frontend_spec.md` is already built in `frontend/`:
- **Tech Stack**: React 18, TypeScript, Tailwind CSS, Vite.
- **Smooth Scroll**: `lenis` configured in `frontend/src/components/SmoothScroll.tsx` (synced with GSAP ticker loop).
- **Animations**: `gsap` + `ScrollTrigger` in `frontend/src/components/TriageDashboard.tsx`.
- **API Proxy**: `frontend/vite.config.ts` proxies `/api` and `/health` to `http://localhost:8000` during local dev.

### Running the Frontend Locally:
```bash
cd frontend
npm install
npm run dev
# App starts on http://localhost:3000
```

### Building for Production:
```bash
cd frontend
npm run build
# Compiles into frontend/dist/
```

---

## 5. Vercel Configuration & Deployment

- Root [`vercel.json`](file:///home/meow/Documents/DermaCheck/vercel.json) is configured:
  - `buildCommand`: `cd frontend && npm install && npm run build`
  - `outputDirectory`: `frontend/dist`
  - `/api/(.*)` rewrites to `/api/index.py` (FastAPI Python backend)
  - `/health` rewrites to `/api/index.py`
  - All other routes serve the static frontend SPA.
- **Environment Variables on Vercel:**
  - `GEMINI_API_KEY`: Configured in Production & Development environments.
  - To set a custom API target for the frontend if hosted separately: set `VITE_API_URL` (or `NEXT_PUBLIC_API_URL`).

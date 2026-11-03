# DermaCheck Backend

AI-assisted multimodal skin screening and real-time dermatologist discovery Proof of Concept (PoC) backend powered by **FastAPI** and **Gemini 2.5 Flash** (`google-genai` SDK).

## Features

- **Multimodal Skin Screening (`POST /api/v1/triage-poc`)**:
  - Analyzes dermatological photo uploads alongside clinical symptoms, body area, city, and duration.
  - Generates condition matches (`strong`, `possible`, `weak`), self-care recommendations, and red flag alert triggers.
  - Automatically identifies ABCDE melanoma criteria (`mole_warning`) and acute emergency alerts (anaphylaxis, mucosal detachment).
- **Live Dermatologist Grounding**:
  - Dynamically searches for active clinics/dermatologists in the patient's area using Google Search grounding.
  - Built-in hardcoded fallback to top Mumbai dermatology centers to ensure zero downtime.
- **Vercel Serverless Ready**:
  - Includes `vercel.json` and `api/index.py` configured for one-click Vercel deployments.
- **Wide-Open CORS**:
  - Ready for external frontend callers (Next.js on Vercel, localhost, mobile apps).

---

## Project Structure

```
├── api/
│   └── index.py            # Vercel serverless entrypoint
├── backend/
│   ├── main.py             # FastAPI application core & logic
│   ├── requirements.txt    # Backend dependencies
│   ├── run.sh              # Local development launcher script
│   ├── tunnel.md           # Instructions for Cloudflare / ngrok tunnels
│   └── .env.example        # Environment variable sample
├── dermacheck_backend_spec.md
├── requirements.txt        # Root requirements for Vercel builds
├── vercel.json             # Vercel deployment & rewrite config
└── README.md
```

---

## Local Development

### 1. Prerequisites
- Python 3.10+
- A Google Gemini API Key ([Get one here](https://aistudio.google.com/app/api-keys))

### 2. Run Locally

```bash
# Set your Gemini API Key
export GEMINI_API_KEY="your_api_key_here"

# Execute the runner script
./backend/run.sh
```

The server starts at `http://0.0.0.0:8000`.

### 3. Health Check
```bash
curl http://localhost:8000/health
```

### 4. Test Triage Screening Endpoint
```bash
curl -X POST http://localhost:8000/api/v1/triage-poc \
  -F "photo=@dummy.jpg" \
  -F "features=itchy red welts appearing and disappearing rapidly" \
  -F "body_area=arms" \
  -F "city=Mumbai" \
  -F "duration=short"
```

---

## Vercel Deployment

1. Push this repository to GitHub.
2. Import the repository in [Vercel](https://vercel.com/new).
3. Under **Project Settings > Environment Variables**, add:
   - `GEMINI_API_KEY`: Your Gemini API key.
4. Deploy! Vercel will use `@vercel/python` and `api/index.py` to serve all routes.

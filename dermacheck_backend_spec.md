# DermaCheck PoC Backend Spec

Build a working Proof of Concept (PoC) backend for "DermaCheck", an AI-assisted dermatology screening and doctor referral demo.

## Architecture Overview

Build a standalone FastAPI service in `backend/` that handles multimodal skin screening and real-time dermatologist discovery using `gemini-2.5-flash` via the official `google-genai` SDK. Wide-open CORS must be enabled so that external frontend callers (e.g., Vercel, localhost, ngrok, or Cloudflare Tunnel) can interact with it without preflight issues.

---

## Step 1: Requirements (`backend/requirements.txt`)

Create `backend/requirements.txt` with:

```txt
fastapi>=0.110.0
uvicorn>=0.28.0
google-genai>=0.1.1
pydantic>=2.6.0
pillow>=10.2.0
python-multipart>=0.0.9
python-dotenv>=1.0.0
```

---

## Step 2: Application Core (`backend/main.py`)

Implement the FastAPI server in `backend/main.py` fulfilling the following specs.

### 1. Client and CORS Setup

- Initialize the client via `from google import genai; client = genai.Client()`. It must automatically read `GEMINI_API_KEY` from the environment.
- Configure FastAPI `CORSMiddleware` with `allow_origins=["*"]`, `allow_credentials=True`, `allow_methods=["*"]`, and `allow_headers=["*"]`.

### 2. Pydantic Data Contracts

**`AlertNotice`**
- `level`: `Literal["emergency", "urgent", "soon"]`
- `text`: `str`

**`ConditionMatch`**
- `id`: `str` (slug/tag, e.g. "urticaria", "acne", "eczema", "psoriasis", "tinea", "contact_dermatitis")
- `name`: `str`
- `fit`: `Literal["strong", "possible", "weak"]`
- `matched`: `list[str]`
- `usually_also`: `list[str]`
- `blurb`: `str`
- `self_care`: `list[str]`
- `see_doctor_if`: `str`

**`DoctorListing`**
- `name`: `str`
- `clinic_name`: `str`
- `area`: `str`
- `phone`: `Optional[str]` = None
- `website`: `Optional[str]` = None
- `match_reason`: `str`

**`TriageFullResponse`**
- `alert`: `Optional[AlertNotice]` = None
- `mole_warning`: `bool`
- `lead`: `str`
- `conditions`: `list[ConditionMatch]`
- `recommended_doctors`: `list[DoctorListing]`

### 3. Endpoints

**`GET /health`**
- Returns `{"status": "ok"}`.

**`POST /api/v1/triage-poc`**

Accepts `multipart/form-data`:
- `photo`: `Optional[UploadFile] = File(default=None)`
- `features`: `str = Form(default="")`
- `body_area`: `str = Form(default="unspecified")`
- `city`: `str = Form(default="Mumbai")`
- `duration`: `str = Form(default="short")`

**Execution flow**

**Part A: Multimodal Triage**
- If `photo` is provided, read the raw bytes and wrap into a PIL `Image.open(io.BytesIO(raw_bytes))`.
- System instruction: Pre-screening aid only, never a medical diagnosis. Set `alert` ("emergency" / "urgent") for signs of anaphylaxis, breathing distress, rapid spreading hot erythema, or mucosal detachment. Set `mole_warning=true` if any dark lesion shows ABCDE signs of melanoma (Asymmetry, Border irregularity, Color variation, Diameter >6mm, Evolving). Return matching conditions with self-care advice.
- Call `client.models.generate_content` using model `gemini-2.5-flash` with `response_mime_type="application/json"` and an intermediate Pydantic schema enforcing `alert`, `mole_warning`, `lead`, and `conditions`.

**Part B: Live Doctor Search Grounding**
- Note: Google Search grounding cannot be combined with `response_schema` in the SDK.
- Identify the top condition from Part A (default to "general dermatology" if none).
- Call `gemini-2.5-flash` with `tools=[types.Tool(google_search=types.GoogleSearch())]`, prompting it to find 3 REAL, active dermatologists or clinics in `{body_area}, {city}` that treat that condition.
- Explicitly prompt the model to return ONLY a raw JSON array of objects with keys: `name`, `clinic_name`, `area`, `phone`, `website`, `match_reason`.
- Clean markdown fences (a leading `` ```json `` and trailing `` ``` ``) with regex and parse into `list[DoctorListing]`.
- Wrap Part B in a `try/except` block with a reliable hardcoded fallback list of 3 Mumbai clinics (e.g. Dr. Sheth's Bandra, Skin Saga Andheri, Kokilaben Hospital) so network/grounding failures never break the endpoint.

**Part C: Combine**
- Combine results and return `TriageFullResponse`.

---

## Step 3: Run Scripts and Drill

### 1. `backend/run.sh` (executable via `chmod +x`)

- Checks if `GEMINI_API_KEY` is present in the environment. If missing, warns the user and exits.
- Sets up a Python virtual environment (`backend/.venv`), activates it, and installs `requirements.txt`.
- Starts the server with `uvicorn main:app --reload --port 8000 --host 0.0.0.0`.

### 2. `backend/tunnel.md`

Quick copy-paste instructions for exposing port 8000 via:

- Cloudflare Tunnel: `npx cloudflared tunnel --url http://localhost:8000`
- ngrok: `ngrok http 8000`

Include an example `curl` command to test the endpoint with a dummy image file and form data:

```bash
curl -X POST http://localhost:8000/api/v1/triage-poc \
  -F "photo=@dummy.jpg" \
  -F "features=itchy red welts appearing and disappearing rapidly" \
  -F "body_area=arms" \
  -F "city=Mumbai" \
  -F "duration=short"
```

---

Make sure all code strictly passes syntax and type checks without missing imports.

import io
import json
import logging
import re
from typing import List, Literal, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel, Field

# Load environment variables (such as GEMINI_API_KEY)
load_dotenv()

from google import genai
from google.genai import types

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("dermacheck")

# Initialize GenAI Client
client: Optional[genai.Client] = None
try:
    client = genai.Client()
except Exception as e:
    logger.warning("GenAI Client initialization deferred: %s", e)


def get_genai_client() -> genai.Client:
    """Retrieve or initialize the GenAI Client reading GEMINI_API_KEY from environment."""
    global client
    if client is None:
        client = genai.Client()
    return client


# --- Pydantic Data Contracts ---


class AlertNotice(BaseModel):
    level: Literal["emergency", "urgent", "soon"]
    text: str


class ConditionMatch(BaseModel):
    id: str = Field(
        ...,
        description='Slug/tag, e.g. "urticaria", "acne", "eczema", "psoriasis", "tinea", "contact_dermatitis"',
    )
    name: str
    fit: Literal["strong", "possible", "weak"]
    matched: List[str]
    usually_also: List[str]
    blurb: str
    self_care: List[str]
    see_doctor_if: str


class DoctorListing(BaseModel):
    name: str
    clinic_name: str
    area: str
    phone: Optional[str] = None
    website: Optional[str] = None
    match_reason: str


class TriageScreeningResponse(BaseModel):
    alert: Optional[AlertNotice] = None
    mole_warning: bool = False
    lead: str
    conditions: List[ConditionMatch] = Field(default_factory=list)


class TriageFullResponse(BaseModel):
    alert: Optional[AlertNotice] = None
    mole_warning: bool
    lead: str
    conditions: List[ConditionMatch]
    recommended_doctors: List[DoctorListing]


# Reliable Mumbai clinic fallbacks if search grounding fails or is throttled
FALLBACK_DOCTORS: List[DoctorListing] = [
    DoctorListing(
        name="Dr. Rekha Sheth",
        clinic_name="Dr. Sheth's Skin & Hair Clinic",
        area="Bandra West, Mumbai",
        phone="+91-22-26402422",
        website="https://drsheths.com",
        match_reason="Pioneering senior cosmetic and clinical dermatologist in Bandra specializing in acute rashes, inflammatory disorders, and complex dermatoses.",
    ),
    DoctorListing(
        name="Dr. Amit Bhor",
        clinic_name="Skin Saga Centre for Dermatology",
        area="Andheri West, Mumbai",
        phone="+91-9136002020",
        website="https://skinsaga.com",
        match_reason="Comprehensive dermatology and dermatosurgery center in Andheri West focused on evidence-based treatment for acute skin conditions.",
    ),
    DoctorListing(
        name="Department of Dermatology",
        clinic_name="Kokilaben Dhirubhai Ambani Hospital",
        area="Four Bungalows, Andheri West, Mumbai",
        phone="+91-22-42696969",
        website="https://www.kokilabenhospital.com",
        match_reason="Tertiary multi-specialty hospital with state-of-the-art dermatopathology, phototherapy, and 24/7 urgent medical care.",
    ),
]

SYSTEM_INSTRUCTION = (
    "You are an AI dermatology screening assistant. "
    "This tool is a pre-screening aid only, NEVER a definitive medical diagnosis. "
    "Always exercise high clinical caution:\n"
    "1. Set 'alert' with level 'emergency' or 'urgent' if there are red flags such as signs of anaphylaxis, "
    "breathing distress, facial/lip/throat swelling, rapid spreading hot erythema, blister sloughing, or mucosal detachment. "
    "Use level 'soon' for persistent or bothersome symptoms needing standard evaluation.\n"
    "2. Set 'mole_warning' to true if any dark pigmented lesion shows ABCDE signs of melanoma "
    "(Asymmetry, Border irregularity, Color variation, Diameter >6mm, or Evolving characteristics).\n"
    "3. Provide matched conditions with fit level ('strong', 'possible', 'weak'), symptoms matched, "
    "symptoms usually also present, a concise clinical blurb, evidence-backed self-care steps, and specific 'see_doctor_if' thresholds.\n"
    "4. Provide a warm, clear, informative summary 'lead' sentence for the patient."
)

# Initialize FastAPI App
app = FastAPI(
    title="DermaCheck PoC Backend",
    version="1.0.0",
    description="Multimodal skin screening and doctor referral demo backend powered by Gemini 2.5 Flash",
)

# Wide-open CORS configuration for frontend callers (Vercel, localhost, ngrok, Cloudflare)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


def clean_json_markdown(text: str) -> str:
    """Strip markdown code fence blocks and extract JSON content."""
    text = text.strip()
    # Strip leading ```json or ``` and trailing ```
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text)
    # If wrapped with extra conversational prose, find the outermost array
    array_match = re.search(r"\[\s*\{.*\}\s*\]", text, flags=re.DOTALL)
    if array_match:
        return array_match.group(0).strip()
    return text.strip()


def parse_doctor_listings(raw_text: str) -> List[DoctorListing]:
    """Parse grounded LLM output into a list of DoctorListing models."""
    cleaned = clean_json_markdown(raw_text)
    data = json.loads(cleaned)
    if not isinstance(data, list):
        raise ValueError("Grounding response did not parse into a list")

    doctors: List[DoctorListing] = []
    for item in data:
        if isinstance(item, dict):
            doctors.append(
                DoctorListing(
                    name=str(item.get("name", "Specialist Dermatologist")),
                    clinic_name=str(item.get("clinic_name", "Dermatology Clinic")),
                    area=str(item.get("area", "Mumbai")),
                    phone=item.get("phone") if item.get("phone") else None,
                    website=item.get("website") if item.get("website") else None,
                    match_reason=str(
                        item.get(
                            "match_reason",
                            "Specialist in dermatology and skin conditions.",
                        )
                    ),
                )
            )
    return doctors


@app.post("/api/v1/triage-poc", response_model=TriageFullResponse)
async def triage_poc(
    photo: Optional[UploadFile] = File(default=None),
    features: str = Form(default=""),
    body_area: str = Form(default="unspecified"),
    city: str = Form(default="Mumbai"),
    duration: str = Form(default="short"),
):
    """
    Multimodal skin screening and grounded doctor discovery endpoint.
    - photo: Optional image file of the affected area
    - features: Description of symptoms (e.g. itch, redness, sensation)
    - body_area: Body site affected (e.g. face, arms, back)
    - city: Target city for doctor referral (default: Mumbai)
    - duration: Symptom duration (e.g. short, days, months)
    """
    ai_client = get_genai_client()

    # --- Part A: Multimodal Triage ---
    contents = []

    # Process image if provided
    if photo is not None and photo.filename:
        try:
            raw_bytes = await photo.read()
            if raw_bytes:
                image = Image.open(io.BytesIO(raw_bytes))
                if image.mode not in ("RGB", "L"):
                    image = image.convert("RGB")
                contents.append(image)
        except Exception as img_err:
            logger.warning("Failed to parse uploaded photo as image: %s", img_err)

    user_prompt = (
        f"Patient Skin Screening Assessment Request:\n"
        f"- Patient-Reported Features / Symptoms: {features or 'None provided'}\n"
        f"- Affected Body Area: {body_area}\n"
        f"- Location / City: {city}\n"
        f"- Duration of Symptoms: {duration}\n\n"
        "Evaluate the skin features (and attached image if available). "
        "Identify potential matching conditions, assess acute warning signs, check for melanoma ABCDE signs, "
        "and formulate a safe, helpful screening response."
    )
    contents.append(user_prompt)

    try:
        screening_response = ai_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                response_mime_type="application/json",
                response_schema=TriageScreeningResponse,
            ),
        )

        if hasattr(screening_response, "parsed") and isinstance(
            screening_response.parsed, TriageScreeningResponse
        ):
            screening: TriageScreeningResponse = screening_response.parsed
        elif hasattr(screening_response, "parsed") and isinstance(
            screening_response.parsed, dict
        ):
            screening = TriageScreeningResponse.model_validate(
                screening_response.parsed
            )
        else:
            screening = TriageScreeningResponse.model_validate_json(
                screening_response.text
            )
    except Exception as triage_err:
        logger.error("Multimodal triage failed: %s", triage_err, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Screening analysis failed: {str(triage_err)}",
        )

    # --- Part B: Live Doctor Search Grounding ---
    # Top condition from Part A (default to "general dermatology" if none)
    top_condition = "general dermatology"
    if screening.conditions:
        top_condition = screening.conditions[0].name

    recommended_doctors: List[DoctorListing] = []
    try:
        doctor_prompt = (
            f"Find 3 REAL, active dermatologists or clinics in {body_area}, {city} "
            f"that treat {top_condition}.\n"
            "Return ONLY a raw JSON array of objects with keys: "
            "name, clinic_name, area, phone, website, match_reason.\n"
            "Example format:\n"
            "[\n"
            '  {\n'
            '    "name": "Dr. Full Name",\n'
            '    "clinic_name": "Clinic Name",\n'
            '    "area": "Neighborhood, City",\n'
            '    "phone": "+91-...",\n'
            '    "website": "https://...",\n'
            '    "match_reason": "Why this clinic is suitable"\n'
            '  }\n'
            "]\n"
            "Do not include any other markdown formatting or conversational text, ONLY the JSON array."
        )

        grounding_response = ai_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=doctor_prompt,
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
            ),
        )

        if grounding_response.text:
            recommended_doctors = parse_doctor_listings(grounding_response.text)

        if not recommended_doctors:
            logger.warning("Empty doctor list returned from grounding, using fallback.")
            recommended_doctors = FALLBACK_DOCTORS
    except Exception as ground_err:
        logger.warning(
            "Live doctor search grounding failed: %s. Using hardcoded Mumbai fallback list.",
            ground_err,
        )
        recommended_doctors = FALLBACK_DOCTORS

    # --- Part C: Combine ---
    return TriageFullResponse(
        alert=screening.alert,
        mole_warning=screening.mole_warning,
        lead=screening.lead,
        conditions=screening.conditions,
        recommended_doctors=recommended_doctors,
    )

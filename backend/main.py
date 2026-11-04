import io
import json
import logging
import re
from typing import List, Literal, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
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

DEMO_DISCLAIMER_WATERMARK = (
    "⚠️ DEMO PRE-SCREENING AID ONLY — NOT A DOCTOR. "
    "This automated tool does NOT provide medical advice, diagnosis, or prescriptions. "
    "Always consult a board-certified dermatologist or medical doctor for formal clinical evaluation."
)


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
    evidence: Optional[str] = Field(
        default=None,
        description="Clinical, morphological, and visual evidence supporting this condition match.",
    )
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
    clinical_analysis: Optional[str] = Field(
        default=None,
        description="Detailed clinical screening analysis detailing symptom morphology, differential diagnosis reasoning, and supporting evidence.",
    )
    conditions: List[ConditionMatch] = Field(default_factory=list)


class TriageFullResponse(BaseModel):
    watermark: str = Field(
        default=DEMO_DISCLAIMER_WATERMARK,
        description="Mandatory disclaimer banner: not a doctor, consult a physician.",
    )
    alert: Optional[AlertNotice] = None
    mole_warning: bool
    lead: str
    clinical_analysis: Optional[str] = None
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
    "You are an AI dermatology screening assistant for DEMONSTRATION PURPOSES ONLY. "
    "MANDATORY CLINICAL SAFETY DIRECTIVE: You are NOT a doctor and CANNOT give definitive medical diagnoses. "
    "Every evaluation must make it unequivocally clear that the user must visit a qualified medical doctor or board-certified dermatologist.\n"
    "Clinical Rules:\n"
    "1. Clinical Analysis & Evidence: Provide a thorough 'clinical_analysis' evaluating lesion morphology (e.g., erythema, papules/plaques, wheals, scaling, borders, anatomical distribution) and chronicity, presenting concrete clinical evidence and differential reasoning.\n"
    "2. Suggest Matching Conditions: Provide 1 to 4 candidate conditions ('strong', 'possible', 'weak'). For every condition, specify concrete 'evidence' from the patient's reported symptoms and visual presentation, matched symptoms, associated signs, concise blurb, conservative non-prescription self-care, and explicit 'see_doctor_if' red-line thresholds.\n"
    "3. Acute Red-Flag Alerts: Set 'alert' with level 'emergency' or 'urgent' if there are signs of anaphylaxis, airway or breathing compromise, facial/lip/tongue angioedema, rapidly spreading hot erythema, blister sloughing, or mucosal detachment. Use 'soon' for persistent or worsening symptoms needing prompt outpatient evaluation.\n"
    "4. Melanoma Detection: Set 'mole_warning' to true if any dark or pigmented lesion exhibits ABCDE criteria (Asymmetry, Border irregularity, Color variegation, Diameter >6mm, Evolving/changing).\n"
    "5. Summary Lead: Formulate a clear, reassuring, patient-accessible summary lead sentence that stresses clinical consultation."
)

# Initialize FastAPI App
app = FastAPI(
    title="DermaCheck PoC Backend",
    version="1.0.0",
    description="Multimodal skin screening and doctor referral demo backend powered by Gemini 2.5 Flash",
)

# The frontend and API share an origin in production; Vite proxies API calls locally.
# No cross-origin browser access is needed.


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
    if len(features) > 2000 or len(body_area) > 80 or len(city) > 80:
        raise HTTPException(status_code=422, detail="Input text is too long.")
    if duration not in {"short", "mid", "chronic"}:
        raise HTTPException(status_code=422, detail="Invalid duration.")

    # Leave room for multipart overhead under Vercel's 4.5 MB function limit.
    max_photo_bytes = 4 * 1024 * 1024
    if photo is not None and photo.filename:
        if photo.content_type not in {"image/jpeg", "image/png", "image/webp"}:
            raise HTTPException(status_code=415, detail="Use a JPEG, PNG, or WebP photo.")
        if len(await photo.read(max_photo_bytes + 1)) > max_photo_bytes:
            raise HTTPException(status_code=413, detail="Photo must be smaller than 4 MB.")
        await photo.seek(0)

    ai_client = get_genai_client()

    # --- Part A: Multimodal Triage ---
    contents = []

    # Process image if provided
    if photo is not None and photo.filename:
        try:
            raw_bytes = await photo.read(max_photo_bytes + 1)
            if raw_bytes:
                image = Image.open(io.BytesIO(raw_bytes))
                if image.width * image.height > 20_000_000:
                    raise ValueError("Image dimensions are too large")
                image.load()
                if image.mode not in ("RGB", "L"):
                    image = image.convert("RGB")
                contents.append(image)
        except Exception as img_err:
            logger.warning("Failed to parse uploaded photo: %s", type(img_err).__name__)
            raise HTTPException(status_code=415, detail="Photo could not be read. Use a valid JPEG, PNG, or WebP image.")

    user_prompt = (
        f"Patient Skin Screening Assessment Request:\n"
        f"- Patient-Reported Features / Symptoms: {features or 'None provided'}\n"
        f"- Affected Body Area: {body_area}\n"
        f"- Location / City: {city}\n"
        f"- Duration of Symptoms: {duration}\n\n"
        "Instructions:\n"
        "1. Analyze the skin presentation, lesion characteristics (if photo attached), and symptom chronology.\n"
        "2. Formulate a detailed 'clinical_analysis' explaining what the clinical evidence suggests, key differential considerations, and why.\n"
        "3. Suggest matching differential conditions with specific supporting 'evidence' for each match.\n"
        "4. Check for emergency red flags (set alert notice) or melanoma ABCDE signs (set mole_warning=true).\n"
        "5. Emphasize that this is an algorithmic pre-screening demonstration and they must consult a qualified medical doctor."
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
        logger.error(
            "Multimodal triage failed: type=%s code=%s",
            type(triage_err).__name__,
            getattr(triage_err, "code", None),
        )
        if getattr(triage_err, "code", None) == 429:
            raise HTTPException(
                status_code=429,
                detail="AI service limit reached. Please try again after the quota resets.",
            )
        raise HTTPException(status_code=503, detail="Screening service unavailable. Please try again.")

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

        if not recommended_doctors and city.strip().casefold() == "mumbai":
            logger.warning("Empty doctor list returned from grounding, using fallback.")
            recommended_doctors = FALLBACK_DOCTORS
    except Exception as ground_err:
        logger.warning(
            "Live doctor search grounding failed: %s. Using hardcoded Mumbai fallback list.",
            ground_err,
        )
        recommended_doctors = FALLBACK_DOCTORS if city.strip().casefold() == "mumbai" else []

    # --- Part C: Combine ---
    return TriageFullResponse(
        watermark=DEMO_DISCLAIMER_WATERMARK,
        alert=screening.alert,
        mole_warning=screening.mole_warning,
        lead=screening.lead,
        clinical_analysis=screening.clinical_analysis,
        conditions=screening.conditions,
        recommended_doctors=recommended_doctors,
    )

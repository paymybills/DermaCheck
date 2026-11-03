# Exposing the DermaCheck Backend (Port 8000)

Use any of the following tools to expose the local server running on port `8000` to external clients (e.g., Vercel, mobile test devices, or remote frontends).

---

## 1. Cloudflare Tunnel (Quickest, No Account Required)

Run with `npx` (requires Node.js):

```bash
npx cloudflared tunnel --url http://localhost:8000
```

Cloudflare will output a temporary public HTTPS URL (e.g., `https://random-subdomain.trycloudflare.com`).

---

## 2. ngrok

If you have `ngrok` installed:

```bash
ngrok http 8000
```

Copy the public forwarding HTTPS URL (e.g., `https://xxxx.ngrok-free.app`).

---

## 3. Testing the Endpoint

### Check Server Health
```bash
curl http://localhost:8000/health
```
Expected response:
```json
{"status":"ok"}
```

### Create a Dummy Test Image (Optional)
If you don't have a skin image file handy for testing:
```bash
python3 -c "from PIL import Image; Image.new('RGB', (200, 200), color='salmon').save('dummy.jpg')"
```

### Run Triage Screening Drill
```bash
curl -X POST http://localhost:8000/api/v1/triage-poc \
  -F "photo=@dummy.jpg" \
  -F "features=itchy red welts appearing and disappearing rapidly" \
  -F "body_area=arms" \
  -F "city=Mumbai" \
  -F "duration=short"
```

### Text-Only Screening Drill (Without Photo)
```bash
curl -X POST http://localhost:8000/api/v1/triage-poc \
  -F "features=circular scaly red patch with central clearing" \
  -F "body_area=torso" \
  -F "city=Mumbai" \
  -F "duration=2 weeks"
```

---

## 4. Expected Response Format

```json
{
  "alert": null,
  "mole_warning": false,
  "lead": "The symptoms described are suggestive of acute urticaria (hives), which commonly presents with transient itchy welts.",
  "conditions": [
    {
      "id": "urticaria",
      "name": "Acute Urticaria (Hives)",
      "fit": "strong",
      "matched": ["itchy red welts", "appearing and disappearing rapidly", "arms"],
      "usually_also": ["raised wheals", "dermatographia", "burning sensation"],
      "blurb": "Sudden outbreak of raised, itchy red or skin-colored welts typically triggered by allergic reactions, viral infections, or histamine release.",
      "self_care": [
        "Avoid scratching the affected areas to prevent secondary infection",
        "Apply cool compresses to soothe inflammation",
        "Consider over-the-counter non-sedating antihistamines if suitable"
      ],
      "see_doctor_if": "Welts persist beyond 6 weeks, or if you experience lip/facial swelling, tongue numbness, or shortness of breath."
    }
  ],
  "recommended_doctors": [
    {
      "name": "Dr. Rekha Sheth",
      "clinic_name": "Dr. Sheth's Skin & Hair Clinic",
      "area": "Bandra West, Mumbai",
      "phone": "+91-22-26402422",
      "website": "https://drsheths.com",
      "match_reason": "Pioneering senior cosmetic and clinical dermatologist in Bandra specializing in acute rashes, inflammatory disorders, and complex dermatoses."
    }
  ]
}
```

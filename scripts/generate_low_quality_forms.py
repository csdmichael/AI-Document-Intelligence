"""
Generate low-quality tax exemption PDF forms with four degradation tiers.

Each tier is designed to produce a different Document Intelligence confidence
category after parsing:
  - Blue  (>90%):  Clean, print-ready forms — same style as generate_forms.py
  - Green (80–90%): Slight degradation: faint text, minor smudging
  - Yellow(60–80%): Moderate degradation: faded text, noise overlay, rotation
  - Red   (<60%):  Heavy degradation: very faint text, heavy noise, rotation

Forms are written to data/low_quality/.  Upload + parse them the same way
as the standard forms to populate all four confidence buckets.
"""

import os
import sys
import random
import string
from datetime import datetime, timedelta

from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import HexColor, Color
from reportlab.pdfgen import canvas
from faker import Faker

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from config import cfg

fake = Faker()
Faker.seed(99)
random.seed(99)

OUTPUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "data", "low_quality"
)

# Customer info from config
CUSTOMER_NAME = cfg.app.forms.customer_name
CUSTOMER_DBA = cfg.app.forms.customer_dba
CUSTOMER_ADDRESS = cfg.app.forms.customer_address
CUSTOMER_CITY_STATE_ZIP = cfg.app.forms.customer_city_state_zip
CUSTOMER_PHONE = cfg.app.forms.customer_phone
CUSTOMER_EIN = cfg.app.forms.customer_ein

STATES = [
    ("Alabama", "AL"), ("Alaska", "AK"), ("Arizona", "AZ"), ("Arkansas", "AR"),
    ("California", "CA"), ("Colorado", "CO"), ("Connecticut", "CT"), ("Delaware", "DE"),
    ("Florida", "FL"), ("Georgia", "GA"), ("Hawaii", "HI"), ("Idaho", "ID"),
    ("Illinois", "IL"), ("Indiana", "IN"), ("Iowa", "IA"), ("Kansas", "KS"),
    ("Kentucky", "KY"), ("Louisiana", "LA"), ("Maine", "ME"), ("Maryland", "MD"),
    ("Massachusetts", "MA"), ("Michigan", "MI"), ("Minnesota", "MN"), ("Mississippi", "MS"),
    ("Missouri", "MO"), ("Montana", "MT"), ("Nebraska", "NE"), ("Nevada", "NV"),
    ("New Hampshire", "NH"), ("New Jersey", "NJ"), ("New Mexico", "NM"), ("New York", "NY"),
    ("North Carolina", "NC"), ("North Dakota", "ND"), ("Ohio", "OH"), ("Oklahoma", "OK"),
    ("Oregon", "OR"), ("Pennsylvania", "PA"), ("Rhode Island", "RI"), ("South Carolina", "SC"),
    ("South Dakota", "SD"), ("Tennessee", "TN"), ("Texas", "TX"), ("Utah", "UT"),
    ("Vermont", "VT"), ("Virginia", "VA"), ("Washington", "WA"), ("West Virginia", "WV"),
    ("Wisconsin", "WI"), ("Wyoming", "WY"),
]

EXEMPTION_TYPES = [
    "Resale",
    "Manufacturing / Processing",
    "Agricultural / Farming",
    "Government / Nonprofit",
    "Educational Institution",
    "Industrial Processing",
    "Research & Development",
    "Interstate Commerce",
]

PRODUCT_DESCRIPTIONS = [
    "GPS navigation devices and accessories for fleet management",
    "Wearable fitness technology and smartwatch components",
    "Aviation navigation and communication equipment",
    "Marine electronics and fish-finder systems",
    "Outdoor recreation GPS handhelds and mapping units",
    "Automotive OEM navigation and infotainment modules",
    "Dog tracking and training collar systems",
    "Cycling computers and power meters",
    "InReach satellite communicators and accessories",
    "Dash cameras and driver awareness systems",
]

GARMIN_SIGNERS = [
    ("Sarah J. Mitchell", "Tax Compliance Manager"),
    ("David R. Thompson", "Director of Tax Operations"),
    ("Jennifer L. Garcia", "Senior Tax Analyst"),
    ("Michael P. Anderson", "VP of Finance & Tax"),
    ("Patricia K. Chen", "Tax Exemption Coordinator"),
]

# Tiers map: quality name → approximate confidence bucket
QUALITY_TIERS = [
    ("blue",   "Blue",   1),   # 1 form per state (25 states, alternating)
    ("green",  "Green",  1),
    ("yellow", "Yellow", 1),
    ("red",    "Red",    1),
]


# ---------------------------------------------------------------------------
# Per-tier colour/style settings
# ---------------------------------------------------------------------------

def _tier_text_color(tier: str) -> Color:
    """Return the fill colour used for printed text in a quality tier."""
    return {
        "blue":   HexColor("#0a0a0a"),   # near-black
        "green":  HexColor("#3a3a3a"),   # dark gray
        "yellow": HexColor("#7a7a7a"),   # medium gray
        "red":    HexColor("#b8b8b8"),   # light gray – very faded
    }[tier]


def _tier_ink_color(tier: str) -> Color:
    """Return the colour used for simulated handwritten ink."""
    return {
        "blue":   HexColor("#1a237e"),
        "green":  HexColor("#344499"),
        "yellow": HexColor("#6677cc"),
        "red":    HexColor("#aabbdd"),
    }[tier]


def _tier_rotation(tier: str) -> float:
    """Return the maximum page skew in degrees (applied as canvas transform)."""
    return {
        "blue":   0.0,
        "green":  0.3,
        "yellow": 1.5,
        "red":    3.5,
    }[tier]


def _tier_noise_count(tier: str) -> int:
    """Return the number of noise elements drawn over the form."""
    return {
        "blue":   0,
        "green":  15,
        "yellow": 60,
        "red":    180,
    }[tier]


def _tier_missing_field_prob(tier: str) -> float:
    """Probability that a handwritten value is left blank."""
    return {
        "blue":   0.00,
        "green":  0.05,
        "yellow": 0.18,
        "red":    0.40,
    }[tier]


def _tier_garble_prob(tier: str) -> float:
    """Probability that a handwritten value has garbled / smeared characters."""
    return {
        "blue":   0.00,
        "green":  0.03,
        "yellow": 0.12,
        "red":    0.30,
    }[tier]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _random_tax_id(state_abbr: str) -> str:
    prefix = state_abbr
    num = "".join(random.choices(string.digits, k=random.choice([7, 8, 9])))
    return f"{prefix}-{num}"


def _random_date() -> str:
    days_back = random.randint(1, 365)
    d = datetime.now() - timedelta(days=days_back)
    return d.strftime("%m/%d/%Y")


def _garble(text: str, prob: float) -> str:
    """Randomly replace or drop characters to simulate smearing."""
    result = []
    for ch in text:
        r = random.random()
        if r < prob * 0.5:
            result.append(random.choice("l1I0O~#@"))
        elif r < prob:
            pass  # drop character
        else:
            result.append(ch)
    return "".join(result)


def _maybe_value(value: str, tier: str) -> str:
    """Return an empty string, garbled, or normal value based on tier."""
    if random.random() < _tier_missing_field_prob(tier):
        return ""
    if random.random() < _tier_garble_prob(tier):
        return _garble(value, _tier_garble_prob(tier) * 1.5)
    return value


def _add_noise(c: canvas.Canvas, tier: str, width: float, height: float):
    """Overlay noise dots, smudge blobs, and horizontal scan lines."""
    count = _tier_noise_count(tier)
    if count == 0:
        return

    intensity = {"blue": 0.0, "green": 0.12, "yellow": 0.25, "red": 0.45}[tier]

    for _ in range(count):
        noise_type = random.choice(["dot", "line", "blob"])
        x = random.uniform(40, width - 40)
        y = random.uniform(40, height - 40)
        gray = random.uniform(0.55, 0.85)
        c.setFillColor(Color(gray, gray, gray, alpha=intensity))
        c.setStrokeColor(Color(gray, gray, gray, alpha=intensity * 0.8))

        if noise_type == "dot":
            r = random.uniform(0.5, 2.5)
            c.circle(x, y, r, fill=True, stroke=False)
        elif noise_type == "line":
            c.setLineWidth(random.uniform(0.3, 1.2))
            c.line(x, y, x + random.uniform(-30, 30), y + random.uniform(-5, 5))
        else:  # blob
            w = random.uniform(4, 18)
            h = random.uniform(2, 8)
            c.rect(x, y, w, h, fill=True, stroke=False)


# ---------------------------------------------------------------------------
# Drawing primitives
# ---------------------------------------------------------------------------

def _draw_section_header(c: canvas.Canvas, y: float, title: str,
                         text_color: Color) -> float:
    c.setFillColor(HexColor("#e3f2fd"))
    c.rect(50, y - 4, 510, 18, fill=True, stroke=False)
    c.setFillColor(text_color)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(55, y, title)
    return y - 24


def _draw_label_value(c: canvas.Canvas, x: float, y: float,
                      label: str, value: str,
                      label_width: int, text_color: Color,
                      ink_color: Color, tier: str) -> float:
    c.setFillColor(text_color)
    c.setFont("Helvetica", 9)
    c.drawString(x, y, label)

    display_value = _maybe_value(value, tier)
    if display_value:
        c.setFillColor(ink_color)
        c.setFont("Courier-Oblique", 10)
        jitter = random.uniform(-0.8, 0.8)
        c.drawString(x + label_width, y + jitter, display_value)

    c.setStrokeColor(HexColor("#cccccc"))
    c.setLineWidth(0.5)
    c.line(x + label_width - 2, y - 2, x + 460 - x, y - 2)
    return y - 18


def _draw_checkbox(c: canvas.Canvas, x: float, y: float,
                   label: str, checked: bool,
                   text_color: Color, ink_color: Color) -> float:
    c.setStrokeColor(text_color)
    c.setLineWidth(0.8)
    c.rect(x, y - 2, 10, 10, fill=False)
    if checked:
        c.setFillColor(ink_color)
        c.setFont("Courier-Oblique", 12)
        c.drawString(x + 1, y - 1, "X")
    c.setFillColor(text_color)
    c.setFont("Helvetica", 9)
    c.drawString(x + 16, y, label)
    return y - 16


# ---------------------------------------------------------------------------
# Main form generator
# ---------------------------------------------------------------------------

def create_low_quality_form(state_name: str, state_abbr: str,
                             form_index: int, tier: str,
                             output_path: str):
    """Create a single degraded-quality tax exemption PDF."""
    c = canvas.Canvas(output_path, pagesize=letter)
    width, height = letter

    text_color = _tier_text_color(tier)
    ink_color = _tier_ink_color(tier)
    lw = 140  # label width

    # Apply page rotation for lower quality tiers
    rotation = _tier_rotation(tier)
    if rotation > 0:
        angle = random.uniform(-rotation, rotation)
        cx, cy = width / 2, height / 2
        import math
        rad = math.radians(angle)
        cos_a, sin_a = math.cos(rad), math.sin(rad)
        # Translate → rotate → translate back
        c.transform(cos_a, sin_a, -sin_a, cos_a,
                    cx * (1 - cos_a) + cy * sin_a,
                    cy * (1 - cos_a) - cx * sin_a)

    cert_number = f"{state_abbr}-{random.randint(100000, 999999)}"
    signer = random.choice(GARMIN_SIGNERS)

    # Header band
    header_color = {
        "blue":   HexColor("#1565c0"),
        "green":  HexColor("#1a6633"),
        "yellow": HexColor("#997722"),
        "red":    HexColor("#883333"),
    }[tier]
    c.setFillColor(header_color)
    c.rect(0, height - 90, width, 90, fill=True, stroke=False)

    c.setFillColor(HexColor("#ffffff"))
    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(width / 2, height - 35,
                        f"STATE OF {state_name.upper()}")
    c.setFont("Helvetica-Bold", 13)
    c.drawCentredString(width / 2, height - 55,
                        "SALES AND USE TAX EXEMPTION CERTIFICATE")
    c.setFont("Helvetica", 9)
    c.drawCentredString(width / 2, height - 72,
                        f"Certificate No: {cert_number}")

    y = height - 110

    # Instructions
    c.setFillColor(text_color)
    c.setFont("Helvetica", 7.5)
    c.drawString(50, y,
                 "This certificate is to be completed by the purchaser and "
                 "furnished to the seller. Retain this certificate for at "
                 "least four years.")
    y -= 22

    # Section 1 — Purchaser Information
    y = _draw_section_header(c, y, "SECTION 1: PURCHASER INFORMATION",
                             text_color)
    y = _draw_label_value(c, 55, y, "Company Name:", CUSTOMER_NAME,
                          lw, text_color, ink_color, tier)
    y = _draw_label_value(c, 55, y, "DBA / Trade Name:", CUSTOMER_DBA,
                          lw, text_color, ink_color, tier)
    y = _draw_label_value(c, 55, y, "Street Address:", CUSTOMER_ADDRESS,
                          lw, text_color, ink_color, tier)
    y = _draw_label_value(c, 55, y, "City, State, ZIP:",
                          CUSTOMER_CITY_STATE_ZIP,
                          lw, text_color, ink_color, tier)
    y = _draw_label_value(c, 55, y, "Phone:", CUSTOMER_PHONE,
                          lw, text_color, ink_color, tier)
    y = _draw_label_value(c, 55, y, "Contact Person:", signer[0],
                          lw, text_color, ink_color, tier)
    y = _draw_label_value(c, 55, y, f"{state_name} Tax ID:",
                          _random_tax_id(state_abbr),
                          lw, text_color, ink_color, tier)
    y = _draw_label_value(c, 55, y, "Federal EIN:", CUSTOMER_EIN,
                          lw, text_color, ink_color, tier)
    y -= 8

    # Section 2 — Seller Information
    seller = {
        "name": fake.company(),
        "address": fake.street_address(),
        "city": fake.city(),
        "state": state_abbr,
        "zip": fake.zipcode_in_state(state_abbr=state_abbr),
        "phone": fake.phone_number(),
        "tax_id": _random_tax_id(state_abbr),
    }
    y = _draw_section_header(c, y, "SECTION 2: SELLER / VENDOR INFORMATION",
                             text_color)
    y = _draw_label_value(c, 55, y, "Seller Name:", seller["name"],
                          lw, text_color, ink_color, tier)
    y = _draw_label_value(c, 55, y, "Street Address:", seller["address"],
                          lw, text_color, ink_color, tier)
    y = _draw_label_value(
        c, 55, y, "City, State, ZIP:",
        f"{seller['city']}, {seller['state']} {seller['zip']}",
        lw, text_color, ink_color, tier)
    y = _draw_label_value(c, 55, y, "Phone:", seller["phone"],
                          lw, text_color, ink_color, tier)
    y = _draw_label_value(c, 55, y, f"{state_name} Tax ID:",
                          seller["tax_id"],
                          lw, text_color, ink_color, tier)
    y -= 8

    # Section 3 — Type of Exemption
    y = _draw_section_header(c, y,
                             "SECTION 3: TYPE OF EXEMPTION CLAIMED",
                             text_color)
    chosen = random.choice(EXEMPTION_TYPES)
    col1_x, col2_x = 55, 310
    for i, etype in enumerate(EXEMPTION_TYPES):
        x = col1_x if i % 2 == 0 else col2_x
        y_pos = y if i % 2 == 0 else y + 16
        _draw_checkbox(c, x, y_pos, etype, etype == chosen,
                       text_color, ink_color)
        if i % 2 == 0:
            y -= 16
    y -= 10

    # Section 4 — Description of Property
    y = _draw_section_header(
        c, y, "SECTION 4: DESCRIPTION OF TANGIBLE PERSONAL PROPERTY",
        text_color)
    desc = random.choice(PRODUCT_DESCRIPTIONS)
    c.setFillColor(text_color)
    c.setFont("Helvetica", 8)
    c.drawString(55, y,
                 "Describe the tangible personal property or services "
                 "to be purchased tax-exempt:")
    y -= 16

    c.setFillColor(ink_color)
    c.setFont("Courier-Oblique", 10)
    words = desc.split()
    line = ""
    for word in words:
        if len(line + " " + word) > 70:
            drawn = _maybe_value(line.strip(), tier)
            if drawn:
                c.drawString(55, y + random.uniform(-0.5, 0.5), drawn)
            y -= 14
            line = word
        else:
            line += " " + word
    if line.strip():
        drawn = _maybe_value(line.strip(), tier)
        if drawn:
            c.drawString(55, y + random.uniform(-0.5, 0.5), drawn)
        y -= 14

    y -= 6
    y = _draw_label_value(c, 55, y, "Estimated Annual Purchases ($):",
                          f"${random.randint(50000, 5000000):,}",
                          200, text_color, ink_color, tier)
    y = _draw_label_value(c, 55, y, "Effective Date:",
                          _random_date(),
                          200, text_color, ink_color, tier)
    y -= 8

    # Section 5 — Certification & Signature
    y = _draw_section_header(
        c, y, "SECTION 5: CERTIFICATION AND SIGNATURE", text_color)
    cert_text = (
        "I hereby certify that the tangible personal property or services "
        "described above are being purchased for an exempt purpose. I "
        "understand that if the property or services are used for other "
        "purposes I am required to report and pay applicable sales or use "
        "tax. I further certify that this certificate is true and complete."
    )
    text_obj = c.beginText(55, y)
    text_obj.setFont("Helvetica", 7.5)
    text_obj.setFillColor(text_color)
    words = cert_text.split()
    line = ""
    for word in words:
        if len(line + " " + word) > 95:
            text_obj.textLine(line.strip())
            line = word
        else:
            line += " " + word
    if line.strip():
        text_obj.textLine(line.strip())
    c.drawText(text_obj)
    y -= 48

    # Signature block
    c.setStrokeColor(text_color)
    c.setLineWidth(0.5)
    c.line(55, y, 300, y)
    c.line(320, y, 555, y)
    c.setFillColor(ink_color)
    c.setFont("Courier-Oblique", 12)
    sig = _maybe_value(signer[0], tier)
    if sig:
        c.drawString(60, y + 5 + random.uniform(-1, 1), sig)
    date_val = _maybe_value(_random_date(), tier)
    if date_val:
        c.setFont("Courier-Oblique", 10)
        c.drawString(325, y + 5 + random.uniform(-1, 1), date_val)

    y -= 12
    c.setFillColor(text_color)
    c.setFont("Helvetica", 8)
    c.drawString(55, y, "Authorized Signature")
    c.drawString(320, y, "Date")
    y -= 20

    c.setStrokeColor(text_color)
    c.line(55, y, 300, y)
    c.line(320, y, 555, y)
    c.setFillColor(ink_color)
    c.setFont("Courier-Oblique", 10)
    c.drawString(60, y + 5, _maybe_value(signer[0], tier))
    c.drawString(325, y + 5, _maybe_value(signer[1], tier))

    y -= 12
    c.setFillColor(text_color)
    c.setFont("Helvetica", 8)
    c.drawString(55, y, "Printed Name")
    c.drawString(320, y, "Title")

    # Footer
    c.setFillColor(HexColor("#757575"))
    c.setFont("Helvetica", 7)
    c.drawCentredString(
        width / 2, 30,
        f"Form {state_abbr}-EX-LQ | State of {state_name} Dept. of Revenue | "
        f"Quality tier: {tier.upper()}")

    # Overlay noise last so it sits on top of content
    _add_noise(c, tier, width, height)

    c.save()


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Assign tiers to states: rotate through blue/green/yellow/red
    tier_cycle = ["blue", "green", "yellow", "red"]
    total = 0
    counts = {"blue": 0, "green": 0, "yellow": 0, "red": 0}

    for state_idx, (state_name, state_abbr) in enumerate(STATES):
        # Two forms per state — different tiers so we get 50 of each tier pair
        for form_idx in range(1, 3):
            tier = tier_cycle[(state_idx * 2 + form_idx - 1) % 4]
            filename = f"lq_tax_exemption_{state_abbr}_{form_idx:03d}_{tier}.pdf"
            filepath = os.path.join(OUTPUT_DIR, filename)
            create_low_quality_form(state_name, state_abbr,
                                    form_idx, tier, filepath)
            counts[tier] += 1
            total += 1
            if total % 10 == 0:
                print(f"  Generated {total}/100 low-quality forms...")

    print(f"\nDone! Generated {total} low-quality forms in {OUTPUT_DIR}")
    print(f"  Blue   (clean):            {counts['blue']}")
    print(f"  Green  (slight degrade):   {counts['green']}")
    print(f"  Yellow (moderate degrade): {counts['yellow']}")
    print(f"  Red    (heavy degrade):    {counts['red']}")


if __name__ == "__main__":
    main()

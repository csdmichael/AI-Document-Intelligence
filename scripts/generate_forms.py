"""
Generate 100 Tax Exemption PDF forms (2 per US state) with simulated handwriting.
Forms are created for Garmin International, Inc. as the purchaser.
"""

import os
import sys
import random
import string
from datetime import datetime, timedelta
from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas
from faker import Faker

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from config import cfg

fake = Faker()
Faker.seed(42)
random.seed(42)

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)),
                          cfg.app.forms.output_dir)
FORMS_PER_STATE = cfg.app.forms.forms_per_state

# Customer info from config
CUSTOMER_NAME = cfg.app.forms.customer_name
CUSTOMER_DBA = cfg.app.forms.customer_dba
CUSTOMER_ADDRESS = cfg.app.forms.customer_address
CUSTOMER_CITY_STATE_ZIP = cfg.app.forms.customer_city_state_zip
CUSTOMER_PHONE = cfg.app.forms.customer_phone
CUSTOMER_EIN = cfg.app.forms.customer_ein

# All 50 US states with abbreviations
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

BLUE_INK = HexColor("#1a237e")
BLACK = HexColor("#000000")
LIGHT_GRAY = HexColor("#f5f5f5")
BORDER_GRAY = HexColor("#cccccc")

FORM_FONT = "Helvetica"
HANDWRITING_FONT = "Courier-Oblique"


def random_tax_id(state_abbr: str) -> str:
    """Generate a plausible state tax ID number."""
    prefix = state_abbr
    num = "".join(random.choices(string.digits, k=random.choice([7, 8, 9])))
    return f"{prefix}-{num}"


def random_ein() -> str:
    """Return customer EIN from config."""
    return CUSTOMER_EIN


def random_date_within_year() -> str:
    """Return a random date in the past year formatted as handwritten."""
    days_back = random.randint(1, 365)
    d = datetime.now() - timedelta(days=days_back)
    return d.strftime("%m/%d/%Y")


def draw_section_header(c: canvas.Canvas, y: float, title: str) -> float:
    """Draw a section header bar and return updated y position."""
    c.setFillColor(HexColor("#e3f2fd"))
    c.rect(50, y - 4, 510, 18, fill=True, stroke=False)
    c.setFillColor(BLACK)
    c.setFont(FORM_FONT + "-Bold", 10)
    c.drawString(55, y, title)
    return y - 24


def draw_label_value(c: canvas.Canvas, x: float, y: float,
                     label: str, value: str, label_width: int = 140) -> float:
    """Draw a form label in black and handwritten value in blue ink."""
    c.setFillColor(BLACK)
    c.setFont(FORM_FONT, 9)
    c.drawString(x, y, label)

    # Simulated handwriting: blue ink, oblique courier, slight vertical jitter
    c.setFillColor(BLUE_INK)
    c.setFont(HANDWRITING_FONT, 10)
    jitter = random.uniform(-0.5, 0.5)
    c.drawString(x + label_width, y + jitter, value)

    # Underline
    c.setStrokeColor(BORDER_GRAY)
    c.setLineWidth(0.5)
    c.line(x + label_width - 2, y - 2, x + 460 - x, y - 2)

    return y - 18


def draw_checkbox(c: canvas.Canvas, x: float, y: float,
                  label: str, checked: bool) -> float:
    """Draw a checkbox with label."""
    c.setStrokeColor(BLACK)
    c.setLineWidth(0.8)
    c.rect(x, y - 2, 10, 10, fill=False)

    if checked:
        c.setFillColor(BLUE_INK)
        c.setFont(HANDWRITING_FONT, 12)
        c.drawString(x + 1, y - 1, "X")

    c.setFillColor(BLACK)
    c.setFont(FORM_FONT, 9)
    c.drawString(x + 16, y, label)
    return y - 16


def generate_seller(state_name: str, state_abbr: str) -> dict:
    """Generate random seller info within the given state."""
    return {
        "name": fake.company(),
        "address": fake.street_address(),
        "city": fake.city(),
        "state": state_abbr,
        "zip": fake.zipcode_in_state(state_abbr=state_abbr),
        "phone": fake.phone_number(),
        "tax_id": random_tax_id(state_abbr),
    }


def create_tax_form(state_name: str, state_abbr: str,
                    form_index: int, output_path: str):
    """Create a single tax exemption certificate PDF."""
    c = canvas.Canvas(output_path, pagesize=letter)
    width, height = letter

    cert_number = f"{state_abbr}-{random.randint(100000, 999999)}"

    # --- Header ---
    c.setFillColor(HexColor("#1565c0"))
    c.rect(0, height - 90, width, 90, fill=True, stroke=False)

    c.setFillColor(HexColor("#ffffff"))
    c.setFont(FORM_FONT + "-Bold", 16)
    c.drawCentredString(width / 2, height - 35, f"STATE OF {state_name.upper()}")

    c.setFont(FORM_FONT + "-Bold", 13)
    c.drawCentredString(width / 2, height - 55, "SALES AND USE TAX EXEMPTION CERTIFICATE")

    c.setFont(FORM_FONT, 9)
    c.drawCentredString(width / 2, height - 72, f"Certificate No: {cert_number}")

    y = height - 110

    # --- Instructions ---
    c.setFillColor(BLACK)
    c.setFont(FORM_FONT, 7.5)
    c.drawString(50, y, "This certificate is to be completed by the purchaser and furnished to the seller. "
                        "The seller must retain this certificate for at least four years.")
    y -= 22

    # --- SECTION 1: Purchaser Information ---
    y = draw_section_header(c, y, "SECTION 1: PURCHASER INFORMATION")

    signer = random.choice(GARMIN_SIGNERS)

    y = draw_label_value(c, 55, y, "Company Name:", CUSTOMER_NAME)
    y = draw_label_value(c, 55, y, "DBA / Trade Name:", CUSTOMER_DBA)
    y = draw_label_value(c, 55, y, "Street Address:", CUSTOMER_ADDRESS)
    y = draw_label_value(c, 55, y, "City, State, ZIP:", CUSTOMER_CITY_STATE_ZIP)
    y = draw_label_value(c, 55, y, "Phone:", CUSTOMER_PHONE)
    y = draw_label_value(c, 55, y, "Contact Person:", signer[0])
    y = draw_label_value(c, 55, y, f"{state_name} Tax ID:", random_tax_id(state_abbr))
    y = draw_label_value(c, 55, y, "Federal EIN:", random_ein())
    y -= 8

    # --- SECTION 2: Seller Information ---
    y = draw_section_header(c, y, "SECTION 2: SELLER / VENDOR INFORMATION")

    seller = generate_seller(state_name, state_abbr)
    y = draw_label_value(c, 55, y, "Seller Name:", seller["name"])
    y = draw_label_value(c, 55, y, "Street Address:", seller["address"])
    y = draw_label_value(c, 55, y, "City, State, ZIP:", f"{seller['city']}, {seller['state']} {seller['zip']}")
    y = draw_label_value(c, 55, y, "Phone:", seller["phone"])
    y = draw_label_value(c, 55, y, f"{state_name} Tax ID:", seller["tax_id"])
    y -= 8

    # --- SECTION 3: Type of Exemption ---
    y = draw_section_header(c, y, "SECTION 3: TYPE OF EXEMPTION CLAIMED")

    chosen = random.choice(EXEMPTION_TYPES)
    col1_x, col2_x = 55, 310
    for i, etype in enumerate(EXEMPTION_TYPES):
        x = col1_x if i % 2 == 0 else col2_x
        if i % 2 == 0 and i > 0:
            y -= 0  # already decremented on odd
        y_pos = y if i % 2 == 0 else y + 16
        draw_checkbox(c, x, y_pos, etype, etype == chosen)
        if i % 2 == 1:
            y -= 0
        else:
            y -= 16
    y -= 10

    # --- SECTION 4: Description of Property ---
    y = draw_section_header(c, y, "SECTION 4: DESCRIPTION OF TANGIBLE PERSONAL PROPERTY")

    desc = random.choice(PRODUCT_DESCRIPTIONS)
    c.setFillColor(BLACK)
    c.setFont(FORM_FONT, 8)
    c.drawString(55, y, "Describe the tangible personal property or services to be purchased tax-exempt:")
    y -= 16

    c.setFillColor(BLUE_INK)
    c.setFont(HANDWRITING_FONT, 10)
    # Word-wrap the description
    words = desc.split()
    line = ""
    for word in words:
        if len(line + " " + word) > 70:
            c.drawString(55, y + random.uniform(-0.5, 0.5), line.strip())
            y -= 14
            line = word
        else:
            line += " " + word
    if line.strip():
        c.drawString(55, y + random.uniform(-0.5, 0.5), line.strip())
        y -= 14

    y -= 6

    # Additional fields
    c.setFillColor(BLACK)
    c.setFont(FORM_FONT, 9)
    y = draw_label_value(c, 55, y, "Estimated Annual Purchases ($):",
                         f"${random.randint(50000, 5000000):,}")
    y = draw_label_value(c, 55, y, "Effective Date:",
                         random_date_within_year())
    y -= 8

    # --- SECTION 5: Certification & Signature ---
    y = draw_section_header(c, y, "SECTION 5: CERTIFICATION AND SIGNATURE")

    c.setFillColor(BLACK)
    c.setFont(FORM_FONT, 7.5)
    cert_text = (
        "I hereby certify that the tangible personal property or services described above are being "
        "purchased for an exempt purpose as described in the applicable state tax code. I understand "
        "that if the property or services are used for purposes other than those stated, I am required "
        "to report and pay the applicable state and local sales or use tax. I further certify that "
        "this certificate is true and complete to the best of my knowledge and belief."
    )
    # Simple word wrap for certification text
    text_obj = c.beginText(55, y)
    text_obj.setFont(FORM_FONT, 7.5)
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
    y -= 50

    # Signature block
    c.setStrokeColor(BLACK)
    c.setLineWidth(0.5)
    c.line(55, y, 300, y)
    c.line(320, y, 555, y)

    c.setFillColor(BLUE_INK)
    c.setFont(HANDWRITING_FONT, 12)
    # Simulate signature with stylized name
    sig_name = signer[0]
    c.drawString(60, y + 5 + random.uniform(-1, 1), sig_name)

    # Date
    c.setFont(HANDWRITING_FONT, 10)
    c.drawString(325, y + 5 + random.uniform(-1, 1), random_date_within_year())

    y -= 12
    c.setFillColor(BLACK)
    c.setFont(FORM_FONT, 8)
    c.drawString(55, y, "Authorized Signature")
    c.drawString(320, y, "Date")
    y -= 20

    c.setStrokeColor(BLACK)
    c.line(55, y, 300, y)
    c.line(320, y, 555, y)

    c.setFillColor(BLUE_INK)
    c.setFont(HANDWRITING_FONT, 10)
    c.drawString(60, y + 5, signer[0])
    c.drawString(325, y + 5, signer[1])

    y -= 12
    c.setFillColor(BLACK)
    c.setFont(FORM_FONT, 8)
    c.drawString(55, y, "Printed Name")
    c.drawString(320, y, "Title")

    # --- Footer ---
    c.setFillColor(HexColor("#757575"))
    c.setFont(FORM_FONT, 7)
    c.drawCentredString(width / 2, 30,
                        f"Form {state_abbr}-EX | State of {state_name} Department of Revenue | "
                        f"This form must be kept on file by the seller for audit purposes.")

    c.save()


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    total = 0
    for state_name, state_abbr in STATES:
        for idx in range(1, FORMS_PER_STATE + 1):
            filename = f"tax_exemption_{state_abbr}_{idx:03d}.pdf"
            filepath = os.path.join(OUTPUT_DIR, filename)
            create_tax_form(state_name, state_abbr, idx, filepath)
            total += 1
            if total % 10 == 0:
                print(f"  Generated {total}/100 forms...")

    print(f"\nDone! Generated {total} tax exemption forms in {OUTPUT_DIR}")


if __name__ == "__main__":
    main()

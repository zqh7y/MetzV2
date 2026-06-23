"""Send 4-digit email verification codes via Gmail SMTP."""

import os
import random
import smtplib
from email.mime.text import MIMEText

GMAIL_ADDRESS = os.environ.get("GMAIL_ADDRESS", "")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD", "")


def generate_verification_code():
    return f"{random.randint(0, 9999):04d}"


def send_verification_email(to_email, code):
    """Email the verification code to the user. Falls back to console output
    if Gmail credentials aren't configured (e.g. local development)."""
    if not GMAIL_ADDRESS or not GMAIL_APP_PASSWORD:
        print(f"[Metz] Verification code for {to_email}: {code}", flush=True)
        return

    msg = MIMEText(
        f"Your Metz verification code is: {code}\n\n"
        "Enter this code to finish creating your account. "
        "This code expires in 10 minutes."
    )
    msg["Subject"] = "Your Metz verification code"
    msg["From"] = GMAIL_ADDRESS
    msg["To"] = to_email

    with smtplib.SMTP("smtp.gmail.com", 587) as server:
        server.starttls()
        server.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
        server.send_message(msg)

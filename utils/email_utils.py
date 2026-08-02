"""Send 4-digit email verification codes via Gmail SMTP."""

import os
import random
import smtplib
from email.mime.text import MIMEText

GMAIL_ADDRESS = os.environ.get("GMAIL_ADDRESS", "")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD", "")

DEV_MODE = os.environ.get("FLASK_ENV", "production").lower() == "development"

# Gmail can sit on a connection for a long time when something upstream is
# wrong. Without a bound the signup request hangs until the host's own timeout
# kills it, and the caller sees nothing at all.
SMTP_TIMEOUT_SECONDS = 20


class EmailNotSent(Exception):
    """A verification code could not be delivered.

    Callers must handle this. Signing up creates the Firebase account *before*
    the code goes out, so an address whose code never arrives is left unable to
    verify and unable to sign up again — telling the person straight away is
    the only outcome that leaves them somewhere to go.
    """


def generate_verification_code():
    return f"{random.randint(0, 9999):04d}"


def send_verification_email(to_email, code):
    """Email the verification code. Raises EmailNotSent if it could not go out.

    With no mail credentials, development prints the code to the console, which
    is what makes a local signup completable without a Gmail account.

    Production must never take that path. It used to: the same silent fallback
    ran wherever the variables were unset, so a deployment missing them printed
    every code into a server log nobody was reading while the API cheerfully
    answered "pending_verification". Nothing was broken and nothing arrived.
    """
    if not GMAIL_ADDRESS or not GMAIL_APP_PASSWORD:
        if DEV_MODE:
            print(f"[Metz] Verification code for {to_email}: {code}", flush=True)
            return
        raise EmailNotSent(
            "GMAIL_ADDRESS and GMAIL_APP_PASSWORD are not set on this host, so "
            "no verification email can be sent."
        )

    msg = MIMEText(
        f"Your Metz verification code is: {code}\n\n"
        "Enter this code to finish creating your account. "
        "This code expires in 10 minutes."
    )
    msg["Subject"] = "Your Metz verification code"
    msg["From"] = GMAIL_ADDRESS
    msg["To"] = to_email

    try:
        with smtplib.SMTP("smtp.gmail.com", 587, timeout=SMTP_TIMEOUT_SECONDS) as server:
            server.starttls()
            server.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
            server.send_message(msg)
    except (smtplib.SMTPException, OSError) as exc:
        # A revoked app password, a blocked port, or Gmail refusing the login
        # all land here. The detail goes to the host's log; the caller only
        # needs to know it did not arrive.
        raise EmailNotSent(f"{type(exc).__name__}: {exc}") from exc

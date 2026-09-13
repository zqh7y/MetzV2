"""Send 4-digit email verification codes.

Two ways out, because the obvious one does not work everywhere.

SMTP is the simple option and it is what this used exclusively. On Render it
cannot work at all: outbound connections on the mail ports are blocked, so
smtplib never reaches smtp.gmail.com and the attempt dies as
`OSError: [Errno 101] Network is unreachable` — nothing to do with the account
or the app password, which is what makes it such a confusing failure. Hosts
blocking SMTP to stop spam are the rule rather than the exception.

An HTTP mail API goes out over ordinary HTTPS, which nobody blocks. So when an
API key is configured that is used, and SMTP stays for laptops and for hosts
where it is allowed.
"""

import os
import random
import smtplib
from email.mime.text import MIMEText

import requests

GMAIL_ADDRESS = os.environ.get("GMAIL_ADDRESS", "").strip()
# Google shows an app password as four groups of four — "abcd efgh ijkl mnop" —
# and it is copied and pasted exactly like that. SMTP AUTH does not want the
# spaces, so a correctly copied password fails to log in and the only symptom is
# the same "couldn't send your verification email" as having set nothing at all.
# Stripped here rather than left as an instruction nobody will find again.
GMAIL_APP_PASSWORD = "".join(os.environ.get("GMAIL_APP_PASSWORD", "").split())

# The HTTPS path. Needed on any host that blocks SMTP, which includes Render.
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "").strip()

# Who the code appears to come from.
#
# Not defaulted to GMAIL_ADDRESS, which is the mistake this line used to make.
# A Gmail address is the right sender over SMTP — Gmail is the one sending it —
# and is the one thing Resend can never accept, because sending as gmail.com
# would mean claiming a domain you do not own. A host with both configured
# therefore failed every send until MAIL_FROM was set by hand.
#
# Their onboarding sender needs no domain at all, so a deployment can send real
# codes on the day it is set up. Set MAIL_FROM once a domain is verified.
RESEND_DEFAULT_FROM = "Metz <onboarding@resend.dev>"
MAIL_FROM = os.environ.get("MAIL_FROM", "").strip()

DEV_MODE = os.environ.get("FLASK_ENV", "production").lower() == "development"

# Gmail can sit on a connection for a long time when something upstream is
# wrong. Without a bound the signup request hangs until the host's own timeout
# kills it, and the caller sees nothing at all.
SMTP_TIMEOUT_SECONDS = 20
HTTP_TIMEOUT_SECONDS = 15

SUBJECT = "Your Metz verification code"


class EmailNotSent(Exception):
    """A verification code could not be delivered.

    Callers must handle this. Signing up creates the Firebase account *before*
    the code goes out, so an address whose code never arrives is left unable to
    verify and unable to sign up again — telling the person straight away is
    the only outcome that leaves them somewhere to go.
    """


def generate_verification_code():
    return f"{random.randint(0, 9999):04d}"


def _body(code):
    return (
        f"Your Metz verification code is: {code}\n\n"
        "Enter this code to finish creating your account. "
        "This code expires in 10 minutes."
    )


def _send_via_resend(to_email, code):
    """Hand the message to Resend over HTTPS."""
    try:
        resp = requests.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "from": MAIL_FROM or RESEND_DEFAULT_FROM,
                "to": [to_email],
                "subject": SUBJECT,
                "text": _body(code),
            },
            timeout=HTTP_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        raise EmailNotSent(f"{type(exc).__name__}: {exc}") from exc

    if resp.status_code >= 300:
        # The body carries the reason — an unverified sending domain is the
        # usual one — and it goes to the host's log rather than to the caller,
        # who only needs to know it did not arrive.
        raise EmailNotSent(f"Resend returned {resp.status_code}: {resp.text[:300]}")


def _send_via_smtp(to_email, code):
    """The original path, for laptops and hosts that permit outbound SMTP."""
    msg = MIMEText(_body(code))
    msg["Subject"] = SUBJECT
    # Gmail will only send as the account that authenticated, so the address is
    # not configurable here the way it is for the API.
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


def send_verification_email(to_email, code):
    """Email the verification code. Raises EmailNotSent if it could not go out.

    The HTTPS API wins when it is configured, because a host where both are set
    is a host where SMTP may still be blocked, and there is no reason to find
    that out one signup at a time.

    With no mail configuration at all, development prints the code to the
    console, which is what makes a local signup completable without any mail
    account. Production must never take that path. It used to: the same silent
    fallback ran wherever the variables were unset, so a deployment missing
    them printed every code into a server log nobody was reading while the API
    cheerfully answered "pending_verification". Nothing was broken and nothing
    arrived.
    """
    if RESEND_API_KEY:
        _send_via_resend(to_email, code)
        return

    if GMAIL_ADDRESS and GMAIL_APP_PASSWORD:
        _send_via_smtp(to_email, code)
        return

    if DEV_MODE:
        print(f"[Metz] Verification code for {to_email}: {code}", flush=True)
        return

    raise EmailNotSent(
        "No mail is configured on this host. Set RESEND_API_KEY (needed on "
        "hosts that block SMTP, which includes Render), or GMAIL_ADDRESS and "
        "GMAIL_APP_PASSWORD where outbound SMTP is allowed."
    )

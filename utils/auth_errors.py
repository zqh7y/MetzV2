"""Translate raw Firebase Auth REST error codes into user-friendly messages."""

_FRIENDLY_MESSAGES = {
    "EMAIL_EXISTS": "An account with this email already exists. Try logging in instead.",
    "EMAIL_NOT_FOUND": "We couldn't find an account with that email.",
    "INVALID_PASSWORD": "Incorrect password. Please try again.",
    "INVALID_LOGIN_CREDENTIALS": "Incorrect email or password. Please try again.",
    "USER_DISABLED": "This account has been disabled. Contact support for help.",
    "INVALID_EMAIL": "That email address doesn't look right. Please check and try again.",
    "MISSING_PASSWORD": "Please enter your password.",
    "MISSING_EMAIL": "Please enter your email address.",
    "WEAK_PASSWORD": "Your password is too weak — it must be at least 6 characters.",
    "TOO_MANY_ATTEMPTS_TRY_LATER": "Too many attempts. Please wait a few minutes and try again.",
}


def friendly_auth_error(raw_message):
    """Map a raw Firebase error message/code to a friendly, user-readable one."""
    if not raw_message:
        return "Something went wrong. Please try again."

    code = raw_message.split(":")[0].strip()
    return _FRIENDLY_MESSAGES.get(code, "Something went wrong. Please check your details and try again.")

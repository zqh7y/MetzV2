"""Compare every translation against en.js and report the gaps.

    python mobile/app/tools/check_locales.py

en.js is the source of truth. A key missing from a translation is not a crash —
translate() falls back to English — but it is a screen with one English word on
it, which is exactly the "half-finished" look this is meant to catch before a
user does. Run it after touching any catalog.

Three things are checked:
  * keys present in en.js but missing from a translation,
  * keys in a translation that no longer exist in en.js (dead weight),
  * {placeholders} that do not match, which is the failure that actually
    breaks a string — "{count} going" translated without {count} silently
    drops the number.

Plural families are compared by base key, because each language legitimately
uses a different set of categories: Russian needs _few and _many where English
only has _one and _other, and requiring them to match one-for-one would flag
correct translations.
"""

import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
LOCALES = os.path.join(os.path.dirname(HERE), "src", "i18n", "locales")

# The categories index.js knows about; anything ending in one of these is one
# member of a plural family rather than a key in its own right.
CATEGORIES = ("_zero", "_one", "_two", "_few", "_many", "_other")

KEY_RE = re.compile(r'^\s{2}"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*$')
PLACEHOLDER_RE = re.compile(r"\{(\w+)\}")


def load(code):
    """Parse a catalog without a JS engine — the files are deliberately flat."""
    path = os.path.join(LOCALES, code + ".js")
    out = {}
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            match = KEY_RE.match(line.rstrip("\n"))
            if match:
                out[match.group(1)] = match.group(2)
    return out


def base(key):
    for suffix in CATEGORIES:
        if key.endswith(suffix):
            return key[: -len(suffix)]
    return key


def families(catalog):
    return {base(k) for k in catalog}


def main():
    english = load("en")
    if not english:
        sys.exit("could not read any keys out of en.js — has the format changed?")
    print("en: %d keys, %d families" % (len(english), len(families(english))))

    codes = sorted(
        f[:-3] for f in os.listdir(LOCALES) if f.endswith(".js") and f != "en.js"
    )

    failed = False
    for code in codes:
        catalog = load(code)
        missing = sorted(families(english) - families(catalog))
        extra = sorted(families(catalog) - families(english))

        # A translation may legitimately split a key into plural forms, so
        # placeholders are checked against whichever English member exists.
        bad_placeholders = []
        for key, value in sorted(catalog.items()):
            source = english.get(key) or english.get(base(key)) or english.get(base(key) + "_other")
            if source is None:
                continue
            want = set(PLACEHOLDER_RE.findall(source))
            got = set(PLACEHOLDER_RE.findall(value))

            # An extra placeholder is always a typo — it renders literally.
            problem = bool(got - want)

            # A *dropped* one is only a problem outside a plural family. Hebrew
            # "אתמול" for daysAgo_one and "יומיים" for _two are correct
            # translations that carry the number inside the word; demanding a
            # {count} there would force the wrong wording.
            if want - got and key == base(key):
                problem = True

            if problem:
                bad_placeholders.append((key, sorted(want), sorted(got)))

        status = "ok" if not (missing or extra or bad_placeholders) else "PROBLEMS"
        print("\n%s: %d keys — %s" % (code, len(catalog), status))
        if missing:
            print("  missing %d:" % len(missing))
            for key in missing:
                print("    - %s   (en: %r)" % (key, english.get(key, english.get(key + "_other", ""))[:60]))
        if extra:
            print("  not in en.js %d: %s" % (len(extra), ", ".join(extra)))
        for key, want, got in bad_placeholders:
            print("  placeholder mismatch %s: expected %s, found %s" % (key, want, got))

        if missing or extra or bad_placeholders:
            failed = True

    print()
    if failed:
        sys.exit("some catalogs are incomplete")
    print("every catalog matches en.js")


if __name__ == "__main__":
    main()

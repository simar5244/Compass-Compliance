"""The Privacy module's check list, in the exact order it is presented.

These come from the response-header checks (HSTS, CSP, cookie flags) and the
per-page privacy checks. None map to a WCAG criterion.
"""

from __future__ import annotations

from app.audit.content_check_set import ContentCheck as ModuleCheck

PrivacyCheck = ModuleCheck

PRIVACY_CHECKS: tuple[PrivacyCheck, ...] = (
    PrivacyCheck("privacy-policy-link", "Link every page to a privacy policy", None, "Audit"),
    PrivacyCheck("privacy_enhanced", "Enable enhanced privacy where possible", None, "Security"),
    PrivacyCheck("cookie-consent", "Add a cookie disclaimer to every page", None, "Consent"),
    PrivacyCheck("cookie_ssl", "Ensure cookies are only sent over SSL", None, "Security"),
    PrivacyCheck("csp_missing", "Specify a Content Security Policy for all pages", None, "Security"),
    PrivacyCheck("hsts", "Use Strict Transport Security for all pages", None, "Security"),
    PrivacyCheck("technology_privacy", "Review privacy of technologies used", None, "Audit"),
    # Reviewing what the site publishes about people is audit work.
    PrivacyCheck("form_data_review", "Review data collected and stored via forms", None, "Audit"),
    PrivacyCheck("phone_numbers_exposed", "Review publicly visible phone numbers", None, "Audit"),
    PrivacyCheck("email_addresses_exposed", "Review publicly visible email addresses", None, "Audit"),
)

PRIVACY_CHECK_ORDER: tuple[str, ...] = tuple(c.rule_id for c in PRIVACY_CHECKS)
PRIVACY_CHECK_BY_ID: dict[str, PrivacyCheck] = {c.rule_id: c for c in PRIVACY_CHECKS}


def privacy_rank(rule_id: str) -> int:
    """Position in the presented order; unlisted ids sort last."""
    try:
        return PRIVACY_CHECK_ORDER.index(rule_id)
    except ValueError:
        return len(PRIVACY_CHECK_ORDER)

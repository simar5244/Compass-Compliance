"""Ordered check lists for TTU-specific platform categories."""

from app.audit.content_check_set import ContentCheck as ModuleCheck

TTU_COMPLIANCE_CHECKS = tuple(ModuleCheck(*values) for values in (
    ("accessibility_statement_present", "Link to accessibility statement from every page", None, "ADA / Section 508"),
    ("accessibility_statement_contact", "Accessibility statement includes contact information", None, "ADA / Section 508"),
    ("alternative_format_process", "Alternative format request process is clear", None, "ADA / Section 508"),
    ("ferpa_student_id_exposure", "Potential student ID number exposure", None, "FERPA"),
    ("ferpa_grade_exposure", "Potential grade or academic record exposure", None, "FERPA"),
    ("ferpa_directory_info", "Review publicly visible directory information", None, "FERPA"),
    ("sb17_context_aware", "Senate Bill 17 — context-aware policy detection", None, "Senate Bill 17"),
    ("emergency_info_linked", "Link to TTU emergency procedures from every page", None, "Emergency Info"),
    ("emergency_contact_present", "Emergency contact numbers accessible", None, "Emergency Info"),
    ("stale_content", "Page content may be outdated", None, "Content Health"),
    ("outdated_year_reference", "Outdated year references detected", None, "Content Health"),
    ("former_staff_reference", "Review staff/faculty references for accuracy", None, "Content Health"),
))
TTU_COMPLIANCE_CHECK_ORDER = tuple(check.rule_id for check in TTU_COMPLIANCE_CHECKS)

BRAND_STANDARDS_CHECKS = tuple(ModuleCheck(*values) for values in (
    ("brand_unapproved_colors", "Unapproved brand colors detected", None, "Colors"),
    ("brand_unapproved_fonts", "Unapproved font families detected", None, "Typography"),
    ("brand_logo_present", "TTU logo must appear on every page", None, "Logo Usage"),
    ("brand_button_consistency", "Button styles should match TTU design system", None, "Buttons & Components"),
    ("brand_cms_detected", "CMS detected — brand fixes available with specific instructions", None, "CMS Integration"),
))
BRAND_STANDARDS_CHECK_ORDER = tuple(check.rule_id for check in BRAND_STANDARDS_CHECKS)

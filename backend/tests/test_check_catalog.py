from app.audit.check_catalog import CHECK_CATALOG


def test_check_catalog_rule_ids_are_unique() -> None:
    rule_ids = [entry.rule_id for entry in CHECK_CATALOG]

    assert len(rule_ids) == len(set(rule_ids))
    assert rule_ids.count("cookie-consent") == 1

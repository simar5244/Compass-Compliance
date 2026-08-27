"""Crawl scope: a site is its host *and* the path it is rooted at.

Scoping on the registrable domain alone made a crawl of
https://www.depts.ttu.edu/k12/ wander across 73 hosts of ttu.edu.
"""

from app.crawl.normalize import is_in_scope, is_same_site

ROOT = "https://www.depts.ttu.edu/k12/"


def test_pages_under_the_root_path_are_in_scope():
    assert is_in_scope("https://www.depts.ttu.edu/k12/", ROOT)
    assert is_in_scope("https://www.depts.ttu.edu/k12", ROOT)
    assert is_in_scope("https://www.depts.ttu.edu/k12/about/", ROOT)
    assert is_in_scope("https://www.depts.ttu.edu/k12/enroll/index.html", ROOT)
    assert is_in_scope("/k12/contact", ROOT) is False  # relative URLs must be resolved first


def test_sibling_hosts_on_the_same_domain_are_out_of_scope():
    for url in (
        "https://www.ttu.edu/",
        "http://raiderlink.ttu.edu/",
        "https://eraider.ttu.edu/login",
        "https://www.provost.ttu.edu/",
    ):
        assert is_same_site(url, ROOT), "same registrable domain"
        assert not is_in_scope(url, ROOT), f"{url} should not be crawled"


def test_other_sections_of_the_same_host_are_out_of_scope():
    assert not is_in_scope("https://www.depts.ttu.edu/", ROOT)
    assert not is_in_scope("https://www.depts.ttu.edu/biology/", ROOT)
    # A path that merely starts with the same characters is not a child path.
    assert not is_in_scope("https://www.depts.ttu.edu/k12extra/", ROOT)


def test_www_and_bare_host_are_the_same_site():
    assert is_in_scope("https://depts.ttu.edu/k12/about", ROOT)
    assert is_in_scope("https://www.depts.ttu.edu/k12/about", "https://depts.ttu.edu/k12/")


def test_a_root_path_covers_the_whole_host():
    root = "https://example.com/"
    assert is_in_scope("https://example.com/anything/deep", root)
    assert not is_in_scope("https://other.example.com/", root)


def test_external_domains_stay_out():
    assert not is_in_scope("https://google.com/", ROOT)
    assert not is_in_scope("https://ttu.edu.evil.com/k12/", ROOT)

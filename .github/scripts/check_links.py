"""Fail if a link between the site's pages, or an ARIA reference, points at a
file or id that doesn't exist, or if a page's header or footer differs from the
others'. The pages have no build step, so the shared header and footer are
copied into each one; only aria-current may differ. The blog's post template
is held to the same header and footer.

Usage: check_links.py
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
pages = {
    p.relative_to(ROOT).as_posix(): p.read_text(encoding="utf-8")
    for p in sorted([*ROOT.glob("*.html"), *ROOT.glob("blog/*.html")])
}
TEMPLATE = ".github/blog/post-template.html"
template = (ROOT / TEMPLATE).read_text(encoding="utf-8")
ids = {}
problems = []
for name, html in pages.items():
    found = re.findall(r'\bid="([^"]+)"', html)
    ids[name] = set(found)
    for dup in sorted({i for i in found if found.count(i) > 1}):
        problems.append("%s: id %s appears more than once" % (name, dup))

for name, html in pages.items():
    for href in re.findall(r'\bhref="([^"]+)"', html):
        if re.match(r"[a-z]+:", href):
            continue
        path, _, frag = href.partition("#")
        path = path.split("?")[0]
        if path and not path.startswith("/"):
            path = (Path(name).parent / path).as_posix()
        path = path.lstrip("/")
        if path == "" or path.endswith("/"):
            path += "index.html"
        target = name if href.startswith("#") else path
        if not (ROOT / target).exists():
            problems.append("%s: %s points at a missing file" % (name, href))
        elif frag and target in ids and frag not in ids[target]:
            problems.append("%s: %s points at a missing id" % (name, href))
    for attr in ("aria-labelledby", "aria-describedby", "aria-controls", "for"):
        for value in re.findall(r'\b%s="([^"]+)"' % attr, html):
            for ref in value.split():
                if ref not in ids[name]:
                    problems.append("%s: %s names missing id %s" % (name, attr, ref))

# Pages the header nav doesn't list, so their header marks no link as current.
# Blog posts count: the nav lists the blog's index, not each post.
NOT_IN_NAV = {"404.html", "about.html", TEMPLATE}
NOT_IN_NAV |= {n for n in pages if n.startswith("blog/") and n != "blog/index.html"}

# Pages kept out of search and so out of the footer and the sitemap: the 404
# and the blog's unlisted style sample.
unlisted = {n for n, html in pages.items() if '<meta name="robots" content="noindex">' in html}


def url_path(name):
    return "/" + (name[: -len("index.html")] if name.endswith("index.html") else name)


shared = {}
for name, html in [*pages.items(), (TEMPLATE, template)]:
    for part in ("header", "footer"):
        m = re.search(r'<%s class="site-%s">.*?</%s>' % (part, part, part), html, re.S)
        if not m:
            problems.append("%s: no site %s" % (name, part))
            continue
        block = m.group(0)
        current = block.count('aria-current="page"')
        if part == "header" and current != (0 if name in NOT_IN_NAV else 1):
            problems.append("%s: the header marks %d links as the current page" % (name, current))
        block = block.replace(' aria-current="page"', "")
        first = shared.setdefault(part, (name, block))
        if block != first[1]:
            problems.append("%s: the %s differs from %s's" % (name, part, first[0]))

# Every page is in the nav's sitemap counterpart: the footer links them all.
footer = shared.get("footer", ("", ""))[1]
sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
for name in pages:
    if name in unlisted:
        if "<loc>https://getfelix.dev%s</loc>" % url_path(name) in sitemap:
            problems.append("sitemap.xml lists %s, which is noindex" % name)
        continue
    # Only top-level pages and the blog's index belong in the footer; posts don't.
    if ("/" not in name or name == "blog/index.html") and 'href="%s"' % url_path(name) not in footer:
        problems.append("footer does not link %s" % name)
    loc = "https://getfelix.dev" + url_path(name)
    if "<loc>%s</loc>" % loc not in sitemap:
        problems.append("sitemap.xml does not list %s" % loc)

for p in problems:
    print(p)
if problems:
    sys.exit(1)
print("Every internal link and ARIA reference resolves, and the header and footer match, on %d pages." % len(pages))

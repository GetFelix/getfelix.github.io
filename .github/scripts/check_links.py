"""Fail if a link between the site's pages, or an ARIA reference, points at a
file or id that doesn't exist, or if a page's header or footer differs from the
others'. The pages have no build step, so the shared header and footer are
copied into each one; only aria-current may differ.

Usage: check_links.py
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
pages = {p.name: p.read_text(encoding="utf-8") for p in sorted(ROOT.glob("*.html"))}
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
        path = path.split("?")[0].lstrip("/")
        target = name if href.startswith("#") else (path or "index.html")
        if not (ROOT / target).exists():
            problems.append("%s: %s points at a missing file" % (name, href))
        elif frag and target in ids and frag not in ids[target]:
            problems.append("%s: %s points at a missing id" % (name, href))
    for attr in ("aria-labelledby", "aria-describedby", "aria-controls", "for"):
        for value in re.findall(r'\b%s="([^"]+)"' % attr, html):
            for ref in value.split():
                if ref not in ids[name]:
                    problems.append("%s: %s names missing id %s" % (name, attr, ref))

shared = {}
for name, html in pages.items():
    for part in ("header", "footer"):
        m = re.search(r'<%s class="site-%s">.*?</%s>' % (part, part, part), html, re.S)
        if not m:
            problems.append("%s: no site %s" % (name, part))
            continue
        block = m.group(0)
        current = block.count('aria-current="page"')
        if part == "header" and current != (0 if name == "404.html" else 1):
            problems.append("%s: the header marks %d links as the current page" % (name, current))
        block = block.replace(' aria-current="page"', "")
        first = shared.setdefault(part, (name, block))
        if block != first[1]:
            problems.append("%s: the %s differs from %s's" % (name, part, first[0]))

# Every page is in the nav's sitemap counterpart: the footer links them all.
footer = shared.get("footer", ("", ""))[1]
for name in pages:
    if name == "404.html":
        continue
    href = "/" if name == "index.html" else "/" + name
    if 'href="%s"' % href not in footer:
        problems.append("footer does not link %s" % name)
sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
for name in pages:
    if name == "404.html":
        continue
    loc = "https://getfelix.dev/" + ("" if name == "index.html" else name)
    if "<loc>%s</loc>" % loc not in sitemap:
        problems.append("sitemap.xml does not list %s" % loc)

for p in problems:
    print(p)
if problems:
    sys.exit(1)
print("Every internal link and ARIA reference resolves, and the header and footer match, on %d pages." % len(pages))

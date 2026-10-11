"""Fail if a link between the site's pages, or an ARIA reference, points at a
file or id that doesn't exist.

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

for p in problems:
    print(p)
if problems:
    sys.exit(1)
print("Every internal link and ARIA reference resolves on %d pages." % len(pages))

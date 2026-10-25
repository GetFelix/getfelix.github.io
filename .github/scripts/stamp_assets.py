#!/usr/bin/env python3
"""Give every /assets/<file>?v=<key> in the built HTML the file's content key.

Zola templates get theirs from get_hash (templates/components.html); the pages
under static/ are copied as written, so their keys went stale whenever an
asset changed and browsers kept the old stylesheet. Same key: the first eight
hex digits of the file's SHA-256.
"""
import hashlib
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "public")
pattern = re.compile(r'(/assets/([A-Za-z0-9._/-]+))\?v=[0-9a-zA-Z]*')
keys = {}


def key(name):
    if name not in keys:
        keys[name] = hashlib.sha256((root / "assets" / name).read_bytes()).hexdigest()[:8]
    return keys[name]


changed = 0
for page in root.rglob("*.html"):
    if not page.is_file():
        continue
    text = page.read_text(encoding="utf-8")
    stamped = pattern.sub(lambda m: f"{m.group(1)}?v={key(m.group(2))}", text)
    if stamped != text:
        page.write_text(stamped, encoding="utf-8")
        changed += 1
print(f"stamped asset keys in {changed} page(s)")

"""Point index.html at a Felix release.

Usage: release_version.py <tag> <published-at>

<tag> is a release tag such as v0.6.0-preview.2 and <published-at> is the
release's ISO 8601 publish time from `gh release list --json publishedAt`.
The page marks what this rewrites, so nothing else is touched:

  <!--felix:version-->X<!--/felix:version-->   every place the version is shown
  <!--felix:date-->X<!--/felix:date-->         the release date in the hero
  data-felix-release href="..."                the hero's link to the release
  <script type="application/ld+json">          its softwareVersion

Exits 1 if any marker is missing, so a page edit that drops one fails loudly.
"""

import datetime
import json
import re
import sys
from pathlib import Path

PAGE = Path(__file__).resolve().parents[2] / "index.html"


def replace_marked(html, name, value):
    pattern = re.compile(r"(<!--felix:%s-->).*?(<!--/felix:%s-->)" % (name, name), re.S)
    html, n = pattern.subn(lambda m: m.group(1) + value + m.group(2), html)
    if n == 0:
        sys.exit("no felix:%s marker in %s" % (name, PAGE))
    return html


def main():
    tag, published_at = sys.argv[1], sys.argv[2]
    version = tag[1:] if tag.startswith("v") else tag
    when = datetime.datetime.fromisoformat(published_at.replace("Z", "+00:00"))
    date = "%d %s" % (when.day, when.strftime("%B %Y"))

    html = PAGE.read_text(encoding="utf-8")
    html = replace_marked(html, "version", version)
    html = replace_marked(html, "date", date)

    link = re.compile(r'(<a\b[^>]*\bdata-felix-release\b[^>]*\bhref=")[^"]*(")')
    url = "https://github.com/GetFelix/felix/releases/tag/" + tag
    html, n = link.subn(lambda m: m.group(1) + url + m.group(2), html)
    if n != 1:
        sys.exit("expected one data-felix-release link, found %d" % n)

    ld = re.compile(r'(<script type="application/ld\+json">\n)(.*?)(\n</script>)', re.S)
    match = ld.search(html)
    if not match:
        sys.exit("no JSON-LD block in %s" % PAGE)
    data = json.loads(match.group(2))
    data["softwareVersion"] = version
    body = json.dumps(data, indent=2, ensure_ascii=False)
    html = html[: match.start(2)] + body + html[match.end(2) :]

    PAGE.write_text(html, encoding="utf-8")
    print("%s, released %s" % (version, date))


if __name__ == "__main__":
    main()

"""Keep every version on index.html in step with GetFelix releases.

Usage:
  release_versions.py [--hold-felix-channel]   rewrite the markers from the newest releases
  release_versions.py --check                  fail if a version in the hero or a
                                               project card is outside a marker

The page marks what this rewrites, and the repos it reads come from the markers,
so adding a project means only adding markers:

  <!--release:REPO:version-->0.3.0<!--/release:REPO:version-->      the tag without its leading v
  <!--release:REPO:tag-->v0.3.0<!--/release:REPO:tag-->             the tag as published
  <!--release:REPO:date-->10 October 2026<!--/release:REPO:date-->  the publish date
  <a data-release="REPO" href="...">                                points at the release page

REPO is a repository in the GetFelix organization. The JSON-LD softwareVersion
follows the felix repo. For each repo the newest non-draft release by publish
time wins, prereleases included and any tag containing "nightly" excluded.

--hold-felix-channel leaves Felix alone when its newest release would move it
between a prerelease and a stable release, because the Get started install
commands are written for one or the other and need a person to change them.

Before moving a repo whose markers sit inside a release download URL, the asset
that URL would name must exist on the new release. If it does not, that repo is
left alone, the other repos are still updated, and the run exits 1.

When GITHUB_OUTPUT is set, writes changed=true|false and held=<felix tag or empty>.
"""

import datetime
import json
import os
import re
import subprocess
import sys
from pathlib import Path

PAGE = Path(__file__).resolve().parents[2] / "index.html"
ORG = "GetFelix"

MARKER = re.compile(
    r"(<!--release:([\w.-]+):(version|tag|date)-->)(.*?)(<!--/release:\2:\3-->)", re.S
)
LINK = re.compile(r'(<a\b[^>]*\bdata-release="([\w.-]+)"[^>]*\bhref=")([^"]*)(")')
LD = re.compile(r'(<script type="application/ld\+json">\n)(.*?)(\n</script>)', re.S)
VERSIONISH = re.compile(r"\bv?\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?\b")


def latest_release(repo):
    out = subprocess.run(
        ["gh", "release", "list", "-R", "%s/%s" % (ORG, repo), "--exclude-drafts",
         "--limit", "50", "--json", "tagName,publishedAt,isPrerelease"],
        check=True, capture_output=True, text=True,
    ).stdout
    releases = [r for r in json.loads(out) if "nightly" not in r["tagName"]]
    if not releases:
        sys.exit("%s/%s has no release, but index.html marks it" % (ORG, repo))
    return max(releases, key=lambda r: r["publishedAt"]), releases


def values(repo, release):
    tag = release["tagName"]
    when = datetime.datetime.fromisoformat(release["publishedAt"].replace("Z", "+00:00"))
    return {
        "tag": tag,
        "version": tag[1:] if tag.startswith("v") else tag,
        "date": "%d %s" % (when.day, when.strftime("%B %Y")),
        "url": "https://github.com/%s/%s/releases/tag/%s" % (ORG, repo, tag),
    }


def shown_versions(html):
    shown = {}
    for m in MARKER.finditer(html):
        if m.group(3) == "version":
            shown.setdefault(m.group(2), m.group(4))
    return shown


def is_prerelease(version, releases):
    for r in releases:
        if r["tagName"] in (version, "v" + version):
            return r["isPrerelease"]
    return "-" in version


def release_assets(repo, tag):
    out = subprocess.run(
        ["gh", "release", "view", tag, "-R", "%s/%s" % (ORG, repo), "--json", "assets",
         "--jq", ".assets[].name"],
        check=True, capture_output=True, text=True,
    ).stdout
    return set(out.split())


def render(html, repo, v):
    return MARKER.sub(
        lambda m: m.group(1) + v[m.group(3)] + m.group(5) if m.group(2) == repo else m.group(0),
        html,
    )


def downloads(html, repo):
    """(tag, asset name) for every release download URL of repo on the page."""
    plain = MARKER.sub(lambda m: m.group(4), html)
    pattern = r"https://github\.com/%s/%s/releases/download/([^/\s\"<]+)/([^\s\"<|]+)" % (
        ORG, re.escape(repo))
    return set(re.findall(pattern, plain))


def update(hold_felix_channel):
    html = PAGE.read_text(encoding="utf-8")
    repos = sorted({m.group(2) for m in MARKER.finditer(html)} | {m.group(2) for m in LINK.finditer(html)})
    if not repos:
        sys.exit("no release markers in %s" % PAGE)
    shown = shown_versions(html)

    wanted, held = {}, ""
    for repo in repos:
        release, releases = latest_release(repo)
        v = values(repo, release)
        if (
            hold_felix_channel
            and repo == "felix"
            and repo in shown
            and v["version"] != shown[repo]
            and release["isPrerelease"] != is_prerelease(shown[repo], releases)
        ):
            print("felix: holding %s, it changes the release channel" % v["tag"])
            held = v["tag"]
            continue
        wanted[repo] = v

    # A download URL that would point at an asset the release lacks keeps the
    # whole repo on its old release, so the version and the download never disagree.
    missing = []
    for repo in sorted(wanted):
        before = downloads(html, repo)
        after = downloads(render(html, repo, wanted[repo]), repo)
        for tag, name in sorted(after - before):
            if name not in release_assets(repo, tag):
                missing.append("%s %s has no asset %s; left %s on its current release"
                               % (repo, tag, name, repo))
                del wanted[repo]
                break

    changes = []

    def marker(m):
        repo, kind, old = m.group(2), m.group(3), m.group(4)
        if repo not in wanted:
            return m.group(0)
        new = wanted[repo][kind]
        if new != old:
            changes.append("%s %s: %s -> %s" % (repo, kind, old, new))
        return m.group(1) + new + m.group(5)

    def link(m):
        repo, old = m.group(2), m.group(3)
        if repo not in wanted:
            return m.group(0)
        new = wanted[repo]["url"]
        if new != old:
            changes.append("%s link: %s -> %s" % (repo, old, new))
        return m.group(1) + new + m.group(4)

    new_html = MARKER.sub(marker, html)
    new_html = LINK.sub(link, new_html)

    if "felix" in wanted:
        match = LD.search(new_html)
        if not match:
            sys.exit("no JSON-LD block in %s" % PAGE)
        data = json.loads(match.group(2))
        old = data.get("softwareVersion")
        data["softwareVersion"] = wanted["felix"]["version"]
        if old != data["softwareVersion"]:
            changes.append("felix JSON-LD: %s -> %s" % (old, data["softwareVersion"]))
        body = json.dumps(data, indent=2, ensure_ascii=False)
        new_html = new_html[: match.start(2)] + body + new_html[match.end(2) :]

    if new_html != html:
        PAGE.write_text(new_html, encoding="utf-8")
    for line in changes:
        print(line)
    if not changes:
        print("index.html already shows the newest releases: %s"
              % ", ".join("%s %s" % (r, wanted[r]["version"]) for r in sorted(wanted)))

    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write("changed=%s\nheld=%s\n" % ("true" if changes else "false", held))

    if missing:
        sys.exit("\n".join(missing))


def check():
    html = PAGE.read_text(encoding="utf-8")
    regions = []
    hero = re.search(r'<section class="hero".*?</section>', html, re.S)
    projects = re.search(r'<section[^>]*\bid="projects".*?</section>', html, re.S)
    if not hero or not projects:
        sys.exit("could not find the hero or the projects section in %s" % PAGE)
    regions.append(("hero", hero.group(0)))
    regions += [("project card", c) for c in re.findall(r"<article\b.*?</article>", projects.group(0), re.S)]

    problems = []
    for name, text in regions:
        text = MARKER.sub("", text)
        text = LINK.sub(lambda m: m.group(1) + m.group(4), text)
        # Versions in hrefs count; the rest of the markup (SVG paths) does not.
        hrefs = " ".join(re.findall(r'\bhref="([^"]*)"', text))
        visible = re.sub(r"<[^>]*>", " ", text)
        for found in VERSIONISH.findall(visible + " " + hrefs):
            problems.append("%s: %s is not inside a release marker" % (name, found))
    for p in problems:
        print(p)
    if problems:
        sys.exit("Wrap each version in <!--release:REPO:version-->, or see %s" % Path(__file__).name)
    print("Every version in the hero and the project cards is marked.")


def main():
    args = sys.argv[1:]
    if args == ["--check"]:
        check()
    elif args in ([], ["--hold-felix-channel"]):
        update(bool(args))
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()

#!/bin/sh
# Builds the site into public/. Zola writes a page with path "blog/x.html" as
# blog/x.html/index.html; this turns each back into the file blog/x.html so the
# old URLs are served at the same path rather than through a redirect.
set -eu
cd "$(dirname "$0")/../.."
zola build "$@"
# Zola also writes its own copy; the site loads /assets/elasticlunr.min.js.
rm -f public/elasticlunr.min.js
for d in public/blog/*.html; do
  [ -d "$d" ] || continue
  mv "$d/index.html" "$d.flat"
  rmdir "$d"
  mv "$d.flat" "$d"
done
# Pages under static/ are copied as written; give their asset URLs the same
# content keys the templates compute, so a changed stylesheet is fetched again.
python3 .github/scripts/stamp_assets.py public

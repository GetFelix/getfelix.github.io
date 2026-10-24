# getfelix.dev

The site for [Felix](https://github.com/GetFelix/felix). The blog is built with
[Zola](https://www.getzola.org/); every other page is a plain HTML file.

## Layout

| Path | What it is |
| --- | --- |
| `static/` | Copied to the site root as is: the pages (`index.html`, `features.html`, ...), `assets/`, icons, `CNAME`. `.github/scripts/release_versions.py` keeps the release markers in `static/index.html` and `static/projects.html` current. |
| `content/blog/` | One Markdown file per post, plus `_index.md` for the blog index. |
| `cards/` | The illustration shown on each post's card in the list. |
| `templates/` | The blog's page shell, header, footer, cards, feed and sitemap. |

## Preview

Install Zola (`brew install zola`; CI uses the version pinned in
`.github/workflows/pages.yml`), then:

```sh
zola serve
```

and open http://127.0.0.1:1111/blog/. To build the output that gets deployed,
including the `blog/<slug>.html` flattening, run `.github/scripts/build.sh` and then
`python3 .github/scripts/check_links.py`. The output is in `public/`.

## Writing a post

Create `content/blog/<slug>.md`. The slug is the URL: the post is served at
`/blog/<slug>.html`.

```toml
+++
title = "How we catch a 1% regression"
description = "One sentence. Shown under the title, on the card, in search and in the feed."
date = 2026-10-17
slug = "catching-a-one-percent-regression"
path = "blog/catching-a-one-percent-regression.html"

[taxonomies]
topics = ["performance", "testing"]

[extra]
read_minutes = 7
card = "cards/catching-a-one-percent-regression.svg"
+++
```

- `date` sets the order, the byline and the feed's `pubDate`. Posts that share a
  date are ordered by slug, descending.
- `path` must be `blog/<slug>.html`. Keep the `.html`: it is the address
  readers and the feed already use.
- `read_minutes` is the word count divided by 230, rounded.
- `topics` takes one to three names. Use the existing ones where they fit
  (architecture, compatibility, durability, networking, performance,
  replication, testing); a new name creates a topic page and a topic feed.
- `card` is an inline `<svg>` file for the list page: the post's first figure
  with `role`, `<title>` and `aria-labelledby` dropped, `aria-hidden="true"`
  added, and every `id` (and its `url(#...)` / `href="#..."` references)
  prefixed so ids stay unique on the list.

Write the body in Markdown: paragraphs, `##` and `###` headings, lists, links and
`` `code` ``. Headings get an id from their text; to keep a shorter one, write
`## Title {#short-id}`. Anything Markdown cannot express stays as raw HTML in the
file:

- Figures: `<figure class="fig ck">` with an inline SVG, and `class="fig ck wide"`
  for a figure wider than the text. The shared illustration colours and text
  styles are in `static/assets/ck.css`. Do not leave a blank line inside a raw
  HTML block; Markdown ends the block there.
- Highlighted code: `<pre class="code" tabindex="0"><code>` with `tok-*` spans
  (`class="code tla"` for TLA+). Plain fenced code blocks also work.
- Callouts and tables: `<aside class="callout">`, `<div class="table-wrap">`.

`content/style-sample.md` (served at `/blog/style-sample.html`, `noindex`, not in
the list, feed or sitemap) shows each of these.

The `<head>`, header, footer, topic chips, the feed and the sitemap come from the
templates, and asset URLs get their `?v=` cache key from the file's content.
Nothing else needs editing when a post is added.

## Search

The blog index searches title, summary and text in the browser, using Zola's
`search_index.en.js` and the vendored `static/assets/elasticlunr.min.js`
(elasticlunr 0.9.6, from
`https://cdnjs.cloudflare.com/ajax/libs/elasticlunr/0.9.6/elasticlunr.min.js`).
Both load when the search box is first focused.

## Deploy

`.github/workflows/pages.yml` builds the site on every push and pull request,
checks the links in the built output, and on `main` deploys it with
`actions/deploy-pages`. The repository's Pages source must be set to
"GitHub Actions".

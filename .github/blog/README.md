# Adding a blog post

Posts are plain HTML pages in `blog/`. There is no build step.

1. Copy `.github/blog/post-template.html` to `blog/<slug>.html`. Use a short,
   lowercase, hyphenated slug; it becomes the URL.
2. Replace `TITLE`, `ONE-LINE SUMMARY`, `SLUG` and the dates everywhere they
   appear: `<title>`, the description, the Open Graph and Twitter tags,
   `article:published_time`, the canonical link, `<h1>`, the dek and the byline.
   Set the reading time to the word count divided by 230, rounded.
3. Write the body inside `<div class="post-body">`. `blog/style-sample.html`
   shows every element (code with `tok-*` spans, TLA+, callouts, figures with
   inline SVG, tables); copy what you need. Give each `<h2>` a unique `id`.
4. Add the post to the top of `<ol class="post-list">` in `blog/index.html`:
   `<li><article class="post-card">` with `<p class="post-meta">` (the `<time>`
   and the reading time), an `<h2>` link and a one-line `<p>` summary.
5. Add an `<item>` to the top of `blog/feed.xml` (template in the comment
   there): title, link, `guid isPermaLink="true"`, an RFC 822 `pubDate` and the
   summary.
6. In `sitemap.xml`, add a `<url>` for the post and bump the blog index's
   `<lastmod>`.
7. Run `python3 .github/scripts/check_links.py`. It checks that the header and
   footer match every other page and that links resolve.

`blog/style-sample.html` is `noindex` and kept out of the list, the feed and
the sitemap. Delete it when the first real post lands.
If you change `assets/blog.css`, update its `?v=` (the first 8 hex digits of
its sha256) on every blog page and in the template.

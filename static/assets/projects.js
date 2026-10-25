// Copy buttons for the quick starts on projects.html.
(function () {
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    var label = btn.getAttribute("aria-label") || "Copy";
    btn.addEventListener("click", function () {
      var el = btn.parentElement.querySelector("code");
      if (!el || !navigator.clipboard || !navigator.clipboard.writeText) return;
      navigator.clipboard.writeText(el.textContent.trim()).then(function () {
        btn.setAttribute("aria-label", "Copied");
        btn.classList.add("copied");
        setTimeout(function () {
          btn.setAttribute("aria-label", label);
          btn.classList.remove("copied");
        }, 1600);
      }, function () {});
    });
  });
})();

// Each clip plays only while on screen. With reduced motion none of them
// load, and the posters stay. A clip with a twin for the other theme is
// hidden with display: none, so it never loads or plays until the theme
// shows it.
(function () {
  var videos = document.querySelectorAll("video.clip");
  if (!videos.length || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  function shown(video) {
    return video.getClientRects().length > 0;
  }
  function play(video) {
    if (!shown(video)) return;
    var at = video.resumeAt;
    if (at != null) {
      video.resumeAt = null;
      // A clip that has not loaded yet drops a seek, so wait for its metadata.
      if (video.readyState >= 1) video.currentTime = at;
      else video.addEventListener("loadedmetadata", function () { video.currentTime = at; }, { once: true });
    }
    video.preload = "auto";
    video.play().catch(function () {});
  }
  // A clip hidden by a theme switch hands its place to its twin, so the
  // other theme's clip picks up at the same moment.
  function stop(video) {
    if (!video.paused && !shown(video)) {
      var twin = Array.prototype.find.call(video.parentElement.querySelectorAll("video.clip"), function (v) {
        return v !== video && shown(v);
      });
      if (twin) twin.resumeAt = video.currentTime;
    }
    video.pause();
  }
  var observer = "IntersectionObserver" in window && new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) play(e.target);
      else stop(e.target);
    });
  }, { threshold: 0.25 });
  videos.forEach(function (video) {
    if (observer) observer.observe(video);
    else play(video);
  });

  // A theme switch does not always move a clip in or out of the viewport, so
  // check again: observing anew reports each clip's current visibility.
  function swap() {
    videos.forEach(function (video) {
      if (!shown(video)) stop(video);
    });
    videos.forEach(function (video) {
      if (!observer) return play(video);
      observer.unobserve(video);
      observer.observe(video);
    });
  }
  new MutationObserver(swap).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  var scheme = matchMedia("(prefers-color-scheme: dark)");
  if (scheme.addEventListener) scheme.addEventListener("change", swap);
})();

// Filter by type (one at a time) and tags (every one picked). Without JS the
// type chips are links to each group, and every project shows. The choice is
// kept in the URL so a filtered view can be shared.
(function () {
  var nav = document.querySelector(".project-filter");
  if (!nav) return;
  var projects = Array.prototype.slice.call(document.querySelectorAll(".project[data-type]"));
  var groups = Array.prototype.slice.call(document.querySelectorAll(".project-group"));
  var typeChips = nav.querySelectorAll("[data-filter-type]");
  var tagChips = nav.querySelectorAll("[data-filter-tag]");
  var count = nav.querySelector(".filter-count");
  var empty = document.querySelector(".filter-empty");
  var known = {};
  typeChips.forEach(function (c) { known[c.dataset.filterType] = true; });
  var state = { type: "all", tags: [] };

  var params = new URLSearchParams(location.search);
  if (known[params.get("type")]) state.type = params.get("type");
  (params.get("tags") || "").split(",").forEach(function (t) {
    if (nav.querySelector('[data-filter-tag="' + CSS.escape(t) + '"]')) state.tags.push(t);
  });

  function apply(push) {
    var shown = 0;
    projects.forEach(function (p) {
      var tags = p.dataset.tags.split(" ");
      var ok = (state.type === "all" || p.dataset.type === state.type) &&
        state.tags.every(function (t) { return tags.indexOf(t) >= 0; });
      p.hidden = !ok;
      if (ok) shown++;
    });
    groups.forEach(function (g) {
      var visible = projects.filter(function (p) { return p.dataset.type === g.dataset.group && !p.hidden; });
      g.hidden = visible.length === 0;
      g.querySelector(".group-n").textContent = visible.length;
      // Media sides alternate within a group, whatever is filtered out.
      visible.forEach(function (p, i) { p.classList.toggle("alt", i % 2 === 1); });
    });
    typeChips.forEach(function (c) {
      if (c.dataset.filterType === state.type) c.setAttribute("aria-current", "true");
      else c.removeAttribute("aria-current");
    });
    tagChips.forEach(function (c) {
      c.setAttribute("aria-pressed", state.tags.indexOf(c.dataset.filterTag) >= 0 ? "true" : "false");
    });
    var filtered = state.type !== "all" || state.tags.length > 0;
    count.hidden = !filtered;
    count.textContent = "Showing " + shown + " of " + projects.length + " projects";
    empty.hidden = shown > 0;
    if (push) {
      var q = new URLSearchParams();
      if (state.type !== "all") q.set("type", state.type);
      if (state.tags.length) q.set("tags", state.tags.join(","));
      var qs = q.toString();
      history.replaceState(null, "", location.pathname + (qs ? "?" + qs : ""));
    }
  }

  typeChips.forEach(function (c) {
    c.hidden = false;
    c.addEventListener("click", function (e) {
      e.preventDefault();
      var t = c.dataset.filterType;
      state.type = state.type === t ? "all" : t;
      apply(true);
    });
  });
  tagChips.forEach(function (c) {
    c.addEventListener("click", function () {
      var t = c.dataset.filterTag;
      var i = state.tags.indexOf(t);
      if (i >= 0) state.tags.splice(i, 1);
      else state.tags.push(t);
      apply(true);
    });
  });
  document.querySelector("[data-filter-reset]").addEventListener("click", function () {
    state = { type: "all", tags: [] };
    apply(true);
  });
  nav.querySelector('[data-row="tag"]').hidden = false;
  document.getElementById("filter-tag-label").hidden = false;
  nav.setAttribute("aria-label", "Filter projects");
  apply(false);
})();

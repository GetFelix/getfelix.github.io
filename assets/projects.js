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

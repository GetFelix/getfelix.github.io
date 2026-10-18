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
// load, and the posters stay.
(function () {
  var videos = document.querySelectorAll("video.clip");
  if (!videos.length || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  function play(video) {
    video.preload = "auto";
    video.play().catch(function () {});
  }
  if (!("IntersectionObserver" in window)) {
    videos.forEach(play);
    return;
  }
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) play(e.target);
      else e.target.pause();
    });
  }, { threshold: 0.25 });
  videos.forEach(function (video) { observer.observe(video); });
})();

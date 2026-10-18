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

// The swarm clip plays only while on screen. With reduced motion it never
// loads, and the poster stays.
(function () {
  var video = document.querySelector("video.swarm");
  if (!video || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!("IntersectionObserver" in window)) {
    video.preload = "auto";
    video.play().catch(function () {});
    return;
  }
  new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        video.preload = "auto";
        video.play().catch(function () {});
      } else {
        video.pause();
      }
    });
  }, { threshold: 0.25 }).observe(video);
})();

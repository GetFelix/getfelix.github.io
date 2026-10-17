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

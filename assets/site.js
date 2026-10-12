(function () {
  "use strict";
  var root = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Theme toggle. The initial theme is applied by the inline script in <head>
  // so the page never flashes the wrong one.
  var toggle = document.querySelector(".theme-toggle");
  function currentTheme() {
    var set = root.getAttribute("data-theme");
    if (set) return set;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function labelToggle() {
    if (!toggle) return;
    var next = currentTheme() === "dark" ? "light" : "dark";
    toggle.setAttribute("aria-label", "Switch to " + next + " theme");
    toggle.setAttribute("title", "Switch to " + next + " theme");
  }
  if (toggle) {
    labelToggle();
    toggle.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try {
        localStorage.setItem("theme", next);
      } catch (e) {}
      labelToggle();
      if (window.__felixLanesRedraw) window.__felixLanesRedraw();
    });
  }

  // Header border once the page scrolls.
  var header = document.querySelector(".site-header");
  if (header) {
    var onScroll = function () {
      header.classList.toggle("scrolled", window.scrollY > 8);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  // Reveal on scroll.
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion.matches) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    reveals.forEach(function (el) {
      io.observe(el);
    });
  } else {
    reveals.forEach(function (el) {
      el.classList.add("in");
    });
  }

  // Menu on narrow screens. Without JS the links stay visible as a row, so
  // nothing here is needed for them to work.
  var nav = document.querySelector(".nav");
  var menuBtn = nav && nav.querySelector(".nav-toggle");
  if (menuBtn) {
    var narrow = window.matchMedia("(max-width: 760px)");
    var setOpen = function (open, refocus) {
      nav.classList.toggle("open", open);
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) {
        var first = nav.querySelector(".nav-links a");
        if (first) first.focus();
      } else if (refocus) {
        menuBtn.focus();
      }
    };
    menuBtn.addEventListener("click", function () {
      setOpen(!nav.classList.contains("open"), false);
    });
    nav.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("open")) setOpen(false, true);
    });
    nav.addEventListener("focusout", function (e) {
      if (nav.classList.contains("open") && !nav.contains(e.relatedTarget)) setOpen(false, false);
    });
    document.addEventListener("click", function (e) {
      if (nav.classList.contains("open") && !nav.contains(e.target)) setOpen(false, false);
    });
    nav.querySelectorAll(".nav-links a").forEach(function (a) {
      a.addEventListener("click", function () {
        setOpen(false, false);
      });
    });
    narrow.addEventListener("change", function () {
      setOpen(false, false);
    });
  }
})();

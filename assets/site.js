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
  var themes = ["light", "dark", "solarized"];
  function nextTheme() {
    var i = themes.indexOf(currentTheme());
    return themes[(i + 1) % themes.length];
  }
  function labelToggle() {
    if (!toggle) return;
    var next = nextTheme();
    toggle.setAttribute("aria-label", "Switch to " + next + " theme");
    toggle.setAttribute("title", "Switch to " + next + " theme");
  }
  if (toggle) {
    labelToggle();
    toggle.addEventListener("click", function () {
      var next = nextTheme();
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
      if (open && refocus) {
        var first = nav.querySelector(".nav-links a");
        if (first) first.focus();
      } else if (!open && refocus) {
        menuBtn.focus();
      }
    };
    // Only a keyboard open (detail 0) moves focus into the menu. On a tap,
    // focus left on a link is blurred by the next tap, which would close the
    // menu before that tap's click lands.
    menuBtn.addEventListener("click", function (e) {
      setOpen(!nav.classList.contains("open"), e.detail === 0);
    });
    nav.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("open")) setOpen(false, true);
    });
    // Close when keyboard focus moves elsewhere. Mobile Safari blurs with no
    // relatedTarget on any tap, so a null target is not "left the menu".
    nav.addEventListener("focusout", function (e) {
      if (nav.classList.contains("open") && e.relatedTarget && !nav.contains(e.relatedTarget)) {
        setOpen(false, false);
      }
    });
    // pointerdown, not click: Safari fires no click for taps on plain page areas.
    document.addEventListener("pointerdown", function (e) {
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

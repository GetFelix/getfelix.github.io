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
  // Overflow menu. The links take the room the brand and icons leave; the ones
  // that do not fit move into a More menu, measured rather than set by
  // breakpoint so it holds for any label length. At phone width the hamburger
  // above takes over and every link goes back in the row.
  var linkList = nav && nav.querySelector(".nav-links");
  if (linkList && !nav.dataset.priority) {
    nav.dataset.priority = "1";
    var items = Array.prototype.slice.call(linkList.children);
    var more = document.createElement("li");
    more.className = "nav-more";
    more.hidden = true;
    more.innerHTML =
      '<button class="icon-btn nav-more-btn" type="button" aria-expanded="false" aria-controls="nav-more-list" aria-label="More pages">' +
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>' +
      '</button><ul class="nav-more-list" id="nav-more-list"></ul>';
    linkList.appendChild(more);
    var moreBtn = more.querySelector("button");
    var moreList = more.querySelector("ul");
    var phone = window.matchMedia("(max-width: 760px)");

    var setMore = function (open, refocus) {
      more.classList.toggle("open", open);
      moreBtn.setAttribute("aria-expanded", open ? "true" : "false");
      if (refocus) {
        if (open) {
          var first = moreList.querySelector("a");
          if (first) first.focus();
        } else {
          moreBtn.focus();
        }
      }
    };

    var layout = function () {
      // Phone width keeps every link in the row; nothing to measure.
      if (phone.matches && !moreList.children.length) {
        more.hidden = true;
        nav.classList.add("ready");
        return;
      }
      var active = document.activeElement;
      var hadFocus = active && linkList.contains(active) && active !== moreBtn ? active : null;
      var wasOpen = more.classList.contains("open");
      // Put every link back, then measure what fits in one pass; the browser
      // paints only the result.
      items.forEach(function (li) {
        linkList.insertBefore(li, more);
      });
      more.hidden = true;
      var out = [];
      if (!phone.matches) {
        var gap = parseFloat(getComputedStyle(linkList).columnGap) || 0;
        var room = linkList.clientWidth;
        var widths = items.map(function (li) {
          return li.offsetWidth;
        });
        var total = widths.reduce(function (a, w) {
          return a + w;
        }, 0) + gap * (items.length - 1);
        if (total > room) {
          more.hidden = false;
          room -= more.offsetWidth + gap;
          var used = 0;
          var fit = 0;
          while (fit < items.length && used + widths[fit] + (fit ? gap : 0) <= room) {
            used += widths[fit] + (fit ? gap : 0);
            fit++;
          }
          out = items.slice(fit);
        }
      }
      out.forEach(function (li) {
        moreList.appendChild(li);
      });
      more.hidden = out.length === 0;
      more.classList.toggle("has-current", out.some(function (li) {
        return li.querySelector('[aria-current="page"]');
      }));
      if (!out.length || phone.matches) setMore(false, false);
      else if (wasOpen) setMore(true, false);
      if (hadFocus && document.activeElement !== hadFocus) {
        // A link folded into the closed menu cannot hold focus; its button takes it.
        (hadFocus.offsetParent ? hadFocus : moreBtn).focus({ preventScroll: true });
      }
      nav.classList.add("ready");
    };

    moreBtn.addEventListener("click", function (e) {
      setMore(!more.classList.contains("open"), e.detail === 0);
    });
    more.addEventListener("keydown", function (e) {
      var open = more.classList.contains("open");
      if (e.key === "Escape" && open) {
        e.stopPropagation();
        setMore(false, true);
        return;
      }
      var links = Array.prototype.slice.call(moreList.querySelectorAll("a"));
      var at = links.indexOf(document.activeElement);
      var to = -1;
      if (e.key === "ArrowDown") to = at < 0 ? 0 : (at + 1) % links.length;
      else if (e.key === "ArrowUp") to = at < 0 ? links.length - 1 : (at - 1 + links.length) % links.length;
      else if (e.key === "Home" && at >= 0) to = 0;
      else if (e.key === "End" && at >= 0) to = links.length - 1;
      if (to < 0) return;
      e.preventDefault();
      if (!open) setMore(true, false);
      links[to].focus();
    });
    // Tabbing out closes it; a null relatedTarget (a tap) is not "left".
    more.addEventListener("focusout", function (e) {
      if (more.classList.contains("open") && e.relatedTarget && !more.contains(e.relatedTarget)) {
        setMore(false, false);
      }
    });
    document.addEventListener("pointerdown", function (e) {
      if (more.classList.contains("open") && !more.contains(e.target)) setMore(false, false);
    });
    moreList.addEventListener("click", function () {
      setMore(false, false);
    });

    var queued = false;
    var relayout = function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        layout();
      });
    };
    layout();
    if ("ResizeObserver" in window) new ResizeObserver(relayout).observe(linkList);
    else window.addEventListener("resize", relayout);
    phone.addEventListener("change", relayout);
    // Link widths change when the web font arrives.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
  }

  // Footer line. The first one is in the HTML for no-JS readers and crawlers.
  // On load pick another at random, never the one shown last. The element
  // keeps its height, so nothing moves.
  var mottos = [
    "Lucky by name. Resilient by design.",
    "Lands on its feet when a broker falls.",
    "Nine lives, one log.",
    "Follows the leader, paw for paw.",
    "One slow reader never stalls the rest.",
    "Built so you don\u2019t have to be lucky."
  ];
  var motto = document.querySelector(".footer-motto");
  if (motto) {
    var last = -1;
    try {
      last = parseInt(sessionStorage.getItem("motto"), 10);
    } catch (e) {}
    var pick = Math.floor(Math.random() * (mottos.length - (last >= 0 && last < mottos.length ? 1 : 0)));
    if (pick >= last && last >= 0 && last < mottos.length) pick += 1;
    if (isNaN(pick)) pick = 0;
    motto.textContent = mottos[pick];
    try {
      sessionStorage.setItem("motto", String(pick));
    } catch (e) {}
  }
})();

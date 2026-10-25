(function () {
  "use strict";
  var root = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Code tabs.
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));
  function selectTab(tab) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
  }
  // The last language picked is remembered. Storage can be blocked, and the page works without it.
  var TAB_KEY = "felix-home-tab";
  function remember(tab) {
    try {
      localStorage.setItem(TAB_KEY, tab.id);
    } catch (e) {}
  }
  try {
    var saved = localStorage.getItem(TAB_KEY);
    var savedTab = tabs.filter(function (t) {
      return t.id === saved;
    })[0];
    if (savedTab) selectTab(savedTab);
  } catch (e) {}
  tabs.forEach(function (tab, i) {
    tab.addEventListener("click", function () {
      selectTab(tab);
      remember(tab);
    });
    tab.addEventListener("keydown", function (e) {
      var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      var next = tabs[(i + d + tabs.length) % tabs.length];
      selectTab(next);
      remember(next);
      next.focus();
      e.preventDefault();
    });
  });

  // Copy buttons.
  function copyText(text, btn) {
    var done = function () {
      btn.classList.add("copied");
      var label = btn.querySelector(".copy-label");
      var prev = label ? label.textContent : null;
      if (label) label.textContent = "Copied";
      btn.setAttribute("aria-label", "Copied");
      setTimeout(function () {
        btn.classList.remove("copied");
        if (label) label.textContent = prev;
        btn.setAttribute("aria-label", btn.getAttribute("data-label") || "Copy");
      }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {});
    }
  }
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.setAttribute("data-label", btn.getAttribute("aria-label") || "Copy");
    btn.addEventListener("click", function () {
      var sel = btn.getAttribute("data-copy");
      var el = sel === "panel" ? document.querySelector(".window [role=tabpanel]:not([hidden]) pre") : btn.parentElement.querySelector("code");
      if (el) copyText(el.textContent.trim(), btn);
    });
  });

  // Quick start dialogs. Without script the link goes to the docs.
  if (typeof HTMLDialogElement === "function") {
    document.querySelectorAll("[data-quick]").forEach(function (link) {
      var dlg = document.getElementById(link.getAttribute("data-quick"));
      if (!dlg) return;
      link.addEventListener("click", function (e) {
        e.preventDefault();
        dlg.showModal();
      });
      dlg.addEventListener("click", function (e) {
        // A click on the backdrop lands on the dialog itself, outside its padding box.
        var r = dlg.getBoundingClientRect();
        var outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
        if (outside || e.target.closest("[data-quick-close]")) dlg.close();
      });
      dlg.addEventListener("close", function () {
        link.focus();
      });
    });
  }

  // Hero background: lanes of log records drifting slowly to the right.
  var canvas = document.querySelector(".hero-bg");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var lanes = [];
  var w = 0,
    h = 0,
    dpr = 1,
    colors = {},
    running = false,
    visible = true,
    last = 0;

  function readColors() {
    var cs = getComputedStyle(root);
    colors.dot = cs.getPropertyValue("--dot").trim();
    colors.accent = cs.getPropertyValue("--dot-accent").trim();
  }
  function rand(seed) {
    var x = Math.sin(seed * 9301 + 49297) * 233280;
    return x - Math.floor(x);
  }
  function build() {
    var rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = rect.width;
    h = rect.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lanes = [];
    var gap = w < 700 ? 30 : 36;
    var n = Math.ceil(h / gap) + 1;
    for (var i = 0; i < n; i++) {
      var recs = [];
      var x = -rand(i + 1) * 120;
      var j = 0;
      while (x < w + 200) {
        var len = 10 + rand(i * 31 + j) * 42;
        recs.push({ x: x, len: len, hot: rand(i * 17 + j * 7) > 0.9 });
        x += len + 14 + rand(i * 13 + j * 3) * 70;
        j++;
      }
      lanes.push({ y: i * gap + 10, speed: 5 + rand(i * 7) * 13, recs: recs, span: x + 40 });
    }
  }
  function draw() {
    ctx.clearRect(0, 0, w, h);
    for (var i = 0; i < lanes.length; i++) {
      var lane = lanes[i];
      for (var j = 0; j < lane.recs.length; j++) {
        var r = lane.recs[j];
        var x = r.x;
        if (x > w + 10 || x + r.len < -10) continue;
        ctx.fillStyle = r.hot ? colors.accent : colors.dot;
        roundRect(x, lane.y, r.len, 5, 2.5);
      }
    }
  }
  function roundRect(x, y, wd, ht, rad) {
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + wd, y, x + wd, y + ht, rad);
    ctx.arcTo(x + wd, y + ht, x, y + ht, rad);
    ctx.arcTo(x, y + ht, x, y, rad);
    ctx.arcTo(x, y, x + wd, y, rad);
    ctx.fill();
  }
  function step(t) {
    if (!running) return;
    var dt = last ? Math.min((t - last) / 1000, 0.1) : 0;
    last = t;
    for (var i = 0; i < lanes.length; i++) {
      var lane = lanes[i];
      for (var j = 0; j < lane.recs.length; j++) {
        var r = lane.recs[j];
        r.x += lane.speed * dt;
        if (r.x > w + 60) r.x -= lane.span;
      }
    }
    draw();
    requestAnimationFrame(step);
  }
  function start() {
    if (running || reduceMotion.matches || !visible || document.hidden) return;
    running = true;
    last = 0;
    requestAnimationFrame(step);
  }
  function stop() {
    running = false;
  }
  window.__felixLanesRedraw = function () {
    readColors();
    draw();
  };

  readColors();
  build();
  draw();
  start();

  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      build();
      draw();
    }, 150);
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", window.__felixLanesRedraw);
  reduceMotion.addEventListener("change", function () {
    reduceMotion.matches ? stop() : start();
  });
  document.addEventListener("visibilitychange", function () {
    document.hidden ? stop() : start();
  });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      visible ? start() : stop();
    }).observe(canvas);
  }
})();

// How Felix is different. The stack collapses once, when it scrolls into
// view; the isolation loop runs in CSS and is paused while off screen.
// Without JS, or with reduced motion, both stay on their static frames.
(() => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
  const stack = document.querySelector(".collapse");
  if (stack) {
    stack.classList.add("armed");
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        stack.classList.add("go");
        io.disconnect();
      },
      { threshold: 0.35 }
    );
    io.observe(stack);
  }
  const iso = document.querySelector(".iso");
  if (iso) {
    iso.classList.add("live");
    new IntersectionObserver((entries) => iso.classList.toggle("play", entries[0].isIntersecting)).observe(iso);
  }
})();

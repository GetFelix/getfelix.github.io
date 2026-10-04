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

  // Pointer-following highlight on feature tiles.
  document.querySelectorAll(".tile").forEach(function (tile) {
    tile.addEventListener("pointermove", function (e) {
      var r = tile.getBoundingClientRect();
      tile.style.setProperty("--mx", e.clientX - r.left + "px");
      tile.style.setProperty("--my", e.clientY - r.top + "px");
    });
  });

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
  tabs.forEach(function (tab, i) {
    tab.addEventListener("click", function () {
      selectTab(tab);
    });
    tab.addEventListener("keydown", function (e) {
      var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      var next = tabs[(i + d + tabs.length) % tabs.length];
      selectTab(next);
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
      var el = sel === "panel" ? document.querySelector(".window pre:not([hidden])") : btn.parentElement.querySelector("code");
      if (el) copyText(el.textContent.trim(), btn);
    });
  });

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

// One log read three ways: a single playhead drives the stream, cache and
// queue rows together. Without JS, or with reduced motion, the static
// picture in the markup stays.
(() => {
  const viz = document.querySelector(".log-viz");
  if (!viz || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const row = (name) => [...viz.querySelectorAll(`.log-row.${name} .cell`)];
  const stream = row("stream");
  const cache = row("cache");
  const queue = row("queue");
  const keys = cache.map((cell) => cell.textContent.trim());
  const n = stream.length;
  const hold = 3;
  let t = 0;
  let timer = null;

  const set = (cell, state) => {
    cell.classList.remove("on", "read", "latest", "old", "pending", "done", "cursor");
    if (state) cell.classList.add(state);
  };

  function draw() {
    const head = Math.min(t, n - 1);
    stream.forEach((cell, i) => set(cell, i === head && t < n ? "on" : i <= head ? "read" : "pending"));
    cache.forEach((cell, i) => {
      if (i > head) return set(cell, "pending");
      const newer = keys.slice(i + 1, head + 1).includes(keys[i]);
      set(cell, newer ? "old" : "latest");
    });
    const cursor = Math.max(0, head - 1);
    queue.forEach((cell, i) => set(cell, i < cursor ? "done" : i === cursor ? "cursor" : "pending"));
    t = t >= n - 1 + hold ? 0 : t + 1;
  }

  const start = () => {
    if (timer) return;
    viz.dataset.live = "";
    draw();
    timer = setInterval(draw, 650);
  };
  const stop = () => {
    clearInterval(timer);
    timer = null;
  };
  new IntersectionObserver((entries) => (entries[0].isIntersecting ? start() : stop())).observe(viz);
})();

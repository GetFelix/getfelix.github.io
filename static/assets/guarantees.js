// Clustering. One 24 s loop of beats; each beat adds a class to the figure and
// the CSS draws that state. The clock only runs while the figure is on screen,
// the tab is visible and the reader hasn't paused it. With reduced motion the
// steps become buttons that show each step's final frame.
(() => {
  const fig = document.querySelector(".cl-fig");
  if (!fig) return;
  const BEATS = [
    [400, "a-send"], [1100, "a-b1"], [1300, "a-rep"], [1900, "a-b2"], [2100, "a-ack"], [2700, "a-ok"], [3300, "a-b3"],
    [6000, "down"],
    [9500, "promote"], [11000, "b-send"], [11700, "b-b2"], [11900, "b-rep"], [12500, "b-b3"], [12700, "b-ack"], [13300, "b-ok"],
    [15000, "up"], [15600, "b-b1"], [17200, "fence"], [18400, "move"], [19300, "moved"], [22600, "reset"],
  ];
  const CYCLE = 24000;
  const STARTS = [0, 6000, 9500, 15000];
  const ENDS = [3000, 9400, 14900, 22500];
  const NAMES = BEATS.map((b) => b[1]);
  const steps = [...fig.querySelectorAll(".cl-step")];
  const pause = fig.querySelector(".cl-pause");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  let t = ENDS[0];
  let last = 0;
  let raf = 0;
  let visible = false;
  let held = false;

  const stepAt = (time) => STARTS.reduce((n, s, i) => (time >= s ? i : n), 0);
  function mark(time) {
    const n = stepAt(time);
    steps.forEach((li, i) => {
      li.classList.toggle("is-on", i === n);
      if (i === n) li.setAttribute("aria-current", "step");
      else li.removeAttribute("aria-current");
    });
  }
  function show(time) {
    fig.classList.add("cl-jump");
    fig.classList.remove(...NAMES);
    for (const [at, name] of BEATS) if (at <= time) fig.classList.add(name);
    mark(time);
    fig.getBoundingClientRect();
    requestAnimationFrame(() => requestAnimationFrame(() => fig.classList.remove("cl-jump")));
  }
  function tick(now) {
    const prev = t;
    t += Math.min(now - last, 100);
    last = now;
    if (t >= CYCLE) {
      t -= CYCLE;
      fig.classList.remove(...NAMES);
    }
    for (const [at, name] of BEATS) if (at > (t < prev ? -1 : prev) && at <= t) fig.classList.add(name);
    if (stepAt(t) !== stepAt(prev) || t < prev) mark(t);
    raf = requestAnimationFrame(tick);
  }
  function sync() {
    const run = visible && !held && !document.hidden && !reduce.matches;
    fig.classList.toggle("play", run);
    if (run && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }
  steps.forEach((li, i) =>
    li.querySelector("button").addEventListener("click", () => {
      t = reduce.matches || held ? ENDS[i] : STARTS[i];
      show(t);
    })
  );
  steps.forEach((li, i) => li.style.setProperty("--dur", (STARTS[i + 1] || CYCLE) - STARTS[i] + "ms"));
  function setMode() {
    pause.hidden = reduce.matches;
    fig.classList.toggle("live", !reduce.matches);
    if (reduce.matches) t = ENDS[stepAt(t)];
    else if (!held) t = 0;
    show(t);
    sync();
  }
  pause.addEventListener("click", () => {
    held = !held;
    pause.setAttribute("aria-pressed", String(held));
    pause.querySelector("span").textContent = held ? "Play" : "Pause";
    sync();
  });
  reduce.addEventListener("change", setMode);
  document.addEventListener("visibilitychange", sync);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      sync();
    }, { threshold: 0.25 }).observe(fig);
  } else {
    visible = true;
  }
  setMode();
})();

// How Felix is tested. One 21 s night: a playhead crosses the lanes and each
// fault or record shows once it passes that element's data-at; then the faults
// heal, the final read sweeps the ledger and the verdict comes in. The clock
// runs only while the figure is on screen, the tab is visible and the reader
// hasn't paused it. With reduced motion the markup's end-of-night frame stays.
(() => {
  const fig = document.querySelector(".tt");
  if (!fig || !("IntersectionObserver" in window)) return;
  const RUN = 13000;
  const READ = 13700;
  const VERDICT = 15900;
  const FADE = 20400;
  const CYCLE = 21000;
  const marks = [...fig.querySelectorAll("[data-at]")];
  const box = fig.querySelector(".tt-headbox");
  const head = fig.querySelector(".tt-head");
  const pause = fig.querySelector(".tt-pause");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  let t = 0;
  let last = 0;
  let raf = 0;
  let visible = false;
  let held = false;

  function render() {
    const p = Math.min(t / RUN, 1) * 100;
    for (const el of marks) {
      el.classList.toggle("hit", p >= +el.dataset.at);
      if (el.dataset.to) el.classList.toggle("done", p >= +el.dataset.to);
    }
    head.style.transform = "translateX(" + (p / 100) * box.clientWidth + "px)";
    fig.classList.toggle("heal", t >= RUN);
    fig.classList.toggle("read", t >= READ);
    fig.classList.toggle("verdict", t >= VERDICT);
    fig.classList.toggle("fade", t >= FADE);
  }
  function tick(now) {
    t += Math.min(now - last, 100);
    last = now;
    if (t >= CYCLE) {
      t = 0;
      fig.classList.add("jump");
      render();
      fig.getBoundingClientRect();
      fig.classList.remove("jump");
    } else {
      render();
    }
    raf = requestAnimationFrame(tick);
  }
  function sync() {
    const run = visible && !held && !document.hidden && !reduce.matches;
    fig.classList.toggle("play", run);
    if (run && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }
  function setMode() {
    pause.hidden = reduce.matches;
    fig.classList.toggle("live", !reduce.matches);
    if (reduce.matches) {
      fig.classList.remove("heal", "read", "verdict", "fade");
      for (const el of marks) el.classList.remove("hit", "done");
    } else {
      t = 0;
      render();
    }
    sync();
  }
  pause.addEventListener("click", () => {
    held = !held;
    pause.setAttribute("aria-pressed", String(held));
    pause.querySelector("span").textContent = held ? "Play" : "Pause";
    sync();
  });
  reduce.addEventListener("change", setMode);
  document.addEventListener("visibilitychange", sync);
  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    sync();
  }, { threshold: 0.25 }).observe(fig);
  setMode();
})();

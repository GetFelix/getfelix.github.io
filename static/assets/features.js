// Pointer-following highlight on feature tiles.
document.querySelectorAll(".tile").forEach(function (tile) {
  tile.addEventListener("pointermove", function (e) {
    var r = tile.getBoundingClientRect();
    tile.style.setProperty("--mx", e.clientX - r.left + "px");
    tile.style.setProperty("--my", e.clientY - r.top + "px");
  });
});

// Subscriber lanes fill once when they scroll into view. Without JS, or with
// reduced motion, they show the end: two full, the slow one behind.
(() => {
  const lanes = document.querySelector(".lanes");
  if (!lanes || matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
  lanes.classList.add("armed");
  const io = new IntersectionObserver((entries) => {
    if (!entries[0].isIntersecting) return;
    lanes.classList.add("play");
    io.disconnect();
  }, { threshold: 0.5 });
  io.observe(lanes);
})();

// One log read three ways. A single playhead writes records; the stream
// reads each as it lands, the cache keeps each key's newest value, and the
// queue is worked by two workers whose jobs take different times. The
// group's position only moves past a record once that record is
// acknowledged, so it waits at the oldest unfinished job. Without JS, or
// with reduced motion, the static picture in the markup stays.
(() => {
  const viz = document.querySelector(".log-viz");
  if (!viz || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const row = (name) => [...viz.querySelectorAll(`.log-row.${name} .cell`)];
  const stream = row("stream");
  const cache = row("cache");
  const queue = row("queue");
  const keys = cache.map((cell) => cell.textContent.trim());
  const n = stream.length;
  // Ticks each queued job takes to finish. Uneven on purpose: record 2 is slow.
  const cost = [1, 2, 5, 1, 1, 2, 1, 3, 1, 1];
  const workers = 2;
  const hold = 4;
  let tick, head, claims, acked, done, timer;

  const reset = () => {
    tick = 0;
    head = -1;
    claims = new Map(); // record -> { worker, left }
    acked = new Set();
    done = 0;
  };

  const states = ["on", "read", "latest", "old", "pending", "done", "cursor", "acked", "claim", "w0", "w1", "waiting"];
  const set = (cell, ...add) => {
    cell.classList.remove(...states);
    cell.classList.add(...add);
  };

  function step() {
    if (head < n - 1) head += 1;

    // Workers finish their jobs, then the free ones claim the next written record.
    for (const [record, job] of claims) {
      job.left -= 1;
      if (job.left <= 0) {
        claims.delete(record);
        acked.add(record);
      }
    }
    const busy = new Set([...claims.values()].map((job) => job.worker));
    let next = 0;
    while (acked.has(next) || claims.has(next)) next += 1;
    for (let w = 0; w < workers; w += 1) {
      if (busy.has(w)) continue;
      while (next <= head && (acked.has(next) || claims.has(next))) next += 1;
      if (next > head) break;
      claims.set(next, { worker: w, left: cost[next] });
      next += 1;
    }
    // The position is the oldest record not yet acknowledged.
    while (acked.has(done)) done += 1;
  }

  function draw() {
    stream.forEach((cell, i) => set(cell, i === head ? "on" : i < head ? "read" : "pending"));
    cache.forEach((cell, i) => {
      if (i > head) return set(cell, "pending");
      set(cell, keys.slice(i + 1, head + 1).includes(keys[i]) ? "old" : "latest");
    });
    queue.forEach((cell, i) => {
      if (i < done) return set(cell, "done");
      const job = claims.get(i);
      const marks = i === done ? ["cursor"] : [];
      if (job) return set(cell, "claim", `w${job.worker}`, ...marks);
      if (acked.has(i)) return set(cell, "acked", ...marks);
      set(cell, i > head ? "pending" : "waiting", ...marks);
    });
  }

  function frame() {
    if (done >= n) {
      tick += 1;
      if (tick > hold) reset();
    } else {
      step();
    }
    draw();
  }

  const start = () => {
    if (timer) return;
    viz.dataset.live = "";
    draw();
    timer = setInterval(frame, 650);
  };
  const stop = () => {
    clearInterval(timer);
    timer = null;
  };
  reset();
  new IntersectionObserver((entries) => (entries[0].isIntersecting ? start() : stop())).observe(viz);
})();


// Sharding. Plays the routing figure and the growth figure only while each is
// on screen, the tab is visible and the reader hasn't paused it. Without JS,
// or with reduced motion, the markup's final frame stays.
function playLoop(fig, beats, cycle) {
  const pause = fig.querySelector(".sh-pause");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const names = [...new Set(beats.map((b) => b[1]))];
  let t = 0;
  let last = 0;
  let raf = 0;
  let visible = false;
  let held = false;

  function restart() {
    fig.classList.add("jump");
    fig.classList.remove(...names);
    for (const [at, name] of beats) if (at <= t) fig.classList.add(name);
    fig.getBoundingClientRect();
    fig.classList.remove("jump");
  }
  function tick(now) {
    const prev = t;
    t += Math.min(now - last, 100);
    last = now;
    if (t >= cycle) {
      t -= cycle;
      restart();
    } else {
      for (const [at, name] of beats) if (at > prev && at <= t) fig.classList.add(name);
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
      fig.classList.remove(...names);
    } else {
      t = 0;
      restart();
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
}

(() => {
  if (!("IntersectionObserver" in window)) return;
  // Nine records, one every 1.5 s; each lands 1.3 s after it is sent.
  const routing = document.querySelector(".sh-fig");
  if (routing) {
    const beats = [];
    for (let i = 1; i <= 9; i += 1) {
      const at = 600 + (i - 1) * 1500;
      beats.push([at, "r" + i], [at + 1300, "h" + i]);
    }
    beats.push([16500, "fade"]);
    playLoop(routing, beats, 17400);
  }
  // Four shards for 3 s, then five; the keys that move change over.
  const growth = document.querySelector(".gr-fig");
  if (growth) playLoop(growth, [[3000, "grown"]], 9000);
})();

#!/usr/bin/env python3
"""Generates the animated figure on the 404 page and writes it into static/404.html.

    python3 .github/scripts/notfound_art.py

The cat walks the log and finds no record at offset 404. It paws at the hole, record 418 drops
into it and falls through, the cat looks at you, then hops the gap and walks on. Every part
runs on one timeline of T seconds, so the loop has a single seam, with the cat off stage on
both sides of it. Colours and line styles are the blog's (static/assets/ck.css).
"""
import math
import pathlib
import re
import sys

T = 13.0          # loop length, seconds
START = 1.5       # where the loop starts on load, so the cat is already walking in
STILL = 8.8       # the frame shown under prefers-reduced-motion: the puzzled look

TRACKS = []       # (name, [(t, value, easing)])

EASE = {
    "lin": "linear",
    "io": "cubic-bezier(.45,0,.55,1)",
    "in": "ease-in",
    "out": "ease-out",
    "back": "cubic-bezier(.3,1.6,.6,1)",
    "fall": "cubic-bezier(.55,0,1,.45)",
    "step": "steps(1,end)",
}


def tf(x=0, y=0, r=0, sx=1, sy=1):
    return f"translate({x:g}px,{y:g}px) rotate({r:g}deg) scale({sx:g},{sy:g})"


def track(name, keys, prop="transform"):
    """keys: (t, value, easing to the next key). Values are transforms, or opacities."""
    keys = sorted((k for k in keys if k[0] <= T), key=lambda k: k[0])
    if keys[0][0] > 0:
        keys.insert(0, (0, keys[0][1], "lin"))
    if keys[-1][0] < T:
        keys.append((T, keys[-1][1], "lin"))
    TRACKS.append((name, prop, keys))


def hold(v):
    return [(0, v, "lin")]


# ---------------------------------------------------------------- timeline
WALK_IN = (0.0, 3.55)
X0, X_STOP = -150, 226
LAND_X = 394
WALK_OUT = (10.6, T)
X_END = 740
HOP = (9.95, 10.35)

L = 44  # leg length
CYC_IN, CYC_OUT = 0.62, 0.52  # stride periods matched to the walking speeds, so paws don't slide


def walk_keys(t0, t1, cycle, amp, phase, lift=0.84):
    """A leg's swing during a walk: keys at the extremes and the crossings.

    Positive angles swing the paw back; the leg shortens through the forward swing so the paw
    clears the ground."""
    keys = []
    n = int((t1 - t0) / cycle * 4 + 0.5)
    for i in range(n + 1):
        t = t0 + i * cycle / 4
        q = (i + phase) % 4
        if t > t1 + 1e-6:
            break
        # q: 0 crossing going back (stance), 1 back extreme, 2 crossing forward (swing), 3 front
        a = {0: 0, 1: amp, 2: 0, 3: -amp}[q]
        s = lift if q == 2 else 1
        e = "in" if q in (1, 3) else "out"
        if i == 0:
            a, s = 0, 1
        keys.append((round(t, 3), tf(r=a, sy=s), e))
    keys.append((round(t1 + 0.12, 3), tf(), "lin"))
    return keys


def legs():
    out = {}
    for leg, ph in (("fn", 0), ("hf", 0), ("ff", 2), ("hn", 2)):
        k = walk_keys(*WALK_IN, CYC_IN, 23, ph) + walk_keys(*WALK_OUT, CYC_OUT, 25, ph)
        out[leg] = k
    # The paw: two pats into the hole.
    pat = [(5.05, tf(), "io"), (5.3, tf(r=-62, sy=0.92), "out"), (5.48, tf(r=-30, sy=1.4), "in"),
           (5.66, tf(r=-60, sy=0.92), "out"), (5.84, tf(r=-30, sy=1.42), "io"),
           (6.05, tf(r=-30, sy=1.42), "io"), (6.4, tf(), "io")]
    out["fn"] += pat
    # Jump: front legs reach, hind legs push then trail.
    out["fn"] += [(9.7, tf(), "io"), (9.95, tf(r=-28), "io"), (10.25, tf(r=-12), "out"), (10.42, tf(), "lin")]
    out["ff"] += [(9.7, tf(), "io"), (9.95, tf(r=-22), "io"), (10.25, tf(r=-8), "out"), (10.42, tf(), "lin")]
    out["hn"] += [(9.7, tf(), "io"), (9.95, tf(r=8), "out"), (10.1, tf(r=34), "io"), (10.35, tf(r=6), "out"), (10.5, tf(), "lin")]
    out["hf"] += [(9.7, tf(), "io"), (9.95, tf(r=6), "out"), (10.1, tf(r=28), "io"), (10.35, tf(r=4), "out"), (10.5, tf(), "lin")]
    for leg, k in out.items():
        track(f"nf-{leg}", k)


LEAN_PIVOT = (-44, 0)


def lean_comp(v, shoulder):
    """The leg rotation and stretch that keep a paw where it stood while the body leans by v."""
    m = re.match(r"translate\((\S+)px,(\S+)px\) rotate\((\S+)deg\)", v)
    r = float(m.group(3))
    a = math.radians(r)
    sx, sy = shoulder[0] - LEAN_PIVOT[0], shoulder[1] - LEAN_PIVOT[1]
    px = LEAN_PIVOT[0] + sx * math.cos(a) - sy * math.sin(a)
    py = LEAN_PIVOT[1] + sx * math.sin(a) + sy * math.cos(a)
    dx, dy = shoulder[0] - px, 0 - py
    theta = math.degrees(math.atan2(-dx, dy))
    return tf(r=round(theta - r, 2), sy=round(math.hypot(dx, dy) / -shoulder[1], 3))


def body_tracks():
    # Where the cat is along the log.
    track("nf-pos", [
        (0, tf(x=X0), "lin"), (3.0, tf(x=X_STOP - 36), "out"), (WALK_IN[1], tf(x=X_STOP), "lin"),
        (HOP[0], tf(x=X_STOP), "lin"), (HOP[1], tf(x=LAND_X), "lin"),
        (WALK_OUT[0], tf(x=LAND_X), "lin"), (WALK_OUT[0] + 0.3, tf(x=LAND_X + 25), "lin"),
        (T, tf(x=X_END), "lin"),
    ])
    # The jump's height, separate from x so x stays even through the arc.
    track("nf-hop", [(HOP[0], tf(), "out"), (sum(HOP) / 2, tf(y=-50), "in"), (HOP[1], tf(), "lin")])
    # Squash and stretch about the paws.
    track("nf-sq", [
        (3.5, tf(), "out"), (3.62, tf(sx=1.03, sy=0.97), "io"), (3.85, tf(), "lin"),
        (9.62, tf(), "io"), (HOP[0], tf(sx=1.06, sy=0.88), "out"),
        (HOP[0] + 0.12, tf(sx=0.95, sy=1.08), "io"), (HOP[1] - 0.04, tf(sx=0.98, sy=1.03), "in"),
        (HOP[1] + 0.03, tf(sx=1.1, sy=0.86), "out"), (HOP[1] + 0.2, tf(sx=0.98, sy=1.03), "io"),
        (HOP[1] + 0.36, tf(), "lin"),
    ])
    # Lean, pivoting on the hind paws: the brake at the stop, the crouch to peer, the startle,
    # the puzzle. The front legs fold to keep the paws planted (lean_comp).
    lean = [
        (3.35, tf(), "out"), (3.62, tf(r=4), "io"), (3.84, tf(r=-1.2), "io"), (4.0, tf(), "io"),
        (4.1, tf(), "io"), (4.6, tf(r=9), "io"),
        (6.4, tf(r=9), "out"), (6.52, tf(r=-4, y=-4), "in"), (6.66, tf(r=-2), "io"), (6.95, tf(r=6), "io"),
        (7.45, tf(r=6), "io"), (7.7, tf(r=8), "io"), (8.05, tf(r=-1.2), "io"), (8.3, tf(), "lin"),
    ]
    track("nf-lean", lean)
    for name, shoulder in (("nf-fc", (32, -40)), ("nf-hc", (-48, -54))):
        track(name, [(t, lean_comp(v, shoulder), e) for t, v, e in lean])
    # The jump's pitch, about the body's middle.
    track("nf-pitch", [(HOP[0], tf(), "io"), (HOP[0] + 0.1, tf(r=-9), "io"), (HOP[1] - 0.06, tf(r=7), "out"),
                       (HOP[1] + 0.12, tf(), "lin")])
    # Bob while walking: up at each extreme, down through the crossings.
    bob = []
    for t0, t1, cyc in ((WALK_IN[0], WALK_IN[1], CYC_IN), (WALK_OUT[0], WALK_OUT[1], CYC_OUT)):
        n = int((t1 - t0) / (cyc / 4) + 0.5)
        for i in range(n + 1):
            t = t0 + i * cyc / 4
            bob.append((round(t, 3), tf(y=-1.6 if i % 2 else 0.6), "io"))
        bob.append((round(t1 + 0.12, 3), tf(), "lin"))
    track("nf-bob", bob)


def head_tracks():
    track("nf-head", [
        (0, tf(r=-3), "io"), (1.2, tf(r=2), "io"), (2.4, tf(r=-3), "io"), (3.45, tf(r=1), "io"),
        (3.7, tf(r=5), "io"), (3.9, tf(), "io"),
        (4.15, tf(), "io"), (4.75, tf(x=4, y=7, r=12), "io"), (5.3, tf(x=5, y=8, r=15), "io"),
        (6.3, tf(x=4, y=7, r=12), "out"),
        (6.52, tf(y=-4, r=-12), "io"), (6.9, tf(x=3, y=5, r=14), "io"), (7.45, tf(x=3, y=5, r=15), "io"),
        (7.7, tf(x=4, y=8, r=22), "io"),
        (8.05, tf(r=-13), "back"), (8.4, tf(r=-10), "io"), (9.3, tf(r=-12), "io"),
        (9.65, tf(r=-2), "io"), (HOP[0] + 0.1, tf(r=-8), "io"), (HOP[1] + 0.1, tf(r=6), "io"),
        (10.75, tf(r=-2), "io"), (11.8, tf(r=2), "io"), (T, tf(r=-3), "io"),
    ])
    # Pupils: ahead while walking, down into the hole, track the falling record, then at you.
    track("nf-look", [
        (0, tf(x=2.4), "io"), (3.9, tf(x=2.4), "io"), (4.4, tf(x=2.2, y=2.6), "io"),
        (6.3, tf(x=2.2, y=2.6), "out"), (6.45, tf(x=0.5, y=-2), "io"), (6.75, tf(x=1.6, y=2.1), "io"),
        (7.45, tf(x=1.6, y=2.1), "io"), (7.7, tf(x=1, y=2.8), "io"), (8.0, tf(x=-0.6, y=-0.4), "io"),
        (9.5, tf(x=-0.6, y=-0.4), "io"),
        (9.8, tf(x=2.4), "lin"),
    ])
    blink = []
    for tb in (1.9, 7.15, 8.95, 12.1):
        blink += [(tb - 0.01, tf(), "in"), (tb + 0.07, tf(sy=0.08), "out"), (tb + 0.19, tf(), "lin")]
    track("nf-blink", blink)
    # Left ear twitches at the stop and folds back at the startle; right ear droops when puzzled.
    track("nf-earl", [
        (3.6, tf(), "out"), (3.68, tf(r=-16), "io"), (3.8, tf(r=4), "io"), (3.92, tf(), "io"),
        (6.4, tf(), "out"), (6.52, tf(r=-26), "io"), (6.95, tf(r=-6), "io"), (7.3, tf(), "lin"),
        (11.2, tf(), "out"), (11.27, tf(r=-12), "io"), (11.4, tf(), "lin"),
    ])
    track("nf-earr", [
        (6.4, tf(), "out"), (6.52, tf(r=22), "io"), (6.95, tf(r=6), "io"),
        (7.95, tf(r=4), "back"), (8.25, tf(r=26), "io"), (8.55, tf(r=21), "io"), (9.4, tf(r=24), "io"),
        (9.75, tf(), "lin"),
    ])
    # Puzzled brow: the right lid lifts.
    track("nf-brow", [(7.95, tf(), "back"), (8.25, tf(y=-5, r=-10), "io"), (9.5, tf(y=-5, r=-10), "io"), (9.8, tf(), "lin")])
    track("nf-squint", [(7.95, tf(), "io"), (8.25, tf(y=2.2, r=6), "io"), (9.5, tf(y=2.2, r=6), "io"), (9.8, tf(), "lin")])
    # Mouths swap with opacity.
    track("nf-m-smile", [(0, "1", "step"), (6.46, "0", "step"), (10.4, "1", "step")], prop="opacity")
    track("nf-m-o", [(0, "0", "step"), (6.46, "1", "step"), (7.95, "0", "step")], prop="opacity")
    track("nf-m-wavy", [(0, "0", "step"), (7.95, "1", "step"), (10.4, "0", "step")], prop="opacity")


def walk_sway(t0, t1, cyc):
    """Tail keys for a walk: it swings against the body's bob, a quarter stride behind."""
    keys = []
    n = int((t1 - t0) / (cyc / 4) + 0.5)
    for i in range(n + 1):
        keys.append((round(t0 + i * cyc / 4 + cyc / 8, 3), tf(r=5 if i % 2 else -3), "io"))
    return keys


def tail_tracks():
    keys = walk_sway(WALK_IN[0], WALK_IN[1] - 0.2, CYC_IN)
    keys += [(3.6, tf(r=-6), "io"), (4.0, tf(r=2), "io"), (4.7, tf(r=-16), "io"), (6.4, tf(r=-14), "out"),
             (6.55, tf(r=8), "io"), (6.9, tf(r=-4), "io"), (7.8, tf(r=-2), "io"),
             (8.25, tf(r=-22), "io"), (8.6, tf(r=-17), "io"), (8.95, tf(r=-22), "io"), (9.3, tf(r=-18), "io"),
             (HOP[0], tf(r=6), "io"), (HOP[1], tf(r=24), "io"), (HOP[1] + 0.3, tf(r=-8), "io")]
    keys += walk_sway(WALK_OUT[0] + 0.2, T - 0.1, CYC_OUT)
    track("nf-tail", keys)


def prop_tracks():
    # Offset 418 falls past the cat's nose and through the hole.
    track("nf-drop", [
        (0, tf(y=-330, r=-170), "lin"), (6.05, tf(y=-330, r=-170), "fall"),
        (6.52, tf(r=-4), "out"), (6.58, tf(y=2, sx=1.1, sy=0.84), "io"), (6.7, tf(y=-3, sx=0.97, sy=1.05), "io"),
        (6.82, tf(), "io"), (7.48, tf(), "out"), (7.55, tf(y=-4), "fall"), (7.85, tf(y=110, r=10), "lin"),
    ])
    track("nf-whoosh", [(0, "0", "lin"), (6.5, "0", "out"), (6.56, "1", "io"), (6.9, "0", "lin"),
                        (7.6, "0", "out"), (7.66, "1", "io"), (8.0, "0", "lin")], prop="opacity")
    # The question mark pops in with an overshoot and wobbles.
    track("nf-q", [
        (7.95, tf(sx=0.01, sy=0.01, y=10), "back"), (8.25, tf(r=-6), "io"), (8.6, tf(r=5), "io"),
        (8.95, tf(r=-4), "io"), (9.2, tf(r=3), "io"), (9.5, tf(), "in"), (9.7, tf(sx=0.01, sy=0.01, y=6), "lin"),
    ])
    track("nf-q-o", [(0, "0", "lin"), (7.95, "0", "out"), (8.07, "1", "lin"), (9.58, "1", "in"), (9.7, "0", "lin")],
          prop="opacity")


def _num(v):
    return f"{v:.3f}".rstrip("0").rstrip(".").replace("-0.", "-.").lstrip("0") or "0" if abs(v) < 1 else f"{v:.2f}".rstrip("0").rstrip(".")


def _px(v):
    return f"{_num(v)}px" if v else "0"


def _parse(v):
    m = re.match(r"translate\((\S+)px,(\S+)px\) rotate\((\S+)deg\) scale\((\S+),(\S+)\)", v)
    return tuple(float(x) for x in m.groups())


def _compact(track_vals):
    """Write each key with only the transform functions the track uses, in a fixed order, so
    every keyframe of a track has the same function list and interpolates component-wise."""
    vals = [_parse(v) for v in track_vals]
    use_t = any(v[0] or v[1] for v in vals)
    use_r = any(v[2] for v in vals)
    use_s = any(v[3] != 1 or v[4] != 1 for v in vals)
    out = []
    for x, y, r, sx, sy in vals:
        parts = []
        if use_t:
            parts.append(f"translate({_px(x)},{_px(y)})" if any(v[1] for v in vals) else f"translate({_px(x)})")
        if use_r:
            parts.append(f"rotate({_num(r)}deg)" if r else "rotate(0)")
        if use_s:
            parts.append(f"scale({_num(sx)},{_num(sy)})")
        out.append(" ".join(parts) or "none")
    return out


def css():
    out = []
    for name, prop, keys in TRACKS:
        vals = [v for _, v, _ in keys]
        if prop == "transform":
            vals = _compact(vals)
        rules = {}
        order = []
        for (t, _, e), v in zip(keys, vals):
            k = (v, e)
            if k not in rules:
                rules[k] = []
                order.append(k)
            rules[k].append(f"{t / T * 100:.2f}".rstrip("0").rstrip(".") + "%")
        frames = []
        for v, e in order:
            # The element's own timing function is the ease-in-out; keys only name the others.
            ease = "" if e == "io" else f";animation-timing-function:{EASE[e]}"
            frames.append(f"{','.join(rules[(v, e)])}{{{prop}:{v}{ease}}}")
        out.append(f"@keyframes {name}{{{''.join(frames)}}}")
        out.append(f".{name}{{animation-name:{name}!important}}")
    return "\n".join(out)


# ---------------------------------------------------------------- drawing
HEAD = "M20 52C19 38 24 29 31 24Q50 14 69 24C76 29 81 38 80 52C80 72 67 86 50 86C33 86 20 72 20 52Z"
EAR_L = "M34 30L27 6Q27 3 30 5L49 20Z"
EAR_R = "M66 30L73 6Q73 3 70 5L51 20Z"


def g(cls, pivot, inner):
    """An animated part: a static translate to its pivot, the animated group, content offset back."""
    px, py = pivot
    return (f'<g transform="translate({px:g} {py:g})"><g class="{cls}">'
            f'<g transform="translate({-px:g} {-py:g})">{inner}</g></g></g>')


def leg(cls, x, top, hind=False):
    """A leg hanging from its hip or shoulder at (x, top), paw on the floor (y=0)."""
    if hind:
        # The shank kinks back at the hock, as in the logo.
        shape = (f'<path class="cf" d="M{x - 7} {top + 12}C{x - 15} {-30} {x - 13} {-19} {x - 6} {-8}'
                 f'L{x + 5} {-8}C{x + 1} {-19} {x + 4} {-28} {x + 13} {top + 14}Z"/>')
    else:
        shape = (f'<path class="cf" d="M{x - 7} {top}C{x - 7.5} {top + 22} {x - 6} {-22} {x - 5.5} {-8}'
                 f'L{x + 5.5} {-8}C{x + 6} {-22} {x + 7.5} {top + 22} {x + 7} {top}Z"/>')
    paw = f'<ellipse class="cf" cx="{x + 3}" cy="-5" rx="10" ry="5.4"/>'
    # Legs scale from the hip: the shortened forward swing lifts the paw off the floor.
    return g(cls, (x, top + 8), f'<g class="nf-leg">{shape}{paw}</g>')


def joint(x, y, rx, ry):
    """The near thigh or shoulder over the body: a fill with one contour on its front edge."""
    return (f'<ellipse class="nf-fill" cx="{x}" cy="{y}" rx="{rx}" ry="{ry}"/>'
            f'<path class="nf-crease" d="M{x - rx * .2:g} {y - ry:g}A{rx} {ry} 0 0 1 {x + rx * .55:g} {y + ry * .83:g}"/>')


def cat():
    body = ("M30 -96C14 -84 -10 -80 -32 -80C-54 -82 -68 -70 -67 -54C-66 -42 -58 -34 -48 -34"
            "C-32 -36 -14 -40 2 -40C14 -40 22 -34 34 -34C50 -36 58 -56 52 -74C48 -86 40 -94 30 -96Z")
    bib = "M30 -78C44 -80 55 -66 52 -54C50 -45 44 -40 38 -41C40 -53 38 -67 30 -78Z"
    tail = "M0 0C-16 -10 -24 -40 -12 -60C-3 -74 17 -72 17 -57C17 -48 8 -46 4 -51"
    head = (
        g("nf-earl", (38, 24), f'<path class="cf" d="{EAR_L}"/><path class="ce" d="M32 21L30.5 11L41 18Z"/>')
        + g("nf-earr", (62, 24), f'<path class="cf" d="{EAR_R}"/><path class="ce" d="M68 21L69.5 11L59 18Z"/>')
        + f'<path class="cf" d="{HEAD}"/>'
        + '<path class="cw" d="M29 66C31 57 42 55 50 60C58 55 69 57 71 66C71 77 61 84 50 84C39 84 29 77 29 66Z"/>'
        + '<path class="cn" d="M45.5 60.5h9l-4.5 5z"/>'
        + '<path class="wh" d="M31 68L6 63M31 73L7 76M69 68L94 63M69 73L93 76"/>'
        + g("nf-blink", (50, 45),
            '<path class="cw" d="M30 45Q38 37 46 45Q38 50 30 45ZM54 45Q62 37 70 45Q62 50 54 45Z"/>'
            + '<g clip-path="url(#nf-eyes)"><g class="nf-look"><circle class="cp" cx="38" cy="45" r="3.4"/><circle class="cp" cx="62" cy="45" r="3.4"/></g></g>'
            +  g("nf-squint", (38, 40), '<path class="lid" d="M29 42Q38 37 47 43"/>')
            + g("nf-brow", (62, 40), '<path class="lid" d="M53 43Q62 37 71 42"/>'))
        + '<path class="mo nf-m-smile" d="M43 70Q50 77 58 69"/>'
        + '<ellipse class="mo nf-m-o" cx="50.5" cy="72" rx="3" ry="3.6"/>'
        + '<path class="mo nf-m-wavy" d="M42 73Q46 68.5 50 72.5Q54 76.5 58.5 71"/>'
    )
    upper = (
        g("nf-tail", (-56, -76), f'<g transform="translate(-56 -76)"><path class="tl-e" d="{tail}"/><path class="tl" d="{tail}"/></g>')
        + g("nf-fc", (22, -40), leg("nf-ff nf-far", 22, -48)) + g("nf-hc", (-38, -54), leg("nf-hf nf-far", -38, -62, hind=True))
        + f'<path class="cf" d="{body}"/><path class="cw" d="{bib}"/>'
        + g("nf-hc", (-48, -54), leg("nf-hn", -48, -62, hind=True)) + joint(-45, -54, 17, 19)
        + g("nf-fc", (32, -40), leg("nf-fn", 32, -48)) + joint(31, -44, 11, 14)
        + g("nf-head", (40, -82), f'<g transform="translate(-14 -166.2) scale(1.08)">{head}</g>')
    )
    inner = g("nf-bob", (0, 0), upper)
    lean = g("nf-lean", LEAN_PIVOT, inner)
    sq = g("nf-sq", (0, 0), g("nf-pitch", (-6, -60), lean))
    # The blog's rough filter, with a fixed region in the cat's own space: a bounding-box region
    # goes stale while the parts move and clips them.
    hop = f'<g class="nf-hop"><g filter="url(#nf-rough)">{sq}</g></g>'
    return f'<g transform="translate(0 222)"><g class="nf-pos">{hop}</g></g>'


def tile(x, n, cls="chw"):
    return (f'<g class="{cls}"><rect x="{x}" y="222" width="64" height="32" rx="6"/>'
            f'<text x="{x + 32}" y="243.5" text-anchor="middle" class="mono">{n}</text></g>')


def figure():
    tiles = "".join(tile(-20 + i * 72, 400 + i) for i in range(4))
    tiles += "".join(tile(340 + i * 72, 405 + i) for i in range(4))
    ghost = ('<g class="chg"><rect x="268" y="222" width="64" height="32" rx="6"/>'
             '<text x="300" y="243.5" text-anchor="middle" class="mono">404</text></g>')
    drop = ('<g clip-path="url(#nf-hole)"><g transform="translate(300 238)"><g class="nf-drop">'
            '<rect class="nf-base" x="-32" y="-16" width="64" height="32" rx="6"/>'
            '<g class="chw nf-418"><rect x="-32" y="-16" width="64" height="32" rx="6"/>'
            '<text y="5.5" text-anchor="middle" class="mono">418</text></g></g></g></g>')
    whoosh = '<path class="lnm nf-whoosh" d="M258 196l-9 -6M342 196l9 -6M262 210l-12 -1M338 210l12 -1"/>'
    q = ('<g transform="translate(300 64)"><g class="nf-q"><g class="nf-q-o">'
         '<text class="hand a" text-anchor="middle" font-size="46" y="16">?</text></g></g></g>')
    defs = ('<defs><filter id="nf-rough" filterUnits="userSpaceOnUse" x="-170" y="-290" width="360" height="320">'
            '<feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7"/>'
            '<feDisplacementMap in="SourceGraphic" scale="2"/></filter><linearGradient id="nf-edge"><stop offset="0" stop-color="#000"/>'
            '<stop offset=".11" stop-color="#fff"/><stop offset=".89" stop-color="#fff"/>'
            '<stop offset="1" stop-color="#000"/></linearGradient>'
            '<mask id="nf-fade" maskUnits="userSpaceOnUse" x="0" y="-40" width="600" height="340">'
            '<rect x="0" y="-40" width="600" height="340" fill="url(#nf-edge)"/></mask>'
            '<clipPath id="nf-eyes"><path d="M30 45Q38 37 46 45Q38 50 30 45ZM54 45Q62 37 70 45Q62 50 54 45Z"/></clipPath><clipPath id="nf-hole"><rect x="200" y="-120" width="200" height="375.5"/></clipPath></defs>')
    return (
        '<svg class="ck-svg nf-svg" viewBox="0 0 600 280" role="img" aria-labelledby="nf-t nf-d">'
        '<title id="nf-t">The Felix cat finds no record at offset 404</title>'
        '<desc id="nf-d">The Felix cat walks along a row of numbered records, 401, 402, 403, and stops '
        'where 404 should be: there is only a dashed outline. It peers in and paws at it. Record 418 '
        'tumbles down past its nose and falls straight through the hole. The cat looks at you, puzzled, '
        'then hops the gap and walks on.</desc>'
        f'{defs}<g font-size="15"><g mask="url(#nf-fade)">{tiles}</g>{ghost}{drop}{whoosh}'
        # The cat is not masked: it walks in and out past the stage's edge, which clips it.
        f'{cat()}{q}</g></svg>'
    )


STATIC_CSS = """
.nf-fig { margin: 0 auto 36px; max-width: 640px; }
.nf-fig .stage { padding: 26px 18px 14px; }
.nf-svg { max-width: 600px; }
.nf-svg [class^="nf-"], .nf-svg [class*=" nf-"] {
  transform-origin: 0 0;
  /* !important throughout: site.css turns every animation off under reduced motion, and this
     figure keeps its tracks so it can hold a chosen frame instead. */
  animation-duration: %(T)gs !important;
  animation-iteration-count: infinite !important;
  animation-fill-mode: both !important;
  animation-delay: -%(START)gs !important;
  animation-timing-function: %(IO)s !important;
}
.nf-svg .nf-fill { fill: var(--cat); }
.nf-svg .nf-base { fill: var(--bg-raised); }
.nf-svg .nf-crease { fill: none; stroke: var(--cat-edge); stroke-width: 2.4; stroke-linecap: round; }
.nf-svg .nf-far .cf { fill: color-mix(in srgb, var(--cat) 78%%, var(--ear)); }
.nf-svg .nf-m-o, .nf-svg .nf-m-wavy, .nf-svg .nf-q-o, .nf-svg .nf-whoosh { opacity: 0; }
/* Solarized's cyan is under 4.5:1 on the stage; lift the record numbers toward the text colour. */
:root[data-theme="solarized"] .nf-svg .chw text { fill: color-mix(in srgb, var(--accent-text) 70%%, var(--text)); }
@media (prefers-reduced-motion: reduce) {
  .nf-svg [class^="nf-"], .nf-svg [class*=" nf-"] {
    animation-play-state: paused !important;
    animation-delay: -%(STILL)gs !important;
  }
}
"""


def build():
    legs()
    body_tracks()
    head_tracks()
    tail_tracks()
    prop_tracks()
    style = (STATIC_CSS % {"T": T, "START": START, "STILL": STILL, "IO": EASE["io"]}).strip() + "\n" + css()
    return style, figure()


if __name__ == "__main__":
    style, fig = build()
    root = pathlib.Path(__file__).resolve().parents[2]
    page = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else root / "static/404.html"
    html = page.read_text()
    html = re.sub(r"(<style id=\"nf-style\">).*?(</style>)", lambda m: m.group(1) + "\n" + style + "\n" + m.group(2), html, flags=re.S)
    html = re.sub(r"(<!-- nf-art -->).*?(<!-- /nf-art -->)", lambda m: m.group(1) + fig + m.group(2), html, flags=re.S)
    page.write_text(html)
    print(f"style {len(style)} B, figure {len(fig)} B")

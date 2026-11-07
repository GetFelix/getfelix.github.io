+++
title = "A whole cluster on one clock"
description = "Felix runs real brokers and a real control plane in one test process on a paused clock, injects faults from a seed, pauses the control plane mid-failover, and checks what clients saw with Elle-style and linearizability checkers. Why we cut the simulator where we did, and what a failing seed gives you."
date = 2026-11-05T15:00:00
slug = "a-cluster-on-one-clock"
path = "blog/a-cluster-on-one-clock.html"

[taxonomies]
topics = ["testing", "replication"]

[extra]
read_minutes = 8
card = "cards/a-cluster-on-one-clock.svg"
+++

Pause the control plane. A second or two later, crash a broker that leads shards. Keep the control plane paused a while longer, then bring everything back. Does every shard end up with exactly one leader?

On a real cluster that question costs minutes of wall time per try. The version that matters, where a heartbeat or a catalog fetch is in flight at the moment the pause lands, can take hundreds of tries to hit, and when it fails you get a log and no way to make it happen again.

In Felix's simulator it is one seed among many. Several real brokers and a real control plane run in one test process on tokio's paused clock, so minutes of cluster time take seconds. Faults come from the seed. When a seed fails, it prints the command that runs it again.

<figure class="fig ck">
      <div class="stage glow"><svg class="ck-svg" viewBox="0 0 460 330" role="img" aria-labelledby="sm1-t"><title id="sm1-t">The Felix cat stands beside a script headed seed 4127. It lists faults by virtual time: 8 seconds, crash b2; 21 seconds, control plane paused; 23 seconds, crash a leader; 90 seconds, heal everything; then check. Below, three brokers b1, b2 and b3, with b2 crossed out. The cat says: Same seed, same faults.</title><g font-size="18"><path class="ground" d="M8 318C120 315 300 321 452 317"/><g class="rough"><path class="bubble" d="M18 10h134a12 12 0 0 1 12 12v50a12 12 0 0 1-12 12H84l-14 16 0-16H18a12 12 0 0 1-12-12V22a12 12 0 0 1 12-12z"/></g><text x="85" y="42" class="hand" font-size="21" text-anchor="middle">Same seed,</text><text x="85" y="68" class="hand" font-size="21" text-anchor="middle">same faults.</text><g class="rough"><g transform="translate(10 128) scale(0.95 0.95)"><path class="tl-e" d="M84 178C114 176 122 146 108 128C99 116 104 102 114 102"/><path class="tl" d="M84 178C114 176 122 146 108 128C99 116 104 102 114 102"/><path class="cf" d="M30 80C14 108 11 160 20 188L86 188C96 160 94 110 72 80Z"/><path class="cw" d="M38 90C33 120 37 150 50 168C63 150 67 120 62 90C56 97 44 97 38 90Z"/><ellipse class="cf" cx="38" cy="187" rx="12" ry="6"/><ellipse class="cf" cx="64" cy="187" rx="12" ry="6"/><g transform="translate(0 -2)"><path class="cf" d="M20 52C19 38 24 29 31 24L27 6Q27 3 30 5L47 17Q50 16.5 53 17L70 5Q73 3 73 6L69 24C76 29 81 38 80 52C80 72 67 86 50 86C33 86 20 72 20 52Z"/><path class="ce" d="M32 21L30.5 11L41 18ZM68 21L69.5 11L59 18Z"/><path class="cw" d="M29 66C31 57 42 55 50 60C58 55 69 57 71 66C71 77 61 84 50 84C39 84 29 77 29 66Z"/><path class="cn" d="M45.5 60.5h9l-4.5 5z"/><path class="wh" d="M31 68L6 63M31 73L7 76M69 68L94 63M69 73L93 76"/><path class="cw" d="M30 45Q38 37 46 45Q38 50 30 45ZM54 45Q62 37 70 45Q62 50 54 45Z"/><circle class="cp" cx="40" cy="45" r="3.4"/><circle class="cp" cx="64" cy="45" r="3.4"/><path class="lid" d="M29 42Q38 37 47 43M53 43Q62 37 71 42"/><path class="mo" d="M43 70Q50 77 58 69"/></g></g></g><g class="rough"><g transform="rotate(2 300 110)"><rect class="paper" x="176" y="14" width="268" height="190" rx="6"/></g></g><text x="310" y="42" class="mono" font-size="17" text-anchor="middle">seed 4127</text><path class="ln dash" d="M192 54H428"/><text x="196" y="80" class="mono m" font-size="15">8s</text><text x="246" y="80" class="mono" font-size="15">crash b2</text><text x="196" y="106" class="mono m" font-size="15">21s</text><text x="246" y="106" class="mono wn" font-size="15">control plane paused</text><text x="196" y="132" class="mono m" font-size="15">23s</text><text x="246" y="132" class="mono bad" font-size="15">crash a leader</text><text x="196" y="158" class="mono m" font-size="15">90s</text><text x="246" y="158" class="mono ok" font-size="15">heal everything</text><text x="196" y="184" class="mono m" font-size="15">120s</text><text x="246" y="184" class="mono" font-size="15">clients stop</text><g class="rough"><rect class="box" x="186" y="232" width="70" height="56" rx="8"/></g><text x="221" y="266" class="mono" font-size="17" text-anchor="middle">b1</text><g class="rough"><rect class="box" x="276" y="232" width="70" height="56" rx="8"/></g><text x="311" y="266" class="mono" font-size="17" text-anchor="middle">b2</text><g class="rough"><rect class="box" x="366" y="232" width="70" height="56" rx="8"/></g><text x="401" y="266" class="mono" font-size="17" text-anchor="middle">b3</text><path class="strike" d="M282 238L340 282M340 238L282 282"/><text x="310" y="308" class="m" font-size="13" text-anchor="middle">virtual time: free</text></g></svg></div>
      <figcaption><b>Figure 1</b>A seed is a script. It fixes the cluster's shape, the faults and when they land, and every client's choices.</figcaption>
    </figure>

## Why we built our own

The [cluster harness](https://github.com/GetFelix/felix/blob/main/docs/cluster-harness.md) runs real broker processes over real QUIC, and the [history checker](https://github.com/GetFelix/felix/blob/main/docs/history-checker.md) reads what its clients saw. That finds bugs. It finds them slowly, and every run is a new interleaving.

There are simulators for Rust. [turmoil](https://github.com/tokio-rs/turmoil) simulates the sockets it hands you, and [madsim](https://github.com/madsim-rs/madsim) swaps in its own runtime for tokio across every crate you build. A Felix broker talks to its peers over QUIC with TLS on quinn, talks to the control plane over HTTP with reqwest, and does its disk I/O on blocking threads. Either tool would have meant adapting that transport before we tested anything above it.

Above it is where our bugs live. Elections, fencing, promotion, lease expiry and placement are where a cluster decides who leads, and that code already had seams. Replication, suspicion and election reach peers only through a `PeerRequester` trait and answer them through `PeerRequestHandler`. The control plane's store has an in-memory backend. Timers and deadlines were already on tokio time.

So the simulator cuts at the boundary between replication and placement and the wires under them. Code that makes a decision runs as it does in a broker. Code that moves bytes between processes is replaced.

<figure class="fig ck">
      <div class="stage"><svg class="ck-svg" viewBox="0 0 480 400" role="img" aria-labelledby="sm2-t"><title id="sm2-t">One box labelled one process, one paused clock. On the left, under runs for real: replication, election, routing, placement, and storage on a temp dir. On the right, under swapped at a seam: SimNet for QUIC to peers, SimLink for HTTP to the control plane, and a sim clock for lease and wall time. A small happy Felix cat says: Decide for real. Fake the wires.</title><g font-size="18"><g class="rough"><rect class="panel" x="12" y="12" width="456" height="376" rx="12"/></g><text x="240" y="40" class="cap" font-size="13" text-anchor="middle">ONE PROCESS, ONE PAUSED CLOCK</text><text x="128" y="72" class="m" font-size="15" text-anchor="middle">runs for real</text><text x="356" y="72" class="m" font-size="15" text-anchor="middle">swapped at a seam</text><g class="chw"><rect x="34" y="86" width="190" height="30" rx="6"/><text x="129.0" y="106.5" text-anchor="middle" font-size="15">replication</text></g><g class="chw"><rect x="34" y="124" width="190" height="30" rx="6"/><text x="129.0" y="144.5" text-anchor="middle" font-size="15">election</text></g><g class="chw"><rect x="34" y="162" width="190" height="30" rx="6"/><text x="129.0" y="182.5" text-anchor="middle" font-size="15">routing</text></g><g class="chw"><rect x="34" y="200" width="190" height="30" rx="6"/><text x="129.0" y="220.5" text-anchor="middle" font-size="15">placement</text></g><g class="chw"><rect x="34" y="238" width="190" height="30" rx="6"/><text x="129.0" y="258.5" text-anchor="middle" font-size="15">storage on a temp dir</text></g><g class="chc"><rect x="262" y="86" width="186" height="30" rx="6"/><text class="mono" x="355.0" y="106.5" text-anchor="middle" font-size="15">SimNet</text></g><text x="355" y="134" class="m" font-size="13" text-anchor="middle">for QUIC to peers</text><g class="chc"><rect x="262" y="148" width="186" height="30" rx="6"/><text class="mono" x="355.0" y="168.5" text-anchor="middle" font-size="15">SimLink</text></g><text x="355" y="196" class="m" font-size="13" text-anchor="middle">for HTTP to the CP</text><g class="chc"><rect x="262" y="210" width="186" height="30" rx="6"/><text class="mono" x="355.0" y="230.5" text-anchor="middle" font-size="15">sim clock</text></g><text x="355" y="258" class="m" font-size="13" text-anchor="middle">for lease and wall time</text><path class="lna dash" d="M243 90V268"/><g class="rough"><g transform="translate(352 286) scale(0.5 0.5)"><path class="tl-e" d="M84 178C114 176 122 146 108 128C99 116 104 102 114 102"/><path class="tl" d="M84 178C114 176 122 146 108 128C99 116 104 102 114 102"/><path class="cf" d="M30 80C14 108 11 160 20 188L86 188C96 160 94 110 72 80Z"/><path class="cw" d="M38 90C33 120 37 150 50 168C63 150 67 120 62 90C56 97 44 97 38 90Z"/><ellipse class="cf" cx="38" cy="187" rx="12" ry="6"/><ellipse class="cf" cx="64" cy="187" rx="12" ry="6"/><g transform="translate(0 -2)"><path class="cf" d="M20 52C19 38 24 29 31 24L27 6Q27 3 30 5L47 17Q50 16.5 53 17L70 5Q73 3 73 6L69 24C76 29 81 38 80 52C80 72 67 86 50 86C33 86 20 72 20 52Z"/><path class="ce" d="M32 21L30.5 11L41 18ZM68 21L69.5 11L59 18Z"/><path class="cw" d="M29 66C31 57 42 55 50 60C58 55 69 57 71 66C71 77 61 84 50 84C39 84 29 77 29 66Z"/><path class="cn" d="M45.5 60.5h9l-4.5 5z"/><path class="wh" d="M31 68L6 63M31 73L7 76M69 68L94 63M69 73L93 76"/><path class="hap" d="M31 47Q38 39 45 47M55 47Q62 39 69 47"/><path class="mo" d="M43 70Q50 77 58 69"/></g></g></g><g class="rough"><path class="bubble" d="M40 300h270a10 10 0 0 1 10 10v30a10 10 0 0 1-10 10H40a10 10 0 0 1-10-10v-30a10 10 0 0 1 10-10z"/></g><text x="175" y="331" class="hand" font-size="20" text-anchor="middle">Decide for real. Fake the wires.</text><path class="ln" d="M320 322L346 330"/></g></svg></div>
      <figcaption><b>Figure 2</b>Everything that makes a decision runs as it does in a broker. Only the wires and the clocks are replaced.</figcaption>
    </figure>

Three things are swapped.

The peer network becomes `SimNet`. Each running broker gets a `SimPeer` as its requester. A request runs on the target's real handler, in a task of its own, after a round trip through the peer codec in both directions. The caller waits exactly as long as the real pool would. Each directed link can be partitioned, can drop requests or answers with a probability drawn from the seed, or can delay them. A crash ends a broker's incarnation: a request to it fails at that moment, and its old requester is refused even after it restarts, the way a connection does not outlive its process.

The control plane link becomes a trait. The broker makes eight kinds of request to the control plane (register, node lookup, heartbeat, drain, node catalog, assignment snapshot, assignment changes, replica status), and `ControlPlaneLink` has one method for each. A real broker uses `HttpControlPlaneLink`, which holds the reqwest code it always had. The simulator's `SimLink` sends the same requests to the real control plane router, in process, with no socket.

The clocks follow virtual time. Leases are measured on `felix_common::clock::boottime` and heartbeats are stamped with `wall_millis`, neither of which is tokio's clock. A hook, `felix_common::clock::sim::install`, hands both to the simulator, with wall time counted from a fixed date so every run sees the same timestamps.

Storage is not swapped. Each broker opens the real durable store on its own temporary directory, so a restart after a crash goes through real recovery.

None of this costs a release build anything. `spawn_shard_tasks` is generic over the requester, and a broker passes its `PeerPool`, so the compiler builds the code it always did with no trait object on the publish or peer path. The clock hook exists only in debug builds and under a `sim` feature.

## What a run does

A seed fixes a cluster of three to five brokers, one durable stream of 50 to 200 shards and one cache, all `Quorum` and replicated three ways. Everything runs on a single-threaded tokio runtime that starts paused. Tokio jumps the clock forward whenever every task is waiting, so a sixty-second timeout costs nothing.

Six clients publish, put, get and delete, and two more read whole shards. For the first 90 seconds of virtual time a nemesis plays a schedule of faults, also drawn from the seed, and they may overlap. A broker crashes and restarts later with its data directory intact. A broker is cut off from its peers, or from its peers and the control plane both. The cluster splits, and the control plane sits with the majority or with everyone. One direction of one link drops. The control plane slows down, pauses or goes down.

At 90 seconds everything heals. The clients carry on until 120 seconds, the harness waits for work in flight to finish, takes a final read of every shard and every cache key, and runs the checkers.

## A paused control plane

A control plane that is down fails every call at once, the way a refused connection does. A broker gets an error and moves on.

A paused one is harder. In the simulator every call parks. A caller with a timeout gives up on its own schedule, and a call still parked when the pause ends goes through late, the way a resumed process answers a request it had already read. The simulator does not run the control plane's background loops; the harness steps placement and node expiry itself, and a paused control plane is not stepped. So during a pause, nothing is reassigned and nobody is expired, and the brokers have to work out leadership among themselves.

One fault in the schedule exists for exactly that. It pauses the control plane, crashes a broker that leads shards a second or two later, and keeps the control plane paused for up to 35 seconds in all. The broker's timeouts on control plane calls then race the timeouts inside an election.

A frozen broker is the one fault the simulator only approximates. A real paused process runs nothing and wakes up acting on stale state. Here all brokers share one runtime, so a frozen broker is cut off from the network and the control plane but keeps running, and notices its own lease expiring on time. The network half of a pause is real; the zombie that wakes up believing it still leads stays with the cluster harness.

## Checking what clients saw

A simulated client publishes, puts, gets and deletes through the same in-process entry points the broker's request handlers use. It follows redirects, retries when a broker refuses, and gives up after a deadline, as an SDK does. Every operation is recorded with when it started, when it ended and what came back. An offset means the append happened. A refusal that says nothing was written means it did not. A timeout, an `OutcomeUnknown` or a crash in between means it might have.

For streams the model is [Elle](https://github.com/jepsen-io/elle)'s list-append. Each shard is a list, and since Felix hands back the offset of every record, the checker reads the order directly instead of inferring it. Every read must be a prefix of the final log. Then the checker draws a graph of the operations on each list, with an edge from whatever has to come first: one append sits before another, a read saw an append, a read stopped before an append, or one operation finished before the other began. It finds loops with Tarjan's strongly connected components and names each one by its edges, as Elle does: `G0`, `G1c`, `G-single`, `G2`, and a `-realtime` form of each.

<figure class="fig ck">
      <div class="stage"><svg class="ck-svg" viewBox="0 0 460 400" role="img" aria-labelledby="sm3-t"><title id="sm3-t">Two operations on one stream shard: append B, acknowledged, and a read that returned only A. An arrow over the top, labelled rt, says B was acknowledged before the read began, so B comes first. An arrow underneath, labelled rw, says the read stopped before B, so the read comes first. Together they form a loop named G-single-realtime. The Felix cat, wide-eyed, says: Each one came first. Bad.</title><g font-size="18"><path class="ground" d="M8 390C120 387 300 393 452 389"/><g class="chw"><rect x="16" y="90" width="176" height="36" rx="6"/><text class="mono" x="104.0" y="113.5" text-anchor="middle" font-size="14">append(B): ok</text></g><g class="chr"><rect x="304" y="90" width="140" height="36" rx="6"/><text class="mono" x="374.0" y="113.5" text-anchor="middle" font-size="14">read: [A]</text></g><path class="lna" d="M104 86C150 24 320 24 372 86"/><path class="lna" d="M372 86l-11-3M372 86l-3-11"/><text x="238" y="22" class="a" font-size="15" text-anchor="middle">rt: B was acked before the read began</text><path class="lnb" d="M372 130C320 186 150 186 104 130"/><path class="lnb" d="M104 130l11 3M104 130l3 11"/><text x="238" y="200" class="bad" font-size="15" text-anchor="middle">rw: the read stopped before B</text><g class="chx"><rect x="154" y="212" width="168" height="30" rx="6"/><text class="mono" x="238.0" y="232.5" text-anchor="middle" font-size="14">G-single-realtime</text></g><g class="rough"><g transform="translate(24 214) scale(0.8 0.8)"><path class="tl-e" d="M84 178C114 176 122 146 108 128C99 116 104 102 114 102"/><path class="tl" d="M84 178C114 176 122 146 108 128C99 116 104 102 114 102"/><path class="cf" d="M30 80C14 108 11 160 20 188L86 188C96 160 94 110 72 80Z"/><path class="cw" d="M38 90C33 120 37 150 50 168C63 150 67 120 62 90C56 97 44 97 38 90Z"/><ellipse class="cf" cx="38" cy="187" rx="12" ry="6"/><ellipse class="cf" cx="64" cy="187" rx="12" ry="6"/><g transform="translate(0 -2)"><path class="cf" d="M20 52C19 38 24 29 31 24L27 6Q27 3 30 5L47 17Q50 16.5 53 17L70 5Q73 3 73 6L69 24C76 29 81 38 80 52C80 72 67 86 50 86C33 86 20 72 20 52Z"/><path class="ce" d="M32 21L30.5 11L41 18ZM68 21L69.5 11L59 18Z"/><path class="cw" d="M29 66C31 57 42 55 50 60C58 55 69 57 71 66C71 77 61 84 50 84C39 84 29 77 29 66Z"/><path class="cn" d="M45.5 60.5h9l-4.5 5z"/><path class="wh" d="M31 68L6 63M31 73L7 76M69 68L94 63M69 73L93 76"/><path class="cw" d="M29 45Q38 34 47 45Q38 53 29 45ZM53 45Q62 34 71 45Q62 53 53 45Z"/><circle class="cp" cx="38" cy="44" r="4.2"/><circle class="cp" cx="62" cy="44" r="4.2"/><path class="mo" d="M45 73Q50 69 55 73"/></g></g></g><g class="rough"><path class="bubble" d="M164 266h272a12 12 0 0 1 12 12v38a12 12 0 0 1-12 12H164a12 12 0 0 1-12-12v-14l-16-6 16-6v-12a12 12 0 0 1 12-12z"/></g><text x="300" y="304" class="hand" font-size="21" text-anchor="middle">Each one came first. Bad.</text><text x="300" y="360" class="m" font-size="14" text-anchor="middle">a loop of must-come-before = no real order</text></g></svg></div>
      <figcaption><b>Figure 3</b>A stale read as the checker sees it: two edges that each say the other operation came first. Any loop means no single order of the log explains what clients saw.</figcaption>
    </figure>

The "read stopped before" edge is only sound when a read really reaches the end of the log. A live subscriber may drop its newest records, so the cluster harness leaves that edge out. The simulator's reads page through committed records to the shard's end on the broker that serves it, so they cannot drop their tail and the checker uses the edge.

For the cache the check is linearizability, one key at a time, using the Wing, Gong and Lowe search that [Porcupine](https://github.com/anishathalye/porcupine) uses. It looks for one order of a key's operations that respects real time and behaves like a single variable. A put whose outcome is unknown may take effect at any point after it started, or never. The search is bounded: past 20 million tries a key is reported as undecided, which is neither a pass nor a failure. A violation prints a witness, the longest order the search could build and the operations that could not come next.

Both checkers live in the history checker, so the cluster harness's long runs use them too.

Beside the history, one checker looks at the cluster itself. After the heal, every shard must be served by exactly one broker within 60 seconds of virtual time. Served means a broker routes the shard to itself, its fence is open at that generation and its lease is valid. A shard that never gets there fails the seed, and the failure prints a census: what every broker and the control plane believe about that shard, side by side.

## What a failing seed gives you

A failure prints the seed, what each checker found, and one line to run it again:

```bash
FELIX_SIM_SEED=4127 cargo test -p felix-sim --test seeds replay -- --nocapture
```

Add `RUST_LOG` for the brokers' logs. The replay builds the same cluster, plays the same faults at the same virtual times, and makes the same client choices and the same network drops.

It is not bit-for-bit. The brokers iterate hash maps whose order varies by process, file I/O finishes in real time, and tokio's `select!` picks among ready branches at random. So the interleaving under the same faults can differ, and a seed that failed once may pass on a replay. Run it a few times before calling it a fluke.

A seed that exposes a bug gets an issue and is pinned in `tests/seeds.rs` with `#[ignore = "#<issue>"]`. The rule written next to the checkers is the one we hold to: don't weaken a checker to make a seed pass.

## What it costs

In a release build, nothing. Peer traffic is still monomorphized, the control plane link is off the hot path, and the clock hook is not compiled in.

In tests, a run is seconds of real time. The price of cutting at the replication boundary is that the transport is not under test: QUIC, TLS and the listener's per-stream limits are exercised by the cluster harness, which runs beside the simulator.

## What we learned

Most of the seams were already there, because replication was already written against traits. The real work was the control plane, which the broker reached through plain HTTP calls scattered across a few modules. Putting them behind one trait made the in-process control plane a small piece of code.

Paused and down are different faults. Down is loud and every caller hears it. Paused is quiet, and it tests whether each timeout agrees with the others.

A replay that lands the same faults at the same times is far better than a log. Even when the interleaving differs, the seed tells you which faults to look at and when.

## Trying it

```bash
cargo test -p felix-sim
FELIX_SIM_SEEDS=50 cargo test -p felix-sim --test seeds seeds -- --nocapture
```

[`docs/simulation.md`](https://github.com/GetFelix/felix/blob/main/docs/simulation.md) covers what runs for real and what is simulated, and [`docs/history-checker.md`](https://github.com/GetFelix/felix/blob/main/docs/history-checker.md) has every rule the checker applies. The [testing page](https://docs.getfelix.dev/architecture/testing/) covers the rest of Felix's tests, the cluster harness among them. The work is tracked in [GetFelix/felix#419](https://github.com/GetFelix/felix/issues/419).

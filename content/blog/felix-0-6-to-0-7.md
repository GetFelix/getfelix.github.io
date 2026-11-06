+++
title = "What changed between Felix 0.6 and 0.7, and why"
description = "What changed between Felix 0.6 and 0.7: shards that elect a leader while the control plane is down, replica sets that change without losing a write, record headers, an MQTT front door, how we tested it, and how to upgrade."
date = 2026-11-07
slug = "felix-0-6-to-0-7"
path = "blog/felix-0-6-to-0-7.html"
[taxonomies]
topics = ["replication", "testing", "compatibility"]
[extra]
read_minutes = 12
card = "cards/felix-0-6-to-0-7.svg"
+++

<!-- TODO(release day): set date to the 0.7.0 tag date. -->

Much of Felix 0.6 was about making sure an acknowledged record stays acknowledged. 0.7 is about what happens when the thing that usually decides is not there: a leader that died while the control plane was down, or a replica set halfway through a change.

This post is the map. It groups the work into five threads, says how we tested it, and ends with how to upgrade. Several stories already have a post of their own. Where one does, we say what it found in a sentence or two and link to it.

Most of 0.7 is opt-in. Beyond the fixes, a 0.6.2 cluster that upgrades behaves as before until an operator turns a feature on, with the two exceptions under [Upgrading](#upgrading).

## How we tested it {#testing}

Failover without the control plane is the biggest change in this release. Our usual tools find bugs in that kind of code slowly, so we built a new one and sharpened two old ones.

**A simulator.** Several real brokers and a real control plane run in one test process on tokio's paused clock. The network between brokers, the clocks and each broker's disk are simulated, and every fault comes from one seed. A failing seed prints the command that runs it again. The disk can rebuild what a power loss would leave, by the same rules as our storage power-loss tests, though the simulator does not cut the power yet. [A whole cluster on one clock](/blog/a-cluster-on-one-clock.html) explains where we cut the simulator and why.

**A history checker.** This is a Jepsen-style check of what clients saw. Clients append to streams and write cache keys while a nemesis kills, pauses and partitions brokers. The checker then compares the record of every operation with what a replicated log promises. It uses Elle's list-append model and looks for the cycles Elle names (`G0`, `G1c`, `G-single`, `G2`, each with a real-time variant), and it checks cache keys for linearizability. It has 21 rules now, the last of them "one leader per generation", and a new nemesis kills leaders while the control plane is down so that the replicas have to elect.

**TLA+.** The shard model gained replicas that elect themselves under ballots. It found bugs in real runs too. [The report that named everyone](/blog/the-report-that-named-everyone.html) is one: an acknowledged write lost across two failovers, because a leader reported followers as caught up before they had answered anything.

Long cluster runs were a fourth source. A scale test with a thousand workloads kept finding shards that waited forever for an answer nobody was going to send. [Silence is not evidence](/blog/silence-is-not-evidence.html) is about those, and the rule we took from them: every wait needs an end that a node can actually observe.

## Thread one: failover without the control plane {#election}

In 0.6, the control plane decided every failover. When a shard's leader died, the control plane picked a follower and named it. If the control plane was down at that moment, nobody could, and the shard stopped taking writes until it came back.

In 0.7 a shard's replicas can elect a new leader themselves.

<figure class="fig ck">
      <div class="stage glow"><svg class="ck-svg" viewBox="0 0 480 330" role="img" aria-labelledby="f67a-t"><title id="f67a-t">The control plane is drawn dashed and asleep. Of a shard's three copies, A, the old leader, is crossed out. C hands B a ballot for generation 8. Above B, the Felix cat wears a crown and says: Two of three. I'll take it.</title><g font-size="16"><path class="ground" d="M8 318C140 315 320 321 472 317"/><text x="20" y="32" class="cap" font-size="15" text-anchor="start">CONTROL PLANE DOWN</text><g class="chg"><rect x="312" y="12" width="152" height="46" rx="8"/><text x="388" y="41" font-size="16" text-anchor="middle">control plane</text></g><text x="436" y="82" class="hand m" font-size="22" text-anchor="middle">zzz</text><g class="rough"><path class="bubble" d="M18 62h150a10 10 0 0 1 10 10v44a10 10 0 0 1-10 10h-2l14 14-28-14H18a10 10 0 0 1-10-10V72a10 10 0 0 1 10-10z"/></g><text x="93" y="90" class="hand" font-size="19" text-anchor="middle">Two of three.</text><text x="93" y="114" class="hand" font-size="19" text-anchor="middle">I'll take it.</text><g class="rough"><g transform="translate(196 128) scale(0.9)"><g transform="translate(0 -2)"><path class="crown" d="M28 10L33 -8L42 4L50 -12L58 4L67 -8L72 10Z"/><path class="cf" d="M20 52C19 38 24 29 31 24L27 6Q27 3 30 5L47 17Q50 16.5 53 17L70 5Q73 3 73 6L69 24C76 29 81 38 80 52C80 72 67 86 50 86C33 86 20 72 20 52Z"/><path class="ce" d="M32 21L30.5 11L41 18ZM68 21L69.5 11L59 18Z"/><path class="cw" d="M29 66C31 57 42 55 50 60C58 55 69 57 71 66C71 77 61 84 50 84C39 84 29 77 29 66Z"/><path class="cn" d="M45.5 60.5h9l-4.5 5z"/><path class="wh" d="M31 68L6 63M31 73L7 76M69 68L94 63M69 73L93 76"/><path class="hap" d="M31 45Q38 51 45 45M55 45Q62 51 69 45"/><path class="mo" d="M43 70Q50 77 58 69"/></g></g></g><g class="rough"><g transform="rotate(-5 404 170)"><rect class="ballot" x="356" y="136" width="96" height="66" rx="4"/></g></g><text x="404" y="160" class="cap" font-size="12" text-anchor="middle">BALLOT</text><text x="404" y="186" class="mono" font-size="15" text-anchor="middle">gen 8: B</text><path class="lnok" d="M350 176C330 172 312 172 292 176"/><path class="lnok" d="M300 170L292 176L300 182"/><g class="rough"><rect class="box" x="20" y="228" width="124" height="64" rx="8"/></g><text x="82" y="258" class="mono" font-size="18" text-anchor="middle">A</text><text x="82" y="280" class="m" font-size="13" text-anchor="middle">old leader</text><path class="strike" d="M58 238L106 266M106 238L58 266"/><g class="rough"><rect class="boxa" x="178" y="228" width="124" height="64" rx="8"/></g><text x="240" y="258" class="mono" font-size="18" text-anchor="middle">B</text><text x="240" y="280" class="m" font-size="13" text-anchor="middle">copy</text><g class="rough"><rect class="box" x="336" y="228" width="124" height="64" rx="8"/></g><text x="398" y="258" class="mono" font-size="18" text-anchor="middle">C</text><text x="398" y="280" class="m" font-size="13" text-anchor="middle">copy</text></g></svg></div>
      <figcaption><b>Figure 1</b>The leader is gone and the control plane is asleep. B and C are a majority of the shard's copies, so they can pick a leader on their own.</figcaption>
    </figure>

A follower that has not heard from its leader for five seconds asks the other copies for a pre-vote. A copy says yes only if it cannot hear the leader either and the candidate's log is at least as far ahead as its own, so one follower with a bad network link cannot unseat a leader the others still hear. With a majority, the candidate writes a ballot to disk, fences the copies at a new generation, takes the most complete log among the answers and opens the shard. A copy gives its ballot for a generation to one candidate only, so two candidates cannot both win. When the control plane comes back, the new leader reports that it was elected and the control plane adopts it.

It covers durable `Quorum` streams and `Quorum` caches, the shards where the control plane could already replace a leader on its followers' word. `Leader` streams and in-memory streams still wait for the old leader's lease to run out. So do consumer groups: a group on a shard with an elected leader waits for the control plane to return.

A broker that restarts during the outage waits for the control plane by default, so it neither votes nor stands. With `FELIX_START_WITHOUT_CONTROLPLANE=true` it rejoins from what the control plane last told it, kept in its data directory, and votes. It still serves no client until the control plane is back.

Elections are off by default. An operator turns them on with `FELIX_INTERNAL_ELECTION=true` on every broker and then finalizes `joint_fence` and `replica_election`. An upgraded cluster finalizes a few earlier features first. [Failover without the control plane](https://docs.getfelix.dev/deployment/failover-without-control-plane/) has the whole sequence, what the logs say when it happens, and its limits.

## Thread two: changing a replica set without losing a write {#joint}

Election made an older problem sharper. A replica set changes during a move, a replacement or a failover, and the new set can share very little with the old one.

<figure class="fig ck">
      <div class="stage"><svg class="ck-svg" viewBox="0 0 480 330" role="img" aria-labelledby="f67b-t"><title id="f67b-t">A move changes a shard's set from A, B and C to A, D and E. A, the old leader, is crossed out in both. B and C hold record 41. D and E do not have it yet. Fencing a majority of the new set alone, D and E, loses record 41. Fencing a majority of each set, D and E, and B and C, keeps it. The Felix cat says: both, please.</title><g font-size="16"><text x="20" y="32" class="cap" font-size="15" text-anchor="start">A MOVE: {A, B, C} TO {A, D, E}</text><g class="rough"><path class="bubble" d="M300 46h88a8 8 0 0 1 8 8v22a8 8 0 0 1-8 8h-88a8 8 0 0 1-8-8v-22a8 8 0 0 1 8-8z"/></g><text x="344" y="71" class="hand" font-size="18" text-anchor="middle">both, please</text><g class="rough"><g transform="translate(408 30) scale(0.6)"><g transform="translate(0 -2)"><path class="cf" d="M20 52C19 38 24 29 31 24L27 6Q27 3 30 5L47 17Q50 16.5 53 17L70 5Q73 3 73 6L69 24C76 29 81 38 80 52C80 72 67 86 50 86C33 86 20 72 20 52Z"/><path class="ce" d="M32 21L30.5 11L41 18ZM68 21L69.5 11L59 18Z"/><path class="cw" d="M29 66C31 57 42 55 50 60C58 55 69 57 71 66C71 77 61 84 50 84C39 84 29 77 29 66Z"/><path class="cn" d="M45.5 60.5h9l-4.5 5z"/><path class="wh" d="M31 68L6 63M31 73L7 76M69 68L94 63M69 73L93 76"/><path class="hap" d="M31 45Q38 51 45 45M55 45Q62 51 69 45"/><path class="mo" d="M44 72Q50 75 56 72"/></g></g></g><text x="20" y="128" class="m" font-size="15">old set</text><g class="chr"><rect x="100" y="104" width="76" height="40" rx="8"/></g><text x="138" y="130" class="mono" font-size="16" text-anchor="middle">A</text><path class="strike" d="M108 110L168 138M168 110L108 138"/><g class="chw"><rect x="190" y="104" width="76" height="40" rx="8"/><text x="228" y="130" class="mono" font-size="16" text-anchor="middle">B: 41</text></g><g class="chw"><rect x="280" y="104" width="76" height="40" rx="8"/><text x="318" y="130" class="mono" font-size="16" text-anchor="middle">C: 41</text></g><text x="20" y="184" class="m" font-size="15">new set</text><g class="chr"><rect x="100" y="160" width="76" height="40" rx="8"/></g><text x="138" y="186" class="mono" font-size="16" text-anchor="middle">A</text><path class="strike" d="M108 166L168 194M168 166L108 194"/><g class="chr"><rect x="190" y="160" width="76" height="40" rx="8"/></g><text x="228" y="186" class="mono" font-size="16" text-anchor="middle">D</text><g class="chr"><rect x="280" y="160" width="76" height="40" rx="8"/></g><text x="318" y="186" class="mono" font-size="16" text-anchor="middle">E</text><text x="372" y="130" class="m" font-size="13">record 41</text><text x="372" y="186" class="m" font-size="13">not yet</text><g class="badp"><rect x="20" y="222" width="440" height="40" rx="8"/><text x="240" y="247" font-size="15" text-anchor="middle">a majority of the new set: D and E. Record 41 is lost.</text></g><g class="okp"><rect x="20" y="274" width="440" height="40" rx="8"/><text x="240" y="299" font-size="14" text-anchor="middle">a majority of each: D and E, and B and C. Record 41 is kept.</text></g></g></svg></div>
      <figcaption><b>Figure 2</b>A majority of the new set need share nobody with a majority of the old one. A joint fence asks both.</figcaption>
    </figure>

A **joint fence** closes that gap. A leadership that changes the set fences a majority of the old set and a majority of the new one before it serves. While the change is pending, a record counts as committed only once a majority of each set holds it, and the same goes for a `Quorum` cache's counter updates. This is how Raft changes membership, and it is what `joint_fence` turns on.

The second rule is about a copy that lost its disk. A wiped copy comes back empty, and it has also forgotten every promise it made in a fence. If it voted straight away it could help elect a leader that is missing acknowledged records. Under `joint_fence`, a copy whose storage was replaced is a learner: it copies the log but counts toward no majority, and placement does not pick it to lead. The control plane re-admits it once the leader reports that it holds the start of the current generation. [The follower that forgot](/blog/the-follower-that-forgot.html) told how a broker learns that a copy was wiped. This is what the cluster does about it.

Many of the replication fixes in this release are in this thread. A crash right after a set change, a failover right after a new copy was seated, and a second failover soon after the first could each leave a two-copy shard closed or a record on one copy. Each is fixed.

## Thread three: hundreds of shards on one broker {#scale}

Clusters with hundreds of shards on each broker kept losing leases under load. The cause was not new in 0.7. It had been there since before 0.6.

A broker's replication driver ran 16 passes at a time, and under a steady stream of appends the same 16 shards kept the slots. A shard with one write could wait until its publish timed out while both its followers sat idle. Shards now take turns. Answers on a peer's control stream went out one at a time, so the pings followers send their leaders could queue behind a burst of new shards' fences, and a long enough queue looked like a dead leader. They now go out as each one finishes.

Publishes had the same shape of bug. One shard waiting on a quorum held back the answers of every shard sharing its publish stream, because the broker answered pipelined publishes in request order. [Held behind the slowest answer](/blog/held-behind-the-slowest-answer.html) tells how we found it and why idempotent publishes keep their order. The Rust client asks for answers as they finish; other clients keep request order.

Two more in the same family. A publish no longer waits out a dead follower's request once a healthy follower has answered. And placement now pauses balancing while a broker is down, so a failover is not followed by a round of moves that fence shards the survivors just took over.

## Thread four: what apps asked for {#apps}

**Record keys and headers.** A record can now carry a key and named byte headers, and a subscriber gets them back on live delivery, on replay and after a restart. They are negotiated like every new wire feature, so a client that does not ask exchanges the same bytes as before. In a cluster, once the fleet finalizes `record_headers`, replication carries them, so a promoted copy delivers the same headers the old leader did. The Kafka listener can store Kafka keys and headers in them. The Rust client sends them in 0.7. Consumer groups do not deliver them yet.

**An MQTT listener.** In [What if your device fleet ran on one log?](/blog/what-if-your-fleet-ran-on-one-log.html) we wrote that Felix does not speak MQTT and asked what it would look like if it did. Now part of it does. With `FELIX_MQTT_LISTEN` set, a broker takes MQTT 3.1.1 and 5.0 connections, plain or over WebSockets, and a device can publish at QoS 0 and 1 to a durable stream mounted at a topic prefix. A broker that does not own the shard forwards the publish to the owner under the connection's producer id, so a retry after the owner dies is not written twice. A `PUBACK` means the message is in the stream. The topic becomes the record's key and the MQTT fields become headers. In a cluster, MQTT publishes are refused until the fleet finalizes `record_headers`. Devices cannot subscribe through it in 0.7.

**Lease tokens.** felixd, our experiment in running workloads on Felix, runs a workload on whichever node holds its lease, and many nodes share one identity. A conditional cache write that wins a lease can now return a short-lived token for what that lease covers, such as the workload's output stream, so a node cannot write the output without holding the lease. Rust client only for now.

**Head trim.** A writer that keeps snapshots can drop the history below one, but only if the stream's tail is where it expects. That condition keeps a writer that lost its lease from trimming. [The trim that hid the fence](/blog/the-trim-that-hid-the-fence.html) is how the TLA+ model found a trim that hid a newer writer's fence from a stale one, while we were still designing it. Every client sends it, and so does `felixctl stream trim`. A cluster trims only once it finalizes `head_trim`.

## Thread five: clients and operators {#tools}

**The Rust client was renamed.** The cluster-aware client was the one almost everyone should use, and it had the longer name. `ClusterClient` is now `Client`, and the old single-connection `Client` is now `Connection`. Rename `Client` to `Connection` first, then `ClusterClient` to `Client`, or the second rename undoes the first. A `Connection` also opens its pooled connections as traffic needs them, so a default subscriber holds 5 broker connections instead of 20.

**felixctl is the one operator command line.** Moves, placement, backup points and fleet features used to live under `felix-controlplane admin`, and that is gone. `felixctl` does all of it, from a context instead of per-command URL and token flags, and `felixctl features finalize` now asks before a one-way change.

**Smaller things.** `felixctl data inspect records` decodes the records around an offset in a data directory, offline and read-only. Each GitHub release carries prebuilt `libfelix` libraries for Linux, macOS and Windows on x64 and arm64. A Grafana dashboard and Prometheus alert rules ship in `deploy/observability/`.

## What we learned {#learned}

**Silence is not evidence.** Most of the hangs this release fixed were a node waiting for an answer and reading the lack of one as "still busy". A wait needs an end the node can see for itself.

**Cut the simulator where the bugs are.** We did not simulate the whole broker. We simulated the network between brokers, the clocks and the disk, and ran everything else for real, because that is where election bugs live.

**A new copy is not a voter.** Raft says this, and we relearned it twice: once for the control plane's own Raft group in 0.6, and now for shard copies. Anything that forgot its promises should listen before it votes.

## Upgrading {#upgrading}

Read [Upgrading to 0.7](https://docs.getfelix.dev/release-notes/upgrading-to-0-7/) first. The order is the usual one: control plane, then brokers one at a time, then clients. A few steps do not roll back:

- **Storage formats.** A log moves to format 7 at its first trim and to format 8 at its first record with headers, and 0.6.2 refuses to open it after that. The first MQTT publish to a mounted stream stores headers. Back up each data directory before you upgrade if you might use any of them.
- **Fleet features.** Every finalize is one-way. After it, a broker on a build without the feature is refused at registration.
- **Control-plane metadata.** Postgres migrations and Raft metadata levels do not roll back.

Two changes apply without any finalize. Lease-token templates use braces in RBAC objects, so a grant on a literal cache key containing `{` or `}` stops granting it; list those grants before you start. And the control plane now renames a `Quorum` shard's leader one generation up when it sits on a live broker but shows no progress for 70 seconds (`FELIX_SHARD_STUCK_LEADER_MS`, on by default, `0` turns it off). In 0.6.2 such a shard stayed stuck. Rust code also needs the rename above.

The [status table](https://docs.getfelix.dev/getting-started/what-felix-is-for/) says what each capability does today and where it stops. The [CHANGELOG](https://github.com/GetFelix/felix/blob/main/CHANGELOG.md) has the whole 0.7.0 section.

+++
title = "How Felix finds its bugs before you do"
description = "Felix checks its replication protocol with a TLA+ model and its code with a seeded simulator. Four real bugs, what each tool caught, what neither can see, and why every check has a broken twin that must keep failing."
date = 2026-11-19T09:00:00
draft = true
slug = "model-checked-broker"
path = "blog/model-checked-broker.html"

[taxonomies]
topics = ["testing", "durability", "replication"]

[extra]
read_minutes = 12
card = "cards/model-checked-broker.svg"
+++

A client publishes to Felix and gets an `ok`. The publish is still in a queue on the leader. A planned move then fences that leader, the leader refuses the queued write, and the successor takes over without it.

The client holds an acknowledgement for a record that no broker has. A model checker printed that sequence in four steps, before any user could hit it. This post is about how Felix finds bugs like that, four real examples, and what the method cannot see.

The idea, in one line: a check that passes tells you little, so every check Felix relies on has a broken twin that must keep failing.

## The twin that must fail

Felix describes its replication protocol in [TLA+](https://github.com/tlaplus/tlaplus) and checks it with TLC, the model checker that ships with the language. A model is a small, precise description of the state and the steps that can change it: a write is admitted, a leader is fenced, a broker crashes. TLC tries every order of those steps within small limits and checks a rule in every state it reaches. When a rule breaks, it prints the steps. Nothing else in the toolchain gives you that for a protocol. The earlier post [The trim that hid the fence](/blog/the-trim-that-hid-the-fence.html) shows what reading one looks like.

A pass is weaker than it sounds. A model that is too loose, or a rule that nothing can break, passes without proving anything. So each rule that matters comes with a twin: the same model with one guard removed. The twin must fail, and CI fails if it stops failing. The files in [`docs/formal/`](https://github.com/GetFelix/felix/tree/main/docs/formal) show it. `FelixShardHandoffNoClaimFence.cfg` removes a check the broker has and must violate `AckedSurvive`. `FelixShardHandoffAdmitAckClaimFence.cfg` is the one in Figure 1. The expected result for each is registered in `scripts/check_tla.sh`, and each configuration's header cites the broker tests that enforce the guard its twin removes.

The rule in Figure 1 is `AckedSurvive`: a record acknowledged under quorum acknowledgement is on a majority of disks, so it survives losing the leader. It is the rule that matters most for a broker, and the one a test finds least easily, because the failure needs a particular order of events across two brokers and a control plane.

## Bug one: acknowledged when queued, refused when claimed

By default Felix says `ok` to a publish when it is queued, not when it is written. That is a throughput choice, and `ack_on_commit` turns it off. A shard move works like this: the control plane fences the old leader, the leader stops serving and reports `drained`, and only then does the successor take over.

The broker checks the write fence twice: at admission, and again at the claim, where the write takes its place in the log. The claim check is what stops a write landing on a leader that the control plane has already declared drained. The model shows why it is needed: without it, a write admitted just before the fence is claimed after the `drained` report, and the successor never gets it. That twin is `FelixShardHandoffNoClaimFence.cfg`, and it fails in eleven steps.

The claim check alone has a second problem, and this is the one in Figure 1. If the write was acknowledged when it was queued, refusing it at the claim breaks a promise the client already holds. `FelixShardHandoffAdmitAckClaimFence.cfg` models that and violates `AckedSurvive`.

<figure class="fig ck">
      <div class="stage"><svg class="ck-svg" viewBox="0 0 480 372" role="img" aria-labelledby="mc1-t"><title id="mc1-t">A counterexample in four steps. Step 1: a publish, w7, is queued on the old leader and the client is told ok. Step 2: the control plane fences the leader. Step 3: the leader refuses the claim for w7 and reports drained. Step 4: the successor takes over with an empty log. The client holds an acknowledgement for a record that no broker holds, so the AckedSurvive rule is violated.</title><g font-size="18"><text x="16" y="30" class="cap" font-size="14">STEP</text><text x="196" y="30" class="cap" font-size="14">OLD LEADER</text><text x="330" y="30" class="cap" font-size="14">SUCCESSOR</text><text x="16" y="70" font-size="15"><tspan class="a">1</tspan>  Publish w7 is queued.</text><text x="30" y="90" font-size="15">Client gets ok.</text><g class="chw"><rect x="196" y="56" width="120" height="38" rx="5"/><text x="256" y="80" text-anchor="middle" font-size="13" class="mono">w7 queued</text></g><g class="chr"><rect x="330" y="56" width="134" height="38" rx="5"/><text x="397" y="80" text-anchor="middle" font-size="13" class="mono m">empty</text></g><path class="ln dash" style="stroke:var(--line-strong)" d="M16 108H464"/><text x="16" y="136" font-size="15"><tspan class="a">2</tspan>  The control plane</text><text x="30" y="156" font-size="15">fences the leader.</text><g class="chw"><rect x="196" y="122" width="120" height="38" rx="5"/><text x="256" y="146" text-anchor="middle" font-size="13" class="mono">w7 queued</text></g><g class="chr"><rect x="330" y="122" width="134" height="38" rx="5"/><text x="397" y="146" text-anchor="middle" font-size="13" class="mono m">empty</text></g><path class="ln dash" style="stroke:var(--line-strong)" d="M16 174H464"/><text x="16" y="202" font-size="15"><tspan class="a">3</tspan>  Leader refuses the</text><text x="30" y="222" font-size="15">claim, reports drained.</text><g class="chx"><rect x="196" y="188" width="120" height="38" rx="5"/><text x="256" y="212" text-anchor="middle" font-size="13" class="mono">w7 refused</text></g><g class="chr"><rect x="330" y="188" width="134" height="38" rx="5"/><text x="397" y="212" text-anchor="middle" font-size="13" class="mono m">empty</text></g><path class="ln dash" style="stroke:var(--line-strong)" d="M16 240H464"/><text x="16" y="268" font-size="15"><tspan class="a">4</tspan>  Successor takes over.</text><text x="30" y="288" font-size="15">It never saw w7.</text><g class="chx"><rect x="196" y="254" width="120" height="38" rx="5"/><text x="256" y="278" text-anchor="middle" font-size="13" class="mono">w7 refused</text></g><g class="chr"><rect x="330" y="254" width="134" height="38" rx="5"/><text x="397" y="278" text-anchor="middle" font-size="13" class="mono m">leader, empty</text></g><g class="badp"><rect x="96" y="318" width="288" height="34" rx="17"/><text x="240" y="340.5" text-anchor="middle" font-size="16" class="mono">AckedSurvive violated</text></g></g></svg></div>
      <figcaption><b>Figure 1</b>The counterexample TLC prints for a queued, already acknowledged publish when the claim refuses writes after a fence. The client holds an ok for w7, and no broker holds w7.</figcaption>
    </figure>

The fix is that a write acknowledged on queueing enters the fence when it is admitted, not when it is claimed. Closing the fence then waits for it, and the `drained` report waits until the write has been claimed and committed. The configuration with that rule, `FelixShardHandoffAdmitAck.cfg`, passes. The broker change is [#664](https://github.com/GetFelix/felix/pull/664), and its description lists the old behavior as a bug: with the fence checked only when the write reached storage, a move could refuse a write the client had been told succeeded. The check is `ShardFence::enter` in `services/felix-broker-service/src/shards/lifecycle/fence.rs`, and the broker tests cover the same cases the model names, such as a publish admitted before the fence and claimed after it.

## Bug two: the trim that hid the fence

Felix lets a writer drop history below a snapshot with a conditional head trim. The condition is what keeps a writer that lost its lease from trimming. We wrote the design down in TLA+ before building on it, and TLC found a way for the new writer's own trim to hide the record that was meant to stop the old writer. The old writer read past the trim, saw no newer epoch, and wrote after the new one.

The rule that broke is `StaleTrimRefused`: no committed write or trim from one holder follows a committed write from a newer one. The design changed so a refused read returns the headers of the trim that set the floor, where the holder's epoch is. The full trace and the fix are in [the earlier post](/blog/the-trim-that-hid-the-fence.html). The model change is [#1663](https://github.com/GetFelix/felix/pull/1663), for the feature in [#1662](https://github.com/GetFelix/felix/issues/1662), and `FelixHeadTrimHiddenTrims.cfg` is kept as the twin that still finds it.

Both bugs are in a design, not in a line of code. A model is good at that kind of bug and bad at the next kind.

## What the model cannot see

A TLA+ model describes steps. It does not run the code. A bug in how a loop reads a file lives below the model's abstraction, so TLC cannot find it. For that, Felix has a simulator.

[`felix-sim`](https://github.com/GetFelix/felix/blob/main/docs/simulation.md) runs several real brokers and a real control plane in one process, on tokio's paused clock, with the network, the disks and each node's clock under the test's control. Everything a run does, from its faults to its client operations, comes from one number, the seed. A failing seed replays event for event. The sweep runs 2000 seeds every night, and each night also runs 250 seeds in every opt-in fault mode: skewed clocks, placement faults, power cuts, several brokers losing power at once, wiped disks. A CI job checks that two runs of the same seed produce identical traces, because a simulator that cannot replay is not much use. A red nightly seed opens an issue with the command that replays it.

### Bug three: a short read that looked like agreement

A follower that gets a batch from a new leader compares it with whatever it already holds at the same offsets. If a stale, uncommitted record from an old leader is there, the follower must drop it. The comparison read the follower's stored records with a byte budget sized from the leader's records. When the stale record was larger than the leader's record at that offset, the read stopped short, and a short read was taken to mean "no disagreement". The batch was appended after the stale record.

Simulator seed 1, with payloads padded to 1 to 4 KiB, reported real-time-order violations on two streams. The trace for one of them:

1. The leader of generation 56 is partitioned. Another broker is promoted to generation 57, writes its start record at offset 4 and acknowledges a write at offset 5 together with a second broker.
2. The partitioned broker appends its own record at offset 4. It never reaches a quorum.
3. After the partition heals, the new leader sends that broker a batch starting at offset 3. The comparison reads only offset 3, sees no conflict, and appends the acknowledged write after the stale record.
4. The old broker later leads generation 59 and serves its stale record at offset 4, while the other two replicas hold the start record there.

Replicas that disagree about an offset is the worst thing a log can do. The code was the same in v0.6.2 and had been there since [#255](https://github.com/GetFelix/felix/issues/255). No model had a byte budget in it, so no model could have found this. The report is [#2062](https://github.com/GetFelix/felix/issues/2062) and the fix is [#2063](https://github.com/GetFelix/felix/pull/2063): read page by page until every overlapping offset is compared, and refuse the batch if a stored record cannot be read. The pull request also lists every other place that compares stored records to incoming ones. There is none. Two tests fail without the fix: one with a 2 KiB stale record under a 1-byte leader record, and one with the stale record corrupted on disk.

### Bug four: a copy that could never be trusted again

After an unclean restart, a replica's copy is not trusted until a leader ships it a batch that leaves it level with the leader's start and a commit offset above zero. That rule keeps a copy that may have lost data from counting toward a quorum.

On an idle shard the vouching batch never came. The batch that brings a follower level goes out before the follower's own answer raises the mark, so it carries commit offset 0, and a level follower is then sent nothing. The copy stayed untrusted. After one more failure the coverage check, which needs enough trusted copies, could never pass, although a caught-up copy existed. The shard just stopped.

Simulator seed 3 reported 65 stalled shards. [#2109](https://github.com/GetFelix/felix/pull/2109) has the leader resend its last record, with the current mark, to a follower at its tail until the follower can be trusted. The same seed then found the sibling case in [#2114](https://github.com/GetFelix/felix/pull/2114): a shard whose log has never held a record has nothing to resend, so the leader sends one empty labelled batch instead.

This one went back to the model. `FelixShardUnified.tla` gained a liveness property, `FollowerTrusted`: a kept follower of a serving leader is trusted again while that leader serves it. It also gained a knob for the fix, and `FelixShardUnifiedIdleVouchLegacy.cfg`, with the knob off, must violate it. Safety rules say nothing bad happens. A stall is a failure of the other kind, and the simulator's check that every shard is served again after the faults heal is what caught it in the code.

<figure class="fig ck">
      <div class="stage"><svg class="ck-svg" viewBox="0 0 480 308" role="img" aria-labelledby="mc2-t"><title id="mc2-t">Three layers of checking, stacked. The top layer is the TLA+ model checked by TLC, which tries every order of steps in a small model of the protocol. Below it is felix-sim, which runs the real broker code on virtual time with one seed per run. At the bottom are history runs on real processes, disks and QUIC. Each layer down is closer to the real system and explores less.</title><g font-size="18"><g class="chr"><rect x="16" y="20" width="448" height="78" rx="8"/></g><text x="32" y="46" font-size="17" class="mono a">TLA+ and TLC</text><text x="32" y="68" font-size="14">A small model of the protocol. Every order of steps.</text><text x="32" y="87" font-size="14" class="m">Found: a lost handoff write, a trim that hides a fence.</text><path class="lna" d="M240 100V114"/><path class="lna" d="M234 108l6 6 6-6"/><g class="chr"><rect x="16" y="116" width="448" height="78" rx="8"/></g><text x="32" y="142" font-size="17" class="mono a">felix-sim</text><text x="32" y="164" font-size="14">The real broker code on virtual time. One seed per run.</text><text x="32" y="183" font-size="14" class="m">Found: replicas that diverge, shards that never recover.</text><path class="lna" d="M240 196V210"/><path class="lna" d="M234 204l6 6 6-6"/><g class="chr"><rect x="16" y="212" width="448" height="78" rx="8"/></g><text x="32" y="238" font-size="17" class="mono a">History runs</text><text x="32" y="260" font-size="14">Real processes, disks and QUIC. Faults while clients run.</text><text x="32" y="279" font-size="14" class="m">Checks what clients saw against what a log promises.</text></g></svg></div>
      <figcaption><b>Figure 2</b>Each layer is closer to the real system than the one above it, and explores less of it.</figcaption>
    </figure>

## What none of this covers

The honest list is longer than the marketing one.

**A model can describe a design the code no longer has.** One change to the quorum acknowledgement path ([#268](https://github.com/GetFelix/felix/issues/268)) landed without touching the model. The model went on describing the old design, TLC kept reporting a lost acknowledged record, and an issue ([#527](https://github.com/GetFelix/felix/issues/527)) was filed to fix a hole that the code had already closed. [#599](https://github.com/GetFelix/felix/pull/599) brought the model back in line, with the ordering as a switch so both designs stay checkable. Since then CI runs `scripts/check_spec_pairing.py`: a change to the modelled code paths must also change a spec or configuration, or say why with a `Spec-Unaffected:` line in a commit message. It is deliberately blunt. It cannot tell you the model is right. It makes someone ask.

**A pass is a statement about bounds.** TLC is exhaustive inside small limits, such as three brokers, a couple of writes and a few ticks. Raising a limit multiplies the states by roughly ten. Some configurations are too big to finish, and the module README says so next to them. One did not finish in six hours at 178 million distinct states. For those, nightly random walks sample longer behaviors, and a pass there means nothing was found, not that nothing exists.

**The simulator swaps out the edges.** The replication, election, promotion and placement code is the real code. The network, the file system and the clocks are not. A bug in QUIC, in how a real file system handles a torn write, or in an operating system call lives outside it. [The cluster harness](https://github.com/GetFelix/felix/blob/main/docs/cluster-harness.md) and the [history checker](https://github.com/GetFelix/felix/blob/main/docs/history-checker.md) cover that gap: real broker processes over real QUIC and real disks, a nemesis that kills, pauses, partitions and cuts power, and a checker, modelled on Elle's list-append from the Jepsen project, that compares what clients saw with what a replicated log promises. Real runs are slow and sample few schedules, which is why they come last in Figure 2.

**None of it measures speed.** A model has no clock cost, and a simulation on paused time measures nothing. Performance has its own benchmarks and its own gates.

## What this buys you

Felix is young. It has no years of production use behind it, and it does not have the ecosystem of Apache Kafka or NATS, both of which have long production records. Model checking is not a substitute for that record. What it offers instead is specific and checkable:

- The rules Felix claims, such as an acknowledged record surviving the loss of its leader, are written down as invariants, and each has a configuration you can read and run.
- Each rule has a twin that fails, so you can see what the guard is for and which test in the broker holds it up.
- A bug the simulator finds comes with a seed. It replays on a laptop, and the fix ships with a test that fails without it.
- The limits are in the repository next to the results: which configurations are exhaustive, which are sampled, which did not finish.

If you are choosing a broker for data you cannot lose, those are the questions worth asking of any candidate. What are the rules, where are they written, what happens when someone removes a guard, and which part of the answer is a sample.

## Try it

You need Docker, or Podman with the `docker-compose` provider. This runs a control plane, a broker and development credentials, from the [quickstart](https://docs.getfelix.dev/getting-started/quickstart/):

<pre class="code" data-lang="Shell" tabindex="0"><code><span class="tok-f">curl</span> -fsSLO https://raw.githubusercontent.com/GetFelix/felix/main/compose.yaml
<span class="tok-f">docker</span> compose up -d
<span class="tok-f">docker</span> compose logs felix-dev-ready</code></pre>

The last command prints the connection settings. Then subscribe in one terminal and publish from another:

<pre class="code" data-lang="Shell" tabindex="0"><code><span class="tok-f">docker</span> compose run --rm felixctl sub orders
<span class="tok-f">docker</span> compose run --rm felixctl pub orders <span class="tok-s">'hello'</span></code></pre>

Felix is an open-source replicated log written in Rust. One storage engine serves streams, key/value caches and consumer groups, for systems where many processes need the same fast-changing data. The models and the simulator are in the repository: start with [`docs/formal/README.md`](https://github.com/GetFelix/felix/blob/main/docs/formal/README.md) and [`docs/simulation.md`](https://github.com/GetFelix/felix/blob/main/docs/simulation.md), run a seed with `task sim:replay`, and break a twin to watch it fail.

+++
title = "What building 0.7 taught us"
description = "Four checks Felix leans on for failover, a seeded simulator, a TLA+ model, a throughput A/B and a bisect, and what each one taught us about trusting the check itself."
date = 2026-11-08T10:00:00
slug = "what-building-07-taught-us"
path = "blog/what-building-07-taught-us.html"

[taxonomies]
topics = ["testing", "replication", "performance"]

[extra]
read_minutes = 7
card = "cards/what-building-07-taught-us.svg"
+++

A failover is the moment a cluster finds out whether its rules hold. Felix checks them four ways: a simulator that replays a whole cluster from a seed, a TLA+ model, A/B runs against the last release, and a bisect when a number moves. Each one is wrong sometimes. This post is about what each taught us, mostly by catching bugs and sometimes by being the bug.

## A failing seed is a question, not a verdict

[The simulator](/blog/a-cluster-on-one-clock.html) runs real brokers and a real control plane in one process on a paused clock. A seed fixes the cluster, the faults and the clients, so a failing seed runs again the same way. Its [documentation](https://github.com/GetFelix/felix/blob/main/docs/simulation.md) has the details.

Most failing seeds were real bugs in placement and replication. A broker that came back on new storage left a set change pending for ten minutes ([#2110](https://github.com/GetFelix/felix/pull/2110)). A fenced move's destination was never promoted when the leader was lost ([#2112](https://github.com/GetFelix/felix/pull/2112)). A leader that gave up its copy after a crash never told placement which followers held the start of its generation, so a copy stayed a learner forever ([#2120](https://github.com/GetFelix/felix/pull/2120)). A move whose leader gave up its copy waited out a two minute timeout ([#2125](https://github.com/GetFelix/felix/pull/2125)), and when a move ended without a cut-over, dropping its destination from a set of three could lose an acknowledged record ([#2126](https://github.com/GetFelix/felix/pull/2126)).

Two failing seeds were the simulator's fault.

<figure class="fig ck">
      <div class="stage"><svg class="ck-svg" viewBox="0 0 480 270" role="img" aria-labelledby="wt1-t"><title id="wt1-t">A failing seed enters a triage box. Three outcomes leave it. A broker bug is fixed in code. A harness bug is fixed in the harness. A check that fires on silence is narrowed to what it can actually know. A loosened bound is crossed out.</title><g font-size="16"><g class="chw"><rect x="14" y="100" width="110" height="52" rx="8"/><text x="69" y="122" text-anchor="middle">failing</text><text x="69" y="142" text-anchor="middle">seed</text></g><path class="ln" d="M126 126H176"/><g class="boxa"><rect x="176" y="86" width="100" height="80" rx="10" class="boxa"/></g><text x="226" y="120" text-anchor="middle" class="a">trace it to</text><text x="226" y="142" text-anchor="middle" class="a">a cause</text><path class="ln" d="M278 108L322 40M278 126H322M278 144L322 212"/><g class="okp"><rect x="322" y="18" width="146" height="44" rx="8"/><text x="395" y="38" text-anchor="middle">broker bug:</text><text x="395" y="55" text-anchor="middle">fix the code</text></g><g class="okp"><rect x="322" y="104" width="146" height="44" rx="8"/><text x="395" y="124" text-anchor="middle">harness bug:</text><text x="395" y="141" text-anchor="middle">fix the harness</text></g><g class="okp"><rect x="322" y="190" width="146" height="44" rx="8"/><text x="395" y="210" text-anchor="middle">check too eager:</text><text x="395" y="227" text-anchor="middle">narrow it</text></g><g class="chx"><rect x="176" y="204" width="100" height="36" rx="8"/><text x="226" y="227" text-anchor="middle">loosen it</text></g><path class="strike" d="M184 198L268 246"/></g></svg></div>
      <figcaption><b>Figure 1</b>Every failing seed ends in a cause. "Loosen the bound until it passes" is the one exit we keep closed.</figcaption>
    </figure>

In one, a fault called "pause the control plane, then crash a leader" woke from its delay at the instant the run healed. The heal had just restarted every broker, and the fault crashed one anyway, then skipped the restart because the run was over. The broker stayed down and the shard it led never recovered. The cluster was fine and the harness had left it broken ([#2129](https://github.com/GetFelix/felix/pull/2129)). The fault now does nothing once the heal has begun.

In the other, the `torn-tail-repaired` check demanded that recovery repair a torn segment after a power cut. Recovery repairs a torn tail when the log is opened, and in some runs the broker never opened that log again, because it no longer hosted the shard. A few more were counted against the wrong cut. The check now asks for a repair only when the broker reopened the torn segment, and a segment that was reopened and not repaired still fails ([#2130](https://github.com/GetFelix/felix/pull/2130)).

The rule that kept this honest is the one from [Silence is not evidence](/blog/silence-is-not-evidence.html), pointed at ourselves. A failure we can't explain is not a flake to be waved through, and a check that is quiet is not a check that passed. Each seed got a cause before anything changed. Two of those causes were in the test.

## A model is only as good as its frame conditions

The [TLA+ model](https://github.com/GetFelix/felix/tree/main/docs/formal) is the other half of failover testing. TLC explores every state of a small cluster and reports any trace that breaks an invariant. When it finds one, the code is wrong or the claim in the docs is. We fix the code. We don't edit the model until it agrees with what we wrote down.

The model can also stop for a duller reason. A TLA+ action says what changes, and every variable it does not mention has to be listed in an `UNCHANGED` clause. Forget one and the next state leaves that variable unconstrained, which TLC reports as an incompletely specified successor.

<figure class="fig ck">
      <div class="stage"><svg class="ck-svg" viewBox="0 0 480 250" role="img" aria-labelledby="wt2-t"><title id="wt2-t">Two rows of boxes. The top row lists the spec's variables: log, mark, ballots, waits, pinVars and cpGone. The bottom row is an action's hand-written UNCHANGED list, which names log, mark and ballots, while waits, pinVars and cpGone are dashed empty slots marked missing. TLC stops at depth 5.</title><g font-size="15"><text x="14" y="26" class="m">the spec's variables</text><g class="chw"><rect x="14" y="38" width="64" height="36" rx="6"/><text x="46" y="61" text-anchor="middle" class="mono">log</text></g><g class="chw"><rect x="86" y="38" width="64" height="36" rx="6"/><text x="118" y="61" text-anchor="middle" class="mono">mark</text></g><g class="chw"><rect x="158" y="38" width="84" height="36" rx="6"/><text x="200" y="61" text-anchor="middle" class="mono">ballots</text></g><g class="chw"><rect x="250" y="38" width="70" height="36" rx="6"/><text x="285" y="61" text-anchor="middle" class="mono">waits</text></g><g class="chw"><rect x="328" y="38" width="84" height="36" rx="6"/><text x="370" y="61" text-anchor="middle" class="mono">pinVars</text></g><text x="14" y="124" class="m">an action's hand-written UNCHANGED list</text><g class="okp"><rect x="14" y="136" width="64" height="36" rx="6"/><text x="46" y="159" text-anchor="middle" class="mono">log</text></g><g class="okp"><rect x="86" y="136" width="64" height="36" rx="6"/><text x="118" y="159" text-anchor="middle" class="mono">mark</text></g><g class="okp"><rect x="158" y="136" width="84" height="36" rx="6"/><text x="200" y="159" text-anchor="middle" class="mono">ballots</text></g><g class="chg"><rect x="250" y="136" width="70" height="36" rx="6"/><text x="285" y="159" text-anchor="middle" class="mono">waits</text></g><g class="chg"><rect x="328" y="136" width="84" height="36" rx="6"/><text x="370" y="159" text-anchor="middle" class="mono">pinVars</text></g><path class="lnb dash" d="M285 76V134M370 76V134"/><g class="chx"><rect x="14" y="198" width="456" height="40" rx="8"/><text x="242" y="223" text-anchor="middle">TLC: incompletely specified successor, depth 5</text></g></g></svg></div>
      <figcaption><b>Figure 2</b>The list was written when the spec had fewer variables. Nothing in the action was wrong. It just stopped saying what stays put.</figcaption>
    </figure>

That is what happened to two read and commit confirmation actions. Their lists were spelled out by hand and predated three variables the spec had since gained, so TLC stopped at depth 5 in the Reads and Sessions configurations. They were the only two hand-written lists that had fallen behind ([#2127](https://github.com/GetFelix/felix/pull/2127)). The fix was to bring the lists up to date. The model checked nothing deeper than depth 5 until then, and a run that stops early looks a lot like a run that found no problem.

## Measure the cost of safety, then blame the right thing

When a leader is promoted, it proves its followers hold safe copies before it acknowledges anything. That proof is a fence, and fences cost round trips. So when an A/B run against the previous release showed the RF 3 promotion burst far below it, the fence was the obvious suspect.

It wasn't. Switching the unified fence on or off made no difference, and the steady phase was fine. So we bisected across the release line instead of reasoning about it.

<figure class="fig ck">
      <div class="stage"><svg class="ck-svg" viewBox="0 0 480 270" role="img" aria-labelledby="wt3-t"><title id="wt3-t">A row of commits. Before the early-routing change, burst throughput is 1.35 times the previous release. At the early-routing commit it drops to 0.36 times. The unified fence switch, tried on and off, changes nothing. A second panel shows the driver's 16 pass slots filled by shards that are not yet serving, with a serving shard waiting in line behind them.</title><g font-size="15"><text x="14" y="24" class="m">promotion burst, vs the previous release</text><path class="lna" d="M20 120H460"/><g class="okp"><rect x="30" y="50" width="120" height="44" rx="8"/><text x="90" y="70" text-anchor="middle">commit before</text><text x="90" y="86" text-anchor="middle" class="mono">1.35x</text></g><path class="ln" d="M152 72H206"/><g class="badp"><rect x="208" y="50" width="150" height="44" rx="8"/><text x="283" y="70" text-anchor="middle">route new shards early</text><text x="283" y="86" text-anchor="middle" class="mono">0.36x</text></g><g class="chg"><rect x="372" y="50" width="92" height="44" rx="8"/><text x="418" y="70" text-anchor="middle">fence on/off</text><text x="418" y="86" text-anchor="middle" class="mono">no change</text></g><text x="14" y="150" class="m">the driver's pass slots</text><g id="wt3-slots"><rect class="boxa" x="14" y="162" width="22" height="22" rx="4"/><rect class="boxa" x="40" y="162" width="22" height="22" rx="4"/><rect class="boxa" x="66" y="162" width="22" height="22" rx="4"/><rect class="boxa" x="92" y="162" width="22" height="22" rx="4"/><rect class="boxa" x="118" y="162" width="22" height="22" rx="4"/><rect class="boxa" x="144" y="162" width="22" height="22" rx="4"/><rect class="boxa" x="170" y="162" width="22" height="22" rx="4"/><rect class="boxa" x="196" y="162" width="22" height="22" rx="4"/><rect class="boxa" x="222" y="162" width="22" height="22" rx="4"/><rect class="boxa" x="248" y="162" width="22" height="22" rx="4"/><rect class="boxa" x="274" y="162" width="22" height="22" rx="4"/><rect class="boxa" x="300" y="162" width="22" height="22" rx="4"/><rect class="boxa" x="326" y="162" width="22" height="22" rx="4"/><rect class="boxa" x="352" y="162" width="22" height="22" rx="4"/><rect class="boxa" x="378" y="162" width="22" height="22" rx="4"/><rect class="boxa" x="404" y="162" width="22" height="22" rx="4"/></g><text x="438" y="178" class="mono m">16</text><text x="14" y="206" class="a">first pass and fence for shards that do not serve yet</text><path class="ln" d="M200 218V230"/><g class="okp"><rect x="110" y="232" width="180" height="30" rx="8"/><text x="200" y="252" text-anchor="middle">a serving shard, waiting</text></g></g></svg></div>
      <figcaption><b>Figure 3</b>The fence was not the cost. Work for shards that could not take writes yet held the slots that shards taking writes needed.</figcaption>
    </figure>

The bisect landed on [#1953](https://github.com/GetFelix/felix/pull/1953), which publishes a new shard's route while a bulk create is still opening, so a shard opened early becomes reachable early. That is right for the shards a broker doesn't lead. For the ones it does lead and has not opened, the route started replication work: a first pass that waits on the followers' copies, and a fence. With hundreds of shards in a bulk create, those passes filled the 16 slots the driver runs at once, and shards that could already take writes waited behind them. Before the change the same work ran after the pass, mostly outside the burst. The PR measured the burst at 1.35 times the previous release at the commit before it and 0.36 times after.

[#2132](https://github.com/GetFelix/felix/pull/2132) routes a shard this broker leads early only once it serves. Shards led elsewhere are still routed at once, and the fence rules are untouched. The test for it fails with the filter removed and passes with it.

The expensive-looking mechanism was innocent, and the change that hurt was a sensible one for the shards it was written for. A switch you can flip is a cheap experiment, and a bisect is a cheap way to stop arguing about causes.

## Tail latency hides on slow machines

<!-- TODO: finish once the driver wakeup fix merges -->

A steady-state p99 change can be real and still invisible on a slow runner. On a shared CI machine the noise in a p99 can be ten times the effect you are looking for, so a comparison there reports "no significant change" and means it, honestly, about the noise. Only a fast, quiet machine had a floor low enough for the signal to show. The lesson is that an A/B can only see an effect larger than its runner's noise, and "inconclusive" is not the same as "fine".

## Where this leaves us

None of the four checks is the safe one. The simulator was wrong twice, the model stopped early once, the obvious suspect in the A/B was innocent, and a slow runner couldn't see a real effect. What held up was the habit of asking what each result could and could not know: trace the failure, check the model reached the depth you think it did, flip the switch before blaming it, and know the noise floor before reading a comparison.

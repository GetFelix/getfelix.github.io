+++
title = "Two questions, one fence"
description = "A new leader's fence used to ask whether anything older can still say yes and whether the new leader holds every acknowledged write as one test, and every wrong answer grew a special case. Split in two, the questions give one open rule for every kind of fence."
date = 2026-11-06T14:00:00
slug = "two-questions-one-fence"
path = "blog/two-questions-one-fence.html"

[taxonomies]
topics = ["replication", "durability", "testing"]

[extra]
read_minutes = 9
card = "cards/two-questions-one-fence.svg"
+++

A shard of three replicas loses its leader, and two of the three brokers are healthy. Both are up, both are reachable, and both are telling the truth. The shard still cannot elect a leader, because the new leader's fence will not count either of them.

A Felix fence used to stall this way in a handful of different situations. Each stall had its own cause and its own fix, and each fix was a special case in a test that was already hard to read. This post is about what that test was really checking, why it was two checks wearing one coat, and the rule that replaces it.

<figure class="fig ck">
      <div class="stage glow"><svg class="ck-svg" viewBox="0 0 440 280" role="img" aria-labelledby="uf1-t"><g font-size="18"><path class="ground" d="M8 268C120 265 300 271 432 267"/><title id="uf1-t">The Felix cat on the left holds a ballot stamped generation 7 with a check mark, and the Felix cat on the right holds a log with records 1, 2 and 3. The left cat answers who can still say yes, the right one answers who holds the records.</title><g class="rough"><g transform="translate(8 92) scale(0.78)"><path class="tl-e" d="M84 178C114 176 122 146 108 128C99 116 104 102 114 102"/><path class="tl" d="M84 178C114 176 122 146 108 128C99 116 104 102 114 102"/><path class="cf" d="M30 80C14 108 11 160 20 188L86 188C96 160 94 110 72 80Z"/><path class="cw" d="M38 90C33 120 37 150 50 168C63 150 67 120 62 90C56 97 44 97 38 90Z"/><ellipse class="cf" cx="38" cy="187" rx="12" ry="6"/><ellipse class="cf" cx="64" cy="187" rx="12" ry="6"/><g transform="translate(0 -2) scale(1)"><path class="cf" d="M20 52C19 38 24 29 31 24L27 6Q27 3 30 5L47 17Q50 16.5 53 17L70 5Q73 3 73 6L69 24C76 29 81 38 80 52C80 72 67 86 50 86C33 86 20 72 20 52Z"/><path class="ce" d="M32 21L30.5 11L41 18ZM68 21L69.5 11L59 18Z"/><path class="cw" d="M29 66C31 57 42 55 50 60C58 55 69 57 71 66C71 77 61 84 50 84C39 84 29 77 29 66Z"/><path class="cn" d="M45.5 60.5h9l-4.5 5z"/><path class="wh" d="M31 68L6 63M31 73L7 76M69 68L94 63M69 73L93 76"/><path class="hap" d="M31 47Q38 39 45 47M55 47Q62 39 69 47"/><path class="mo" d="M42 70Q50 79 58 70"/></g></g></g><g transform="rotate(-6 70 132)"><rect class="ballot" x="40" y="98" width="60" height="68" rx="5"/><text x="70" y="124" text-anchor="middle" class="mono a" font-size="13">GEN 7</text><path class="lna" d="M52 138l8 8l16 -16"/><text x="70" y="160" text-anchor="middle" class="m" font-size="12">promised</text></g><text x="62" y="22" class="hand" text-anchor="middle" font-size="22">Who can still say yes?</text><text x="62" y="262" text-anchor="middle" class="mono m" font-size="13">ballot</text><g class="rough"><g transform="translate(240 92) scale(0.78)"><path class="tl-e" d="M84 178C114 176 122 146 108 128C99 116 104 102 114 102"/><path class="tl" d="M84 178C114 176 122 146 108 128C99 116 104 102 114 102"/><path class="cf" d="M30 80C14 108 11 160 20 188L86 188C96 160 94 110 72 80Z"/><path class="cw" d="M38 90C33 120 37 150 50 168C63 150 67 120 62 90C56 97 44 97 38 90Z"/><ellipse class="cf" cx="38" cy="187" rx="12" ry="6"/><ellipse class="cf" cx="64" cy="187" rx="12" ry="6"/><g transform="translate(0 -2) scale(1)"><path class="cf" d="M20 52C19 38 24 29 31 24L27 6Q27 3 30 5L47 17Q50 16.5 53 17L70 5Q73 3 73 6L69 24C76 29 81 38 80 52C80 72 67 86 50 86C33 86 20 72 20 52Z"/><path class="ce" d="M32 21L30.5 11L41 18ZM68 21L69.5 11L59 18Z"/><path class="cw" d="M29 66C31 57 42 55 50 60C58 55 69 57 71 66C71 77 61 84 50 84C39 84 29 77 29 66Z"/><path class="cn" d="M45.5 60.5h9l-4.5 5z"/><path class="wh" d="M31 68L6 63M31 73L7 76M69 68L94 63M69 73L93 76"/><path class="hap" d="M31 47Q38 39 45 47M55 47Q62 39 69 47"/><path class="mo" d="M42 70Q50 79 58 70"/></g></g></g><text x="300" y="22" class="hand" text-anchor="middle" font-size="22">Who holds the records?</text><g class="rough"><rect class="box" x="230" y="206" width="114" height="38" rx="6"/></g><g class="chw"><rect x="238" y="212" width="28" height="26" rx="5"/><text x="252" y="230" text-anchor="middle" font-size="14">1</text></g><g class="chw"><rect x="272" y="212" width="28" height="26" rx="5"/><text x="286" y="230" text-anchor="middle" font-size="14">2</text></g><g class="chw"><rect x="306" y="212" width="28" height="26" rx="5"/><text x="320" y="230" text-anchor="middle" font-size="14">3</text></g><text x="300" y="262" text-anchor="middle" class="mono m" font-size="13">log</text><path class="lnm" d="M180 40V250" stroke-dasharray="4 5"/></g></svg></div>
      <figcaption><b>Figure 1</b>A fence asks two questions. Ballots answer the first and logs answer the second, and a copy can be good at one and useless at the other.</figcaption>
    </figure>

## A few terms first

A **shard** is one slice of a stream, kept by a **replica set** of brokers. One of them is the **leader**. Each time leadership changes hands, the shard's **generation** goes up. Before a new leader opens at generation G, it **fences**: it asks members of the replica set to promise that they will refuse anything from an older generation, and to say what their logs hold.

A member's promise is a **ballot**, a record that names the generation it promised and the sender it promised it to. Ballots are fsynced, so a broker that crashes and restarts still remembers every promise it made. A broker that loses its data directory does not. A wiped disk or a restored backup forgets ballots along with everything else, and the broker comes back willing to make promises that contradict the ones it made before.

## The test did two jobs

A new leader opening at G has to establish two separate things.

The first is **exclusion**. Nothing older may still be able to acknowledge a write, and no second leader may open at G. A majority of the replica set promising G, with ballots that cannot be forgotten, does it. If an old leader later tries to get a majority of the same set to acknowledge a write, the two majorities share a member, and that member refuses it. Only ballots matter here. What the member's log contains is irrelevant to whether its promise holds.

The second is **coverage**. The new leader must hold every write that was acknowledged before it. Here only logs matter. If a majority acknowledged a write and the new leader hears from a majority, some member it heard from holds the write, and the leader takes the log that is furthest ahead. What the member promised is irrelevant to whether its log is complete.

Felix's fence counted an answer only when one predicate held: the answer came from the right copy of the data, the copy was not under doubt after an unclean crash, and on a continuing fence a ballot named the sender. That is a ballot condition, a log condition and an identity condition in one expression. It answered the safe direction every time, but it said no in cases where each question on its own would have said yes.

Each of those cases got fixed by adding an exception. A short copy was refused. A copy acknowledged by two was allowed back. A learner's answer was refused. A narrow window let a continuing leader count a ballot. Identity pins recorded which copy each member was supposed to be. Every one of those was a reasonable reaction to a real defect, and every one made the next stall harder to see.

## One stall, in detail

Three brokers, a, b and c. Broker a leads generation 6, then gets partitioned away. Broker b stands for generation 7 and wins on b and c. a never hears the election.

Then b is killed. Placement in the control plane adopts generation 7 and fails over to c at generation 8. Now c has to fence.

The control plane knows each member by the copy of the data it last reported, a storage id. It has a report for b and c. For a it has nothing, because a was partitioned and b, being newly elected, carried no id for it. So the fence pins a to the empty id.

a is back and answers c's fence honestly. Its ballot is intact, its directory is the one it always had, and it says so by reporting its id, 37df. The fence compares 37df against the empty id on record, finds no match, and discards the answer. b is dead. c counts one answer out of three, and the shard sits there with a healthy majority.

<figure class="fig ck">
      <div class="stage"><svg class="ck-svg" viewBox="0 0 440 280" role="img" aria-labelledby="uf2-t"><g font-size="18"><path class="ground" d="M8 268C120 265 300 271 432 267"/><title id="uf2-t">Cat a is back up and holds a ballot for generation 8 marked kept, saying I promised. Cat c, wearing the leader crown, cannot open, because the old rule compares a copy id a reports, 37df, against the empty one on record and stamps it wrong copy. Cat b is gone.</title><g class="rough"><g transform="translate(10 92) scale(0.7)"><path class="tl-e" d="M84 178C114 176 122 146 108 128C99 116 104 102 114 102"/><path class="tl" d="M84 178C114 176 122 146 108 128C99 116 104 102 114 102"/><path class="cf" d="M30 80C14 108 11 160 20 188L86 188C96 160 94 110 72 80Z"/><path class="cw" d="M38 90C33 120 37 150 50 168C63 150 67 120 62 90C56 97 44 97 38 90Z"/><ellipse class="cf" cx="38" cy="187" rx="12" ry="6"/><ellipse class="cf" cx="64" cy="187" rx="12" ry="6"/><g transform="translate(0 -2) scale(1)"><path class="cf" d="M20 52C19 38 24 29 31 24L27 6Q27 3 30 5L47 17Q50 16.5 53 17L70 5Q73 3 73 6L69 24C76 29 81 38 80 52C80 72 67 86 50 86C33 86 20 72 20 52Z"/><path class="ce" d="M32 21L30.5 11L41 18ZM68 21L69.5 11L59 18Z"/><path class="cw" d="M29 66C31 57 42 55 50 60C58 55 69 57 71 66C71 77 61 84 50 84C39 84 29 77 29 66Z"/><path class="cn" d="M45.5 60.5h9l-4.5 5z"/><path class="wh" d="M31 68L6 63M31 73L7 76M69 68L94 63M69 73L93 76"/><path class="hap" d="M31 47Q38 39 45 47M55 47Q62 39 69 47"/><path class="mo" d="M42 70Q50 79 58 70"/></g></g></g><g transform="rotate(-6 44 130)"><rect class="ballot" x="14" y="96" width="60" height="68" rx="5"/><text x="44" y="122" text-anchor="middle" class="mono a" font-size="13">GEN 7</text><path class="lna" d="M26 136l8 8l16 -16"/><text x="44" y="158" text-anchor="middle" class="m" font-size="12">kept</text></g><text x="48" y="262" text-anchor="middle" class="mono m" font-size="13">a, back up</text><g class="rough"><g transform="translate(190 60) scale(0.78)"><path class="tl-e" d="M84 178C114 176 122 146 108 128C99 116 104 102 114 102"/><path class="tl" d="M84 178C114 176 122 146 108 128C99 116 104 102 114 102"/><path class="cf" d="M30 80C14 108 11 160 20 188L86 188C96 160 94 110 72 80Z"/><path class="cw" d="M38 90C33 120 37 150 50 168C63 150 67 120 62 90C56 97 44 97 38 90Z"/><ellipse class="cf" cx="38" cy="187" rx="12" ry="6"/><ellipse class="cf" cx="64" cy="187" rx="12" ry="6"/><g transform="translate(0 -2) scale(1)"><path class="cf" d="M20 52C19 38 24 29 31 24L27 6Q27 3 30 5L47 17Q50 16.5 53 17L70 5Q73 3 73 6L69 24C76 29 81 38 80 52C80 72 67 86 50 86C33 86 20 72 20 52Z"/><path class="ce" d="M32 21L30.5 11L41 18ZM68 21L69.5 11L59 18Z"/><path class="cw" d="M29 66C31 57 42 55 50 60C58 55 69 57 71 66C71 77 61 84 50 84C39 84 29 77 29 66Z"/><path class="cn" d="M45.5 60.5h9l-4.5 5z"/><path class="wh" d="M31 68L6 63M31 73L7 76M69 68L94 63M69 73L93 76"/><path class="hap" d="M31 47Q38 39 45 47M55 47Q62 39 69 47"/><path class="mo" d="M42 70Q50 79 58 70"/><path class="crown" d="M28 10L33 -8L42 4L50 -12L58 4L67 -8L72 10Z"/></g></g></g><text x="250" y="262" text-anchor="middle" class="mono m" font-size="13">c, leader at 8</text><g class="rough"><path class="bubble" d="M20 6h124a10 10 0 0 1 10 10v26a10 10 0 0 1-10 10h-60l-12 14-4-14h-48a10 10 0 0 1-10-10v-26a10 10 0 0 1 10-10z"/></g><text x="82" y="36" class="hand" text-anchor="middle" font-size="19">I promised!</text><g class="rough"><rect class="box" x="180" y="206" width="114" height="38" rx="6"/></g><g class="chw"><rect x="188" y="212" width="28" height="26" rx="5"/><text x="202" y="230" text-anchor="middle" font-size="14">1</text></g><g class="chw"><rect x="222" y="212" width="28" height="26" rx="5"/><text x="236" y="230" text-anchor="middle" font-size="14">2</text></g><g class="chw"><rect x="256" y="212" width="28" height="26" rx="5"/><text x="270" y="230" text-anchor="middle" font-size="14">3</text></g><g class="badp"><rect x="330" y="120" width="100" height="40" rx="6"/><text x="380" y="145" text-anchor="middle" font-size="14">wrong copy</text></g><path class="strike" d="M330 170L430 112" opacity="0"/><g transform="translate(330 176)"><text x="0" y="14" class="mono m" font-size="12">pinned id: ""</text><text x="0" y="32" class="mono m" font-size="12">a says: 37df</text></g><g class="chg"><rect x="330" y="214" width="100" height="40" rx="6"/><text x="380" y="239" text-anchor="middle" font-size="13">b: gone</text></g></g></svg></div>
      <figcaption><b>Figure 2</b>The old test refused a. Its ballot was fine. Only its copy id failed to match a record that was never written.</figcaption>
    </figure>

Nothing is wrong with a. Its promise is as good as any. The test asked a question about identity, and the answer to it was not what the fence needed.

## The two halves, one at a time

The new rule asks the two questions separately, and each has its own evidence.

**Exclusion counts ballots, and only ballots.** A member's promise counts if its ballots are *kept*, meaning its directory never lost them: no wipe, no restore, no replaced copy. An unclean crash does not matter, because ballots are fsynced. It does not matter which log the copy holds or what its storage id is. A member that did lose its ballots counts again only after a leader has introduced a replica set that names it, after the loss, and shipped data to it. From that point its fresh promises are the only ones in play.

This is safe because the old leader needs a majority of its own set to acknowledge anything. The new fence collects a kept ballot from a majority of every set that could still acknowledge, which is the fence's own set plus each set started since the last generation known to have opened. Two majorities of one set share a kept ballot, and that ballot is already at G or above, so it refuses the old leader. A set is never dropped on silence.

**Coverage counts logs, and only logs.** A copy is *trusted* when it holds everything its seat acknowledged. That is true when the process started clean, or when it crashed without losing its page cache. It is also true when a leader has since shipped it a batch that left it level with that leader's acknowledged mark. The fence needs trusted answers that meet every majority of every set it fences. If a majority acknowledged a write, a trusted answer from the majority the leader hears from holds it, and the leader takes the log that is furthest ahead.

Two cases need care. A leader that is *continuing*, still the same process that opened G-1, already holds everything it acknowledged and skips coverage. And a copy that is not trusted may still answer, and its log may still be the furthest ahead. That is fine, because any log is a prefix of some real leader's log, and the comparison is total. It only cannot be counted toward the meet.

The two halves do not share evidence. A broker that crashed uncleanly is untrusted for coverage, because its tail may be gone. It is still kept for exclusion, because its ballots are not. In the old test it was one doubted copy. In the new rule it is a full vote on one question and no vote on the other.

## What the open rule looks like now

A leader opens at G when, for each set in the fence, a majority of that set answered with a kept ballot, and unless it is continuing, the trusted answers meet every majority of that set. That is the condition for a failover, an election, a rename, a skipped generation, a set change, a readmission and a continuing leader. The special cases are the same rule with the trusted or kept set empty.

Back to the stall. a is kept, so it counts for exclusion no matter what id it reports. It started clean, so it is trusted. c is trusted too. With three members, two trusted answers meet every majority, and c opens. The empty pin is never consulted, because there is no pin.

Old peers do not get the new rule for free. A peer that predates the attestation answers as before, and its answer counts under the old predicate, both as a promise and as coverage. A fence mixing old and new peers is no more permissive than either.

## How it was checked

The rule has its own TLA+ model in . It models seats and the copies that change under them: unclean crashes, wipes and restores, plus elections, failovers, renames, skipped generations and set changes. TLC explores every interleaving within the limits a config sets, and the invariants it checks include that no generation has two leaders and that every leader holds every acknowledged record at or below its generation.

A model that only passes proves little, so most of the configs are built to fail. Each one switches off one part of the rule and TLC must find the defect that part prevented. Counting a wiped copy's old ballots produces a second leader at one generation. Counting a copy that was only registered, not caught up, produces a leader missing an acknowledged record. So do skipping coverage, dropping an unopened set without evidence from its own leader, and vouching a copy to the start of a generation rather than to the leader's acknowledged mark. Another config runs the old predicate in outline and shows the stalls above.

Building the model changed the rule twice. A deposed leader can still ship to a wiped copy, because nothing refuses it, and that made an empty seat look trusted, so only the leader that readmitted a copy may vouch for it. And the vouch has to reach the leader's acknowledged mark, not just the start record of its generation.

## What it costs

A copy that lost its log needs a leader to bring it level before it counts for coverage, and one that lost its ballots needs a set that readmits it before it counts for exclusion. Neither is new, but the rule makes both explicit and puts them in the answer a copy gives, so the leader no longer infers them from which copy a record says it should be.

Nothing changes in what a client is told. The fence decides who may lead. It does not change when a write is acknowledged.

## Trying it

[](https://github.com/GetFelix/felix/blob/main/docs/replication-design.md) describes fencing a promotion, and the [testing page](https://docs.getfelix.dev/architecture/testing/#tla-models) explains how the TLA+ models run in CI. The model itself is [](https://github.com/GetFelix/felix/blob/main/docs/formal/FelixShardUnified.tla), and its README lists which config is meant to pass and which is meant to fail. [The follower that forgot](/blog/the-follower-that-forgot.html) covers how a copy that loses its directory gets back in.

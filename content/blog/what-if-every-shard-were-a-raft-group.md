+++
title = "What if every shard were a Raft group?"
description = "Felix replicates each shard with a protocol it built itself, and keeps the control plane's Raft log in a different store. What if both ran on one storage engine and one consensus protocol, and what would that have to prove before it replaced anything?"
date = 2026-11-10T12:00:00
slug = "what-if-every-shard-were-a-raft-group"
path = "blog/what-if-every-shard-were-a-raft-group.html"

[taxonomies]
topics = ["architecture", "replication", "durability"]

[extra]
read_minutes = 9
card = "cards/what-if-every-shard-were-a-raft-group.svg"
+++

Every distributed system has a rule for what happens when its leader disappears. Felix has one for each shard, and it is long. It has generations, fences, vouching for copies of data that might have lost their disk, leases handed out by the control plane, joint fences for changing the set of replicas, and an election that works without the control plane for when the control plane is the thing that went down.

Each piece exists because a real failure demanded it. Together they are about 26,000 lines of replication code, checked by about 8,000 lines of TLA+ spread over 425 model configurations. This post asks whether that is the right amount of thing to own.

## The cost of owning a consensus protocol

If you write your own consensus, you own its correctness. Not the part you got right, all of it. Every ordering of crashes, restarts, partitions and wiped disks is yours to reason about, and so is every interaction between two rules you added months apart.

We have felt this. Most of the defects we found while hardening failover lived in the replication protocol, in the fences, the vouching, the leases and the elections. A fence that was too strict stalled a healthy majority. One that was too loose could have let an old leader keep writing. The fixes were correct, and each one was another special case. [Two questions, one fence](/blog/two-questions-one-fence.html) is what it looks like to pull one of those apart: the rule got simpler only after we stopped patching it and asked what it was for.

That is the pattern worth worrying about. Hand-built consensus does not fail all at once. It grows, one justified exception at a time, until nobody can hold the whole rule in their head.

<figure class="fig ck">
      <div class="stage glow"><svg class="ck-svg" viewBox="0 0 460 330" role="img" aria-labelledby="oe1-t"><title id="oe1-t">On the left, a stack of paper slips labelled fences, vouching, control-plane leases, joint fences, opt-in election and generations, captioned made by hand. In the middle, one block labelled Raft, captioned made once, by many. The Felix cat on the right says: Fewer parts to trust.</title><g font-size="18"><path class="ground" d="M8 318C120 315 300 321 452 317"/><g class="rough"><rect class="paper" x="20" y="118" width="170" height="26" rx="3" transform="rotate(-3 105 131)"/></g><text x="32" y="136" class="mono" font-size="14">fences</text><g class="rough"><rect class="paper" x="34" y="148" width="170" height="26" rx="3" transform="rotate(2 119 161)"/></g><text x="46" y="166" class="mono" font-size="14">vouching</text><g class="rough"><rect class="paper" x="20" y="178" width="170" height="26" rx="3" transform="rotate(-2 105 191)"/></g><text x="32" y="196" class="mono" font-size="14">control-plane leases</text><g class="rough"><rect class="paper" x="34" y="208" width="170" height="26" rx="3" transform="rotate(3 119 221)"/></g><text x="46" y="226" class="mono" font-size="14">joint fences</text><g class="rough"><rect class="paper" x="20" y="238" width="170" height="26" rx="3" transform="rotate(-2 105 251)"/></g><text x="32" y="256" class="mono" font-size="14">opt-in election</text><g class="rough"><rect class="paper" x="34" y="268" width="170" height="26" rx="3" transform="rotate(2 119 281)"/></g><text x="46" y="286" class="mono" font-size="14">generations</text><text x="105" y="322" class="m" font-size="15" text-anchor="middle">made by hand</text><g class="rough"><rect class="boxa" x="236" y="214" width="96" height="70" rx="4"/></g><text x="284" y="257" class="hand" font-size="26" text-anchor="middle">Raft</text><text x="284" y="304" class="m" font-size="15" text-anchor="middle">made once, by many</text><g class="rough"><g transform="translate(452 112) scale(-0.95 0.95)"><path class="tl-e" d="M84 178C114 176 122 146 108 128C99 116 104 102 114 102"/><path class="tl" d="M84 178C114 176 122 146 108 128C99 116 104 102 114 102"/><path class="cf" d="M30 80C14 108 11 160 20 188L86 188C96 160 94 110 72 80Z"/><path class="cw" d="M38 90C33 120 37 150 50 168C63 150 67 120 62 90C56 97 44 97 38 90Z"/><ellipse class="cf" cx="38" cy="187" rx="12" ry="6"/><ellipse class="cf" cx="64" cy="187" rx="12" ry="6"/><path class="tl-e" d="M70 104C86 108 100 106 112 100" style="stroke-width:16"/><path class="tl" d="M70 104C86 108 100 106 112 100" style="stroke-width:11"/><circle class="cf" cx="114" cy="99" r="8"/><g transform="translate(0 -2)"><path class="cf" d="M20 52C19 38 24 29 31 24L27 6Q27 3 30 5L47 17Q50 16.5 53 17L70 5Q73 3 73 6L69 24C76 29 81 38 80 52C80 72 67 86 50 86C33 86 20 72 20 52Z"/><path class="ce" d="M32 21L30.5 11L41 18ZM68 21L69.5 11L59 18Z"/><path class="cw" d="M29 66C31 57 42 55 50 60C58 55 69 57 71 66C71 77 61 84 50 84C39 84 29 77 29 66Z"/><path class="cn" d="M45.5 60.5h9l-4.5 5z"/><path class="wh" d="M31 68L6 63M31 73L7 76M69 68L94 63M69 73L93 76"/><path class="cw" d="M30 45Q38 37 46 45Q38 50 30 45ZM54 45Q62 37 70 45Q62 50 54 45Z"/><circle class="cp" cx="40" cy="45" r="3.4"/><circle class="cp" cx="64" cy="45" r="3.4"/><path class="lid" d="M29 42Q38 37 47 43M53 43Q62 37 71 42"/><path class="mo" d="M43 70Q50 77 58 69"/></g></g></g><g class="rough"><path class="bubble" d="M170 12h270a12 12 0 0 1 12 12v32a12 12 0 0 1-12 12H380l-16 16 2-16H170a12 12 0 0 1-12-12v-32a12 12 0 0 1 12-12z"/></g><text x="305.0" y="48" class="hand" font-size="22" text-anchor="middle">Fewer parts to trust.</text></g></svg></div>
      <figcaption><b>Figure 1</b>The shard protocol is a stack of parts Felix wrote and has to keep correct. Raft is one part that many people have already studied, broken and fixed.</figcaption>
    </figure>

## What Raft already is

Raft is a standard protocol. It has a published proof, a long record of independent implementations, and formal models anyone can read. [openraft](https://github.com/databendlabs/openraft) is an open-source Rust implementation of it, and the Felix control plane already uses it to keep cluster metadata consistent.

So what if the shards used it too? Not as an add-on, but as the only way a shard agrees with its replicas. Every shard would be a Raft group. A group elects its own leader, and its term plays the part that the generation plays today. A new replica joins through a membership change, which Raft already knows how to do safely. Most of the special cases in the list above stop being Felix's problem, because the protocol has one rule for them.

The aim is not novelty. It is a system that is simpler to maintain and easier to trust, without giving up the speed or the safety it has.

## Why this needs one storage engine too

Consensus sits on top of a log, and Felix already has a good one. The segment store handles fsync modes, group commit, `F_FULLFSYNC` on macOS, torn-tail repair and corruption checks. It is the code that decides whether an acknowledged record survives a power cut.

The control plane does not use it. Its Raft log lives in a separate embedded database, with a separate set of durability rules, tested separately. That means two answers to "is this write safe?", and two places a bug can hide.

The earlier replication design chose log shipping over Raft for a reason that deserves respect. Raft over the stream log means either two logs that can disagree after a crash, or a log that carries Raft's term bookkeeping itself. Felix does not want the first, and the second is a different storage layer. The question is whether the second is a small change or a rewrite.

What if the segment store carried the term itself?

## The term in the record

Each record would carry, in its header, the generation of the leader that wrote it. In Raft terms that is the term. The header field is checksummed with the record, is cut off with the record if the tail is torn, and needs no rules of its own. An alternative, a side file of generation ranges, would be one more thing to keep consistent through every crash and truncation, so it stays a hint and never becomes the source of truth.

The offset is the Raft index. One record is one entry. The things Raft writes that no client wrote, a blank entry when a leader takes over and a membership change, would be ordinary records that readers skip, the way they already skip the record a leader writes when it opens. Subscribers keep detecting drops by a jump in offsets, because the offsets of skipped records are accounted for.

<figure class="fig ck">
      <div class="stage"> <svg class="ck-svg" viewBox="0 0 460 330" role="img" aria-labelledby="oe2-t"><title id="oe2-t">A row of records numbered 0 to 8. Records 0 to 3 are grouped under a dashed line labelled snapshot base and carry no term. Records 4 to 6 are tagged term 7 and records 7 and 8 are tagged term 8, in the record header. The Felix cat says: The term rides in the record.</title><g font-size="18"><path class="ground" d="M8 318C120 315 300 321 452 317"/><g class="chw"><rect x="14" y="196" width="30" height="34" rx="4"/><text x="29" y="218" class="mono" font-size="14" text-anchor="middle">0</text></g><g class="chw"><rect x="48" y="196" width="30" height="34" rx="4"/><text x="63" y="218" class="mono" font-size="14" text-anchor="middle">1</text></g><g class="chw"><rect x="82" y="196" width="30" height="34" rx="4"/><text x="97" y="218" class="mono" font-size="14" text-anchor="middle">2</text></g><g class="chw"><rect x="116" y="196" width="30" height="34" rx="4"/><text x="131" y="218" class="mono" font-size="14" text-anchor="middle">3</text></g><g class="chg"><rect x="150" y="196" width="30" height="34" rx="4"/><text x="165" y="218" class="mono" font-size="14" text-anchor="middle">4</text></g><text x="165" y="252" class="a" font-size="14" text-anchor="middle">t7</text><g class="chg"><rect x="184" y="196" width="30" height="34" rx="4"/><text x="199" y="218" class="mono" font-size="14" text-anchor="middle">5</text></g><text x="199" y="252" class="a" font-size="14" text-anchor="middle">t7</text><g class="chg"><rect x="218" y="196" width="30" height="34" rx="4"/><text x="233" y="218" class="mono" font-size="14" text-anchor="middle">6</text></g><text x="233" y="252" class="a" font-size="14" text-anchor="middle">t7</text><g class="chg"><rect x="252" y="196" width="30" height="34" rx="4"/><text x="267" y="218" class="mono" font-size="14" text-anchor="middle">7</text></g><text x="267" y="252" class="a" font-size="14" text-anchor="middle">t8</text><g class="chg"><rect x="286" y="196" width="30" height="34" rx="4"/><text x="301" y="218" class="mono" font-size="14" text-anchor="middle">8</text></g><text x="301" y="252" class="a" font-size="14" text-anchor="middle">t8</text><path class="lnm dash" d="M14 240H144"/><text x="79" y="262" class="m" font-size="14" text-anchor="middle">snapshot base</text><text x="14" y="184" class="m" font-size="14">offsets</text><text x="290" y="288" class="m" font-size="14" text-anchor="middle">term in the record header</text><g class="rough"><g transform="translate(452 112) scale(-0.95 0.95)"><path class="tl-e" d="M84 178C114 176 122 146 108 128C99 116 104 102 114 102"/><path class="tl" d="M84 178C114 176 122 146 108 128C99 116 104 102 114 102"/><path class="cf" d="M30 80C14 108 11 160 20 188L86 188C96 160 94 110 72 80Z"/><path class="cw" d="M38 90C33 120 37 150 50 168C63 150 67 120 62 90C56 97 44 97 38 90Z"/><ellipse class="cf" cx="38" cy="187" rx="12" ry="6"/><ellipse class="cf" cx="64" cy="187" rx="12" ry="6"/><path class="tl-e" d="M70 104C86 108 100 106 112 100" style="stroke-width:16"/><path class="tl" d="M70 104C86 108 100 106 112 100" style="stroke-width:11"/><circle class="cf" cx="114" cy="99" r="8"/><g transform="translate(0 -2)"><path class="cf" d="M20 52C19 38 24 29 31 24L27 6Q27 3 30 5L47 17Q50 16.5 53 17L70 5Q73 3 73 6L69 24C76 29 81 38 80 52C80 72 67 86 50 86C33 86 20 72 20 52Z"/><path class="ce" d="M32 21L30.5 11L41 18ZM68 21L69.5 11L59 18Z"/><path class="cw" d="M29 66C31 57 42 55 50 60C58 55 69 57 71 66C71 77 61 84 50 84C39 84 29 77 29 66Z"/><path class="cn" d="M45.5 60.5h9l-4.5 5z"/><path class="wh" d="M31 68L6 63M31 73L7 76M69 68L94 63M69 73L93 76"/><path class="cw" d="M30 45Q38 37 46 45Q38 50 30 45ZM54 45Q62 37 70 45Q62 50 54 45Z"/><circle class="cp" cx="40" cy="45" r="3.4"/><circle class="cp" cx="64" cy="45" r="3.4"/><path class="lid" d="M29 42Q38 37 47 43M53 43Q62 37 71 42"/><path class="mo" d="M43 70Q50 77 58 69"/></g></g></g><g class="rough"><path class="bubble" d="M130 12h310a12 12 0 0 1 12 12v32a12 12 0 0 1-12 12H380l-16 16 2-16H130a12 12 0 0 1-12-12v-32a12 12 0 0 1 12-12z"/></g><text x="285.0" y="48" class="hand" font-size="22" text-anchor="middle">The term rides in the record.</text></g></svg></div>
      <figcaption><b>Figure 2</b>New records carry the term of the leader that wrote them. Older records stay exactly as they were, below a snapshot.</figcaption>
    </figure>

Records written before the term existed are the awkward case. Their writer is unknown, and replicas can disagree about which generation wrote an offset. Raft needs every replica to agree on every term it compares. So those records would never become Raft entries. When a shard switched, the leader would take the committed end of the log as a snapshot point. Everything before it is the snapshot base, and Raft never compares terms below a snapshot, so the disagreement is never read.

Nothing is rewritten to fix it. Felix's recovery trusts that valid bytes end at the end of the file, and that is true only while records are never rewritten. The old records stay as they are, and the new rule starts above them.

## Thousands of groups on one broker

One group per shard sounds clean until you count. A broker can lead thousands of shards. Thousands of Raft groups means thousands of election timers and, left alone, thousands of heartbeat streams between each pair of brokers.

Other systems have already run into this. CockroachDB runs a group per range, TiKV per region, and YugabyteDB per tablet, all with thousands of groups on a node. They converged on the same two answers, and Felix would need both.

The first is to coalesce heartbeats. A broker sends one message per peer per interval, carrying the heartbeat for every group the two share. The second is to let idle groups sleep. A group with no writes stops heartbeating, and its followers do not start an election just because it is quiet. They start one when the liveness of the whole broker says the leader is gone.

They also learned the less obvious things. Liveness has to be peer to peer, and tied to the disk: CockroachDB's first design kept it in one central range, which was a single point of failure, and a node with a stalled disk could keep its leases. A heartbeat should count only after the sender has written it to disk. Leases should follow node-level support instead of per-group traffic, so a sleeping group keeps its lease and the groups of a dead broker do not all wake and campaign at once. And the first fix for an overloaded node is always fewer groups, which is why Felix would fold a shard's cache and counters into the shard's one group instead of giving them their own.

openraft runs each group as its own task, with its own timers. It has no built-in coalescing or hibernation, but its timers can be turned off and driven from outside, so one driver per broker could own them all. Whether thousands of tasks cost too much memory or scheduling is the first thing to measure. If they do, the answer is to fix the limit in openraft and send the change upstream, not to keep a private fork. A library that thousands of other deployments depend on is a better place for that fix to live than a copy only Felix runs.

## What would have to be true

Believing the idea is the cheap part. Replacing a protocol that took this long to get right takes evidence, so the evidence is written down before any numbers exist.

Raft replaces the hand-built protocol only if it is as good in every way that matters. It must show no history-checker violation, and no simulator stall that the current protocol does not also have on the same seed. Throughput must be within 10% of the current protocol in every cell of the A/B runs, p99 latency within 20%, and failover time no worse. A leader that crashes while the control plane is down must still fail over and keep serving. Both protocols run the same tests, on the same commit, on the same runners, across single node and three-replica steady and promotion-burst cells, at 1 KiB and 64 KiB payloads.

If Raft misses a line, the gap is fixed in the Raft version, or the decision is reopened with the numbers in the open. Until it passes, the current protocol is the one that runs. Lines of code are reported alongside, but they do not count for or against. Less code that is slower or less safe would not be a win.

## What stays the same

The broker's write path keeps its order. A publish still takes its offsets before it waits on durability, and storage still makes later publishes wait behind earlier ones. The control plane still decides which brokers hold which shards. The peer transport still carries the messages. What changes is the box in the middle that answers five questions: how a batch reaches the followers, which offset is safe, who may lead, how the replica set changes, and how far a reader may see.

That box is already a boundary in the code, a single interface with the current protocol behind it. A second implementation behind the same interface is what lets the two run the same tests side by side.

The leader's own append is the hardest fit. Felix appends first and tells replication afterwards, to keep one encode per batch. openraft expects to append the leader's entries itself. The first thing to try is letting the library find the entries already durable at those indexes and return at once, so the hot path is untouched. If openraft cannot accept entries it did not write, the fallback is to hand it the batch directly, and the cost shows up in the latency cells.

## Why ask it as a question

Because the answer is allowed to be no. A hand-built protocol that has been through this many failures has earned something, and a standard one earns it only by passing the same tests. If it does, Felix has one log format with one set of durability rules, one consensus model with one set of failure rules, and a lot less to explain at three in the morning. If it does not, the numbers will say where, and that is worth knowing too.

+++
title = "A ceiling that wouldn't move, and a benchmark that lied about it"
description = "One Felix broker plateaued near 900 MB/s whatever we changed. Three bugs in the load generator made two hypotheses look tested when they weren't. Here is what we found, what shipped, and how we check an instrument now."
date = 2026-12-01
slug = "a-ceiling-that-would-not-move"
path = "blog/a-ceiling-that-would-not-move.html"
[taxonomies]
topics = ["performance", "testing"]
[extra]
read_minutes = 12
card = "cards/a-ceiling-that-would-not-move.svg"
+++

One Felix broker, durable stream, fsync on every commit. It ran at about 900 MB/s. We added shards. We added connections. We changed how the disk is flushed, raised the worker count, raised every admission budget by 16 to 64 times. Every valid run landed between 842 and 926 MB/s.

The broker never went above 69% busy, and the disk was well short of what it could do. Something was holding the number in place, and for a while the most misleading thing in the room was our own load generator.

This post is about that session. A routing-key fix and an `io_uring` flush path shipped out of it, and we changed how we describe sharding. Most of what we learned, though, was about how a benchmark can report a result for an experiment that never ran.

## The rig

One broker VM with 8 vCPUs and four local NVMe drives in RAID0, ext4 on top. Four load generator VMs with 4 vCPUs each. One control plane. Payloads were 4 KiB, batched 64 at a time, over TLS on QUIC, with the fsync mode set to `on_commit` and a replication factor of 1.

We wiped storage between every run. That was not ceremony. The volume had built up 396 GB from earlier sessions, and stale data had confused an earlier investigation.

## Lie one: twelve shards were one shard

In Felix, a record with no routing key goes to shard 0. The ingest scenario in `felix-loadgen` didn't send keys.

So every "12-shard" number the tool had ever produced was a single-shard number. A 12-shard stream and a 1-shard stream measured 920 and 923 MB/s, and we had read that as "sharding doesn't help on one broker". They matched because they were the same log.

<div class="stage glow"><svg class="ck-svg" viewBox="0 0 480 340" role="img" aria-labelledby="ow1-t"><title id="ow1-t">A row of eight offsets in a shard's log, 40 to 47. Offset 42 is grey, labelled new term, and offset 45 is grey, labelled members. Dashed lines carry the six records down to what a subscriber gets: 40, 41, 43, 44, 46 and 47. Sticky notes under 43 and 46 read skipped 1. The Felix cat says: Two holes, nothing lost.</title><g font-size="18"><text x="16" y="32" class="m" font-size="16">the shard's log</text><g class="chw"><rect x="16" y="44" width="52" height="44" rx="5"/><text x="42" y="71.8" class="mono" text-anchor="middle" font-size="16">40</text></g><path class="lnm dash" d="M42 90V146"/><g class="chw"><rect x="16" y="150" width="52" height="40" rx="5"/><text x="42" y="175.8" class="mono" text-anchor="middle" font-size="16">40</text></g><g class="chw"><rect x="74" y="44" width="52" height="44" rx="5"/><text x="100" y="71.8" class="mono" text-anchor="middle" font-size="16">41</text></g><path class="lnm dash" d="M100 90V146"/><g class="chw"><rect x="74" y="150" width="52" height="40" rx="5"/><text x="100" y="175.8" class="mono" text-anchor="middle" font-size="16">41</text></g><g class="chg"><rect x="132" y="44" width="52" height="44" rx="5"/><text x="158" y="71.8" class="mono m" text-anchor="middle" font-size="16">42</text></g><text x="158" y="108" class="a" text-anchor="middle" font-size="14">new term</text><g class="chw"><rect x="190" y="44" width="52" height="44" rx="5"/><text x="216" y="71.8" class="mono" text-anchor="middle" font-size="16">43</text></g><path class="lnm dash" d="M216 90V146"/><g class="chw"><rect x="190" y="150" width="52" height="40" rx="5"/><text x="216" y="175.8" class="mono" text-anchor="middle" font-size="16">43</text></g><g class="rough"><rect class="note" x="181" y="198" width="70" height="24" rx="4"/></g><text x="216" y="215" class="mono" text-anchor="middle" font-size="13">skipped 1</text><g class="chw"><rect x="248" y="44" width="52" height="44" rx="5"/><text x="274" y="71.8" class="mono" text-anchor="middle" font-size="16">44</text></g><path class="lnm dash" d="M274 90V146"/><g class="chw"><rect x="248" y="150" width="52" height="40" rx="5"/><text x="274" y="175.8" class="mono" text-anchor="middle" font-size="16">44</text></g><g class="chg"><rect x="306" y="44" width="52" height="44" rx="5"/><text x="332" y="71.8" class="mono m" text-anchor="middle" font-size="16">45</text></g><text x="332" y="108" class="a" text-anchor="middle" font-size="14">members</text><g class="chw"><rect x="364" y="44" width="52" height="44" rx="5"/><text x="390" y="71.8" class="mono" text-anchor="middle" font-size="16">46</text></g><path class="lnm dash" d="M390 90V146"/><g class="chw"><rect x="364" y="150" width="52" height="40" rx="5"/><text x="390" y="175.8" class="mono" text-anchor="middle" font-size="16">46</text></g><g class="rough"><rect class="note" x="355" y="198" width="70" height="24" rx="4"/></g><text x="390" y="215" class="mono" text-anchor="middle" font-size="13">skipped 1</text><g class="chw"><rect x="422" y="44" width="52" height="44" rx="5"/><text x="448" y="71.8" class="mono" text-anchor="middle" font-size="16">47</text></g><path class="lnm dash" d="M448 90V146"/><g class="chw"><rect x="422" y="150" width="52" height="40" rx="5"/><text x="448" y="175.8" class="mono" text-anchor="middle" font-size="16">47</text></g><text x="16" y="248" class="m" font-size="16">what a subscriber gets</text><g class="rough"><g transform="translate(12 258) scale(0.4)"><path class="tl-e" d="M84 178C114 176 122 146 108 128C99 116 104 102 114 102"/><path class="tl" d="M84 178C114 176 122 146 108 128C99 116 104 102 114 102"/><path class="cf" d="M30 80C14 108 11 160 20 188L86 188C96 160 94 110 72 80Z"/><path class="cw" d="M38 90C33 120 37 150 50 168C63 150 67 120 62 90C56 97 44 97 38 90Z"/><ellipse class="cf" cx="38" cy="187" rx="12" ry="6"/><ellipse class="cf" cx="64" cy="187" rx="12" ry="6"/><path class="tl-e" d="M70 104C88 104 100 96 108 80" style="stroke-width:16"/><path class="tl" d="M70 104C88 104 100 96 108 80" style="stroke-width:11"/><circle class="cf" cx="109" cy="77" r="8"/><g transform="translate(0 -2)"><path class="cf" d="M20 52C19 38 24 29 31 24L27 6Q27 3 30 5L47 17Q50 16.5 53 17L70 5Q73 3 73 6L69 24C76 29 81 38 80 52C80 72 67 86 50 86C33 86 20 72 20 52Z"/><path class="ce" d="M32 21L30.5 11L41 18ZM68 21L69.5 11L59 18Z"/><path class="cw" d="M29 66C31 57 42 55 50 60C58 55 69 57 71 66C71 77 61 84 50 84C39 84 29 77 29 66Z"/><path class="cn" d="M45.5 60.5h9l-4.5 5z"/><path class="wh" d="M31 68L6 63M31 73L7 76M69 68L94 63M69 73L93 76"/><path class="hap" d="M31 47Q38 39 45 47M55 47Q62 39 69 47"/><path class="mo" d="M42 70Q50 79 58 70"/></g></g></g><g class="rough"><path class="bubble" d="M92 266h362a12 12 0 0 1 12 12v24a12 12 0 0 1-12 12H92a12 12 0 0 1-12-12v-4l-14 8 14-20v-8a12 12 0 0 1 12-12z"/></g><text x="273" y="298" class="hand" text-anchor="middle" font-size="21">Two holes, nothing lost.</text></g></svg></div>

Once the generator could send keys (`felix-loadgen --keys <n>`), the real cost showed up ([#549](https://github.com/GetFelix/felix/issues/549)):

<div class="table-wrap">

| | throughput | broker user CPU |
|---|---|---|
| unkeyed, 1 shard | ~917 MB/s | 20% |
| keyed, 12 shards | 645.8 MB/s | 28% |

</div>

Routing a record cost about 30% of throughput. The cause was the frame format. The binary publish layouts had no room for a key, so a keyed publish fell back to JSON. If you wanted your records spread across shards, you paid for it in encoding.

### The fix

Felix's wire protocol adds features as negotiated flag bits instead of version numbers. [#551](https://github.com/GetFelix/felix/pull/551) added `FLAG_BINARY_PUBLISH_KEYED` (`0x0040`) as a modifier on the binary batch flag. The body gets a two-byte key length and the key bytes in front.

When the acked bit is also set, the correlation prefix still comes first and the key follows it. That keeps the request id at offset 0 whether or not a key is present, so the broker can still answer a malformed body with an error the client can match to its request.

A broker that predates the bit would read the key length as the tenant length and parse garbage. So the client only sends the keyed binary frame to a broker that advertised the bit, and uses JSON otherwise. That costs throughput, never correctness.

After the fix, keyed runs measured 895.6 and 925.8 MB/s against an unkeyed band of 868 to 905. Keyed user CPU fell from 28% to 21%, so the JSON cost is what went away.

On the first keyed run after the fix we reported keyed as "about 5.6% slower" than unkeyed. More runs put that inside the noise. Two runs of the identical configuration had come out 3% apart. The honest result was "indistinguishable", and we corrected it.

## Lie two: settings that were never read

The next question was whether the client's connection fan-out was the limit. By default a publisher's batches for one stream hash to one worker, which means one QUIC stream on one connection. Round-robin spreads them across all of them. We set `FELIX_PUB_CONN_POOL=16` and `FELIX_PUB_SHARDING=rr` and ran it.

891.5 MB/s. Same as before. We wrote it down as evidence that client fan-out wasn't the ceiling.

It wasn't evidence of anything. `felix-loadgen` built its client with `ClientConfig::optimized_defaults`, which never reads the environment ([#553](https://github.com/GetFelix/felix/issues/553)). Every client-side variable was silently ignored. Three runs set those knobs, all three measured the defaults, and two of them had been reported as ruling out a hypothesis they never tested.

<div class="stage"><svg class="ck-svg" viewBox="0 0 480 420" role="img" aria-labelledby="ow2-t"><title id="ow2-t">Two panels. Harmless: events 1041 and 1043 with a grey new-term entry at 1042 between them, and a note on 1043 reading skipped_before: 1. The sum 1043 minus 1041 minus 1 minus 1 is 0, so nothing was dropped. A real drop: 1041, then a stretch of paw prints, then 1047, again with skipped_before: 1. The sum 1047 minus 1041 minus 1 minus 1 is 4, so four events were dropped. A sleeping cat sits in the corner.</title><g font-size="18"><rect class="panel-ok" x="4" y="4" width="472" height="196" rx="10"/><text x="20" y="34" class="cap" font-size="16">HARMLESS</text><g class="chw"><rect x="24" y="52" width="64" height="44" rx="5"/><text x="56" y="79.8" class="mono" text-anchor="middle" font-size="16">1041</text></g><g class="chg"><rect x="96" y="52" width="64" height="44" rx="5"/><text x="128" y="79.8" class="mono m" text-anchor="middle" font-size="16">1042</text></g><text x="128" y="114" class="a" text-anchor="middle" font-size="13">new term</text><g class="chw"><rect x="168" y="52" width="64" height="44" rx="5"/><text x="200" y="79.8" class="mono" text-anchor="middle" font-size="16">1043</text></g><g class="rough"><rect class="note" x="316" y="56" width="150" height="36" rx="5"/></g><text x="391" y="79" class="mono" text-anchor="middle" font-size="14">skipped_before: 1</text><path class="lnm" d="M316 74H236"/><text x="24" y="150" class="mono" font-size="17">1043 - 1041 - 1 - 1 = 0</text><text x="24" y="182" class="ok" font-size="16">nothing dropped: the hole was bookkeeping</text><rect class="panel-bad" x="4" y="214" width="472" height="196" rx="10"/><text x="20" y="244" class="cap" font-size="16">A REAL DROP</text><g class="chw"><rect x="24" y="262" width="64" height="44" rx="5"/><text x="56" y="289.8" class="mono" text-anchor="middle" font-size="16">1041</text></g><g class="chg"><rect x="96" y="262" width="136" height="44" rx="5"/></g><g fill="var(--faint)"><ellipse cx="112" cy="292" rx="5" ry="4"/><circle cx="106" cy="285" r="2"/><circle cx="112" cy="283" r="2"/><circle cx="118" cy="285" r="2"/></g><g fill="var(--faint)"><ellipse cx="136" cy="280" rx="5" ry="4"/><circle cx="130" cy="273" r="2"/><circle cx="136" cy="271" r="2"/><circle cx="142" cy="273" r="2"/></g><g fill="var(--faint)"><ellipse cx="160" cy="292" rx="5" ry="4"/><circle cx="154" cy="285" r="2"/><circle cx="160" cy="283" r="2"/><circle cx="166" cy="285" r="2"/></g><g fill="var(--faint)"><ellipse cx="184" cy="280" rx="5" ry="4"/><circle cx="178" cy="273" r="2"/><circle cx="184" cy="271" r="2"/><circle cx="190" cy="273" r="2"/></g><g fill="var(--faint)"><ellipse cx="208" cy="292" rx="5" ry="4"/><circle cx="202" cy="285" r="2"/><circle cx="208" cy="283" r="2"/><circle cx="214" cy="285" r="2"/></g><g class="chw"><rect x="240" y="262" width="64" height="44" rx="5"/><text x="272" y="289.8" class="mono" text-anchor="middle" font-size="16">1047</text></g><g class="rough"><rect class="note" x="316" y="266" width="150" height="36" rx="5"/></g><text x="391" y="289" class="mono" text-anchor="middle" font-size="14">skipped_before: 1</text><path class="lnm" d="M316 284H308"/><text x="24" y="360" class="mono" font-size="17">1047 - 1041 - 1 - 1 = 4</text><text x="24" y="392" class="bad" font-size="16">4 dropped: read them back from the log</text><g class="rough"><g transform="translate(404 330) scale(0.5)"><g transform="translate(0 -2)"><path class="cf" d="M20 52C19 38 24 29 31 24L27 6Q27 3 30 5L47 17Q50 16.5 53 17L70 5Q73 3 73 6L69 24C76 29 81 38 80 52C80 72 67 86 50 86C33 86 20 72 20 52Z"/><path class="ce" d="M32 21L30.5 11L41 18ZM68 21L69.5 11L59 18Z"/><path class="cw" d="M29 66C31 57 42 55 50 60C58 55 69 57 71 66C71 77 61 84 50 84C39 84 29 77 29 66Z"/><path class="cn" d="M45.5 60.5h9l-4.5 5z"/><path class="wh" d="M31 68L6 63M31 73L7 76M69 68L94 63M69 73L93 76"/><path class="hap" d="M31 45Q38 51 45 45M55 45Q62 51 69 45"/><path class="mo" d="M44 72Q50 75 56 72"/></g></g></g><text x="466" y="334" class="hand m" text-anchor="end" font-size="20">z</text><text x="452" y="320" class="hand m" text-anchor="end" font-size="17">z</text></g></svg></div>

A knob that looks set and isn't is worse than one that doesn't exist. Nothing failed. The run looked like any other run.

[#554](https://github.com/GetFelix/felix/pull/554) switched the generator to `ClientConfig::from_env_or_yaml`, which layers the environment over the same defaults, so an unset environment still measures exactly what it did before. Its test sets a pool size the default doesn't use and asserts it reaches the client. Reverting the fix makes that test fail.

We reran round-robin on the fixed generator, and this time checked that the binary reported `sharding=RoundRobin` before trusting the number. 912.6 MB/s. Inside the band. Now it was actually ruled out.

## Lie three: we only measured one side

The harness sampled CPU on the broker and not on the generators. A run where the generators were saturated and the broker wasn't would have read as a broker result.

Six configurations in a row came out around 880 MB/s before anyone looked. When we added the same `/proc/stat` sampler to the generators, they were 22 to 31% busy. Three quarters idle.

One run then failed in a useful way. At 32 publishers per generator, three of the four generators couldn't connect in time. The one that did ran alone at 594.7 MB/s, using 69% of its CPU. With four generators sharing the broker, each got about 220. The generators had room. Each one was being handed a quarter of a broker's ceiling.

## The suspects we could clear

With the instrument fixed, we went through the broker one part at a time.

**The commit sequencer.** An earlier session had concluded the ceiling was commit-sequencer-bound and predicted throughput would scale with commit paths. Felix keeps one sequencer per stream shard, so twelve shards gave us twelve independent commit paths. Throughput didn't move. That earlier conclusion was wrong, and we corrected it.

**The publish worker pool.** Default 4 workers, each claiming its batches in order. A plausible funnel. At 16 workers: 842.1 MB/s, slightly worse.

**Admission budgets.** 64 MB process-wide and 16 MB per connection. Throughput under a byte window is the window divided by how long bytes sit in it, which would explain a number that ignored everything else. Before running it we checked the arithmetic. By Little's Law, a 64 MB window holding throughput at 890 MB/s needs about 72 ms average residence. Measured ack p50 on this hardware was about 200 µs, roughly 300 times shorter. We raised the budgets 16 and 64 times anyway: 895.6 MB/s.

**The disk.** I/O wait was 4 to 13%. `fio` measured the array at 1,346 MB/s with `fdatasync` across four jobs. Felix at 900 was about 67% of that.

**One hot core.** 60% total CPU can hide one core at 100%. Per-core sampling showed all eight between 67 and 71%, with softirq spread evenly. No hot core.

That last one cleared less than it seemed to. Tokio's runtime steals work between threads, so a single task that is always runnable moves from core to core. Sampled once a second, one saturated task looks exactly like moderate, even load on every core. Per-core sampling can tell "one pegged CPU" from "work spread out". It can't tell "work spread out" from "one busy task that keeps moving". We had to mark that family of explanations as untested, not eliminated.

## The io_uring number, twice retracted

Felix runs device flushes on a blocking thread pool so a slow `fsync` can't stall the async runtime. The storage code justified that with "an `fsync` genuinely blocks, for milliseconds on real hardware". On this NVMe array a flush took a few hundred microseconds, so the hand-off to the pool was a real share of the work.

[#547](https://github.com/GetFelix/felix/issues/547) first claimed the hand-off cost 17 times the syscall. That compared Felix's flush under load with `fio`'s flush on an idle device. When we ran the sync inline, with no hand-off at all, the flush went from 583 µs to 530 µs, about 9%. We retracted the 17×.

`IORING_OP_FSYNC` removes the hand-off instead of shrinking it. The request goes into a ring, the kernel does it, a completion comes back, and no thread is parked. Running the sync inline also removes the hand-off, but it takes away the `await` point that background rollover and retention depend on to get scheduled. We built that version to measure it, then threw it away.

The ring loop had a bug worth knowing about. The first version only drained completions when a new submission arrived, so a flush with no traffic behind it could wait forever. It never showed under load. It showed at the end of a run, when the traffic that would have rescued it had stopped.

One early run said +6.5%. Repeats said this:

<div class="table-wrap">

| | runs (MB/s) | mean |
|---|---|---|
| thread pool | 923.7, 913.6, 914.2 | 917.2 |
| `io_uring` | 926.0, 943.3, 973.2, 984.1 | 956.7 |

</div>

+4.3%, with no overlap between the two sets. It shipped in [#551](https://github.com/GetFelix/felix/pull/551) behind `FELIX_STORAGE_IO_URING=1`, Linux only, off by default. The thread pool stays as the fallback for macOS and for any Linux that can't build a ring, such as an old kernel or a container that blocks the syscall. Durability shouldn't depend on an optimisation being available.

## What twelve shards actually cost

Sharding didn't help on one broker, and it wasn't free either. The broker's own flush counters for two runs moving the same bytes:

<div class="stage"><svg class="ck-svg" viewBox="0 0 480 400" role="img" aria-labelledby="ow3-t"><title id="ow3-t">Two panels. Two counters: a row of Raft indexes 1 to 7 with index 3 grey, and beneath it a second row of dense offsets 1 to 6 that skips the grey one, captioned one more mapping to get right after every crash. One number: offsets 1 to 7, with offset 3 grey and labelled no event, captioned the hole is labelled, not hidden. The cat looks pleased.</title><g font-size="18"><rect class="panel" x="4" y="4" width="472" height="186" rx="10"/><text x="20" y="34" class="cap" font-size="16">TWO COUNTERS</text><text x="20" y="80" class="m" font-size="15">index</text><text x="20" y="130" class="m" font-size="15">offset</text><g class="chw"><rect x="96" y="56" width="46" height="36" rx="5"/><text x="119" y="79.4" class="mono" text-anchor="middle" font-size="15">1</text></g><g class="chc"><rect x="96" y="106" width="46" height="36" rx="5"/><text x="119" y="129.4" class="mono" text-anchor="middle" font-size="15">1</text></g><g class="chw"><rect x="148" y="56" width="46" height="36" rx="5"/><text x="171" y="79.4" class="mono" text-anchor="middle" font-size="15">2</text></g><g class="chc"><rect x="148" y="106" width="46" height="36" rx="5"/><text x="171" y="129.4" class="mono" text-anchor="middle" font-size="15">2</text></g><g class="chg"><rect x="200" y="56" width="46" height="36" rx="5"/><text x="223" y="79.4" class="mono m" text-anchor="middle" font-size="15">3</text></g><g class="chg"><rect x="200" y="106" width="46" height="36" rx="5"/></g><g class="chw"><rect x="252" y="56" width="46" height="36" rx="5"/><text x="275" y="79.4" class="mono" text-anchor="middle" font-size="15">4</text></g><g class="chc"><rect x="252" y="106" width="46" height="36" rx="5"/><text x="275" y="129.4" class="mono" text-anchor="middle" font-size="15">3</text></g><g class="chw"><rect x="304" y="56" width="46" height="36" rx="5"/><text x="327" y="79.4" class="mono" text-anchor="middle" font-size="15">5</text></g><g class="chc"><rect x="304" y="106" width="46" height="36" rx="5"/><text x="327" y="129.4" class="mono" text-anchor="middle" font-size="15">4</text></g><g class="chw"><rect x="356" y="56" width="46" height="36" rx="5"/><text x="379" y="79.4" class="mono" text-anchor="middle" font-size="15">6</text></g><g class="chc"><rect x="356" y="106" width="46" height="36" rx="5"/><text x="379" y="129.4" class="mono" text-anchor="middle" font-size="15">5</text></g><g class="chw"><rect x="408" y="56" width="46" height="36" rx="5"/><text x="431" y="79.4" class="mono" text-anchor="middle" font-size="15">7</text></g><g class="chc"><rect x="408" y="106" width="46" height="36" rx="5"/><text x="431" y="129.4" class="mono" text-anchor="middle" font-size="15">6</text></g><text x="20" y="174" class="bad" font-size="15">one more mapping to get right after every crash</text><rect class="panel" x="4" y="204" width="472" height="186" rx="10"/><text x="20" y="234" class="cap" font-size="16">ONE NUMBER</text><text x="20" y="280" class="m" font-size="15">offset</text><g class="chw"><rect x="96" y="256" width="46" height="36" rx="5"/><text x="119" y="279.4" class="mono" text-anchor="middle" font-size="15">1</text></g><g class="chw"><rect x="148" y="256" width="46" height="36" rx="5"/><text x="171" y="279.4" class="mono" text-anchor="middle" font-size="15">2</text></g><g class="chg"><rect x="200" y="256" width="46" height="36" rx="5"/><text x="223" y="279.4" class="mono m" text-anchor="middle" font-size="15">3</text></g><text x="223" y="312" class="a" text-anchor="middle" font-size="13">no event</text><g class="chw"><rect x="252" y="256" width="46" height="36" rx="5"/><text x="275" y="279.4" class="mono" text-anchor="middle" font-size="15">4</text></g><g class="chw"><rect x="304" y="256" width="46" height="36" rx="5"/><text x="327" y="279.4" class="mono" text-anchor="middle" font-size="15">5</text></g><g class="chw"><rect x="356" y="256" width="46" height="36" rx="5"/><text x="379" y="279.4" class="mono" text-anchor="middle" font-size="15">6</text></g><g class="chw"><rect x="408" y="256" width="46" height="36" rx="5"/><text x="431" y="279.4" class="mono" text-anchor="middle" font-size="15">7</text></g><text x="20" y="372" class="ok" font-size="15">the hole is labelled, not hidden</text><g class="rough"><g transform="translate(404 318) scale(0.5)"><g transform="translate(0 -2)"><path class="cf" d="M20 52C19 38 24 29 31 24L27 6Q27 3 30 5L47 17Q50 16.5 53 17L70 5Q73 3 73 6L69 24C76 29 81 38 80 52C80 72 67 86 50 86C33 86 20 72 20 52Z"/><path class="ce" d="M32 21L30.5 11L41 18ZM68 21L69.5 11L59 18Z"/><path class="cw" d="M29 66C31 57 42 55 50 60C58 55 69 57 71 66C71 77 61 84 50 84C39 84 29 77 29 66Z"/><path class="cn" d="M45.5 60.5h9l-4.5 5z"/><path class="wh" d="M31 68L6 63M31 73L7 76M69 68L94 63M69 73L93 76"/><path class="hap" d="M31 47Q38 39 45 47M55 47Q62 39 69 47"/><path class="mo" d="M42 70Q50 79 58 70"/></g></g></g></g></svg></div>

Two effects stack. Group commit lets one `fsync` cover many writers on the same log. With one log, all 64 publishers feed one commit stream. With twelve, each log sees about a twelfth of that, fan-in drops toward 1, and the flush count doubles. And each flush got 1.78 times slower, because twelve interleaved append streams on one filesystem share a journal where one sequential stream had it to itself.

The useful part is the inference. The device did 3.7 times the flush work and throughput barely moved, so the flush path wasn't what was holding it. That also explains why `io_uring`, a flush-path change, was worth about 4% here.

Sharding is a horizontal lever. It spreads a stream's work across brokers, each with its own NIC, cores and disks. Twelve shards on one broker share all of those, so there's nothing to gain and a little to lose. Our docs called sharding a performance lever without saying which kind. [#552](https://github.com/GetFelix/felix/issues/552) recorded the measurements and changed that wording.

## Two brokers

The cheapest test of "horizontal" was to add a broker. Two brokers, same four generators, the same keyed 12-shard load with shards split between them: 1,896.0 MB/s, and 1,852.4 on a repeat. That's 2.1 times one broker. Per-generator throughput went from about 220 to about 470 MB/s, which is the third separate sign the generators were never the limit. Each broker still showed the same "ceiling with CPU to spare" pattern on its own.

So throughput scaled with brokers and not with shards.

To see what one broker was doing, we needed something that could separate one busy task from spread-out work. Per-thread CPU couldn't: eight runtime workers within 0.6% of each other, the work-stealing signature again. A sampled profile with call stacks could. The QUIC endpoint's receive path, from `poll_recv` down to `recvmmsg`, was 22.26% of the process's CPU. The process was using 3.96 cores, so that's 0.88 of a core, on a task that runs on one core at a time.

{{FIG4}}

Every knob we had turned sits after that point. Shards, workers, admission budgets, connection count and flush mechanism all act on packets that one task has already read off the socket. Felix can bind several listener ports per broker (`FELIX_QUIC_LISTENERS`), each with its own socket and endpoint, so that reading is no longer one task's job.

### Two ways the profile could have fooled us

The function that polls the socket resolved as a symbol in only 1.77% of samples. Read alone, that kills the idea, and for a moment we said so. The build had no frame pointers, so most stacks above the syscall came back as `[unknown]`. `recvmmsg` is called from exactly one place in the broker, which makes it the reliable proxy. The two numbers differ in symbol coverage, not in CPU.

Then we tried to isolate the endpoint on a dedicated I/O thread with `FELIX_IO_RUNTIME_THREADS=2`. That thread read 99.9% of one core, which looked like proof. It wasn't. That setting moves every QUIC task onto the I/O runtime, so all 256 connection drivers and their decryption landed on the same thread, and throughput dropped 29% (1,341 against 1,896). A thread doing routing plus all connection crypto saturates. That says nothing about the routing alone.

A later attempt to sweep listener counts on a single Mac was flat across 1, 2, 4 and 8 listeners, and taught us one more instrument lesson. The broker was using about 2.5 of 16 cores, nowhere near the regime above. The real limit was the test's own client side: all its client endpoints shared one I/O thread, measured at 99.7%. And with publishes that request no acks, the client's "sent" counter read about 770 MiB/s while the broker's own append counter read about 543 over the same window. The client was counting what it had queued. Only the broker-side number was real.

## One more misread number

Another session had once recorded two load generators producing 1.63 GB/s, which seemed to contradict a 900 MB/s ceiling. We first explained it as a two-broker session at about 815 per broker. That was wrong twice. That rig had three brokers, not two, and the two generators were different VM sizes, contributing 1,084 and 549 MB/s, so there was no meaningful per-generator average to quote either. The figure didn't contradict anything. We had to read it correctly first.

## How to tell your benchmark is lying

Here's the list we use now. Every item on it is here because we got it wrong at least once.

**Print the configuration the run actually used.** Read it back from the binary, not from your script. The round-robin rerun only counted once the generator said `sharding=RoundRobin`.

**Measure the load generators too.** If you only sample the system under test, a saturated client looks like a server ceiling.

**Count at the receiver.** With unacked publishes, a client counter is an enqueue rate. The broker's stored bytes are the measurement.

**Check that the experiment can reach the thing it claims to test.** A stream with twelve shards and no keys exercises one shard. Look at the per-shard counters, not the stream's configuration.

**Have a control that should change the number.** When nothing moves the result, the system may be bound somewhere else, or the knob may not be connected. Two brokers moved the number 2.1 times. That told us the harness could see a change.

**One run is not a measurement.** "5.6% slower" and "+6.5%" both came from single runs and both shrank or disappeared on repeats. Two identical runs here were 3% apart, so any difference smaller than that needs more runs, not a headline.

**Distrust the number that agrees with you.** The 17× flush claim and the 99.9% thread both looked like confirmation. Both compared things that weren't the same.

**Know what your sampler can't see.** Per-core and per-thread CPU can't find one busy task on a work-stealing runtime. A profile without frame pointers undercounts the functions you care about.

**Verify deployments by checksum.** During this session, one generator's install script reported success while `curl` had failed on a stale path. The VM was still running the old binary. Exit codes didn't catch it. Checksums did.

**Don't run the binary on a live host to check a flag.** `felix-broker --help` starts a second broker. It contaminated a run once, and nearly did again.

## Trying it

`felix-loadgen` takes `--keys <n>` to spread records across shards, and reads the client's `FELIX_PUB_*` variables from the environment. `FELIX_STORAGE_IO_URING=1` turns on ring flushes on Linux; the [durable storage docs](https://github.com/GetFelix/felix/blob/main/docs/durable-storage.md) describe it with the other storage settings. The full working log, with every run and every retraction, is in [`docs/perf-investigation-sharding-ceiling.md`](https://github.com/GetFelix/felix/blob/main/docs/perf-investigation-sharding-ceiling.md).

To run Felix itself, the [Docker Compose guide](https://docs.getfelix.dev/deployment/docker-compose/) starts a control plane and a broker with `docker compose up -d` (or `podman compose`).

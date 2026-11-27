+++
title = "A ceiling that wouldn't move, and a benchmark that lied about it"
description = "One Felix broker plateaued near 900 MB/s whatever we changed. Three bugs in the load generator made two hypotheses look tested when they weren't. Here is what we found, what shipped, and how we check an instrument now."
date = 2026-11-27
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

<figure class="fig ck">
      <div class="stage glow"><svg class="ck-svg " viewBox="0 0 480 344" role="img" aria-labelledby="ck1-t"><title id="ck1-t">The Felix cat stands over a row of twelve bowls labelled shards 0 to 11. Only bowl 0 holds food; the other eleven are empty. A sticky note says no routing key goes to shard 0. Two badges below read 12 shards: 920 MB/s and 1 shard: 923 MB/s.</title><g font-size="18.5"><g class="rough"><rect class="note" x="252" y="14" width="214" height="70" rx="6" transform="rotate(2 359 49)"/></g><g transform="rotate(2 359 49)"><text x="359" y="44" class="hand" text-anchor="middle" font-size="22">no routing key</text><text x="359" y="72" class="hand a" text-anchor="middle" font-size="22">goes to shard 0</text></g><text x="20" y="44" class="cap" font-size="18.5">12-shard stream</text><g class="rough"><g transform="translate(6 82) scale(0.62)"><path class="tl-e" d="M84 178C114 176 122 146 108 128C99 116 104 102 114 102"/><path class="tl" d="M84 178C114 176 122 146 108 128C99 116 104 102 114 102"/><path class="cf" d="M30 80C14 108 11 160 20 188L86 188C96 160 94 110 72 80Z"/><path class="cw" d="M38 90C33 120 37 150 50 168C63 150 67 120 62 90C56 97 44 97 38 90Z"/><ellipse class="cf" cx="38" cy="187" rx="12" ry="6"/><ellipse class="cf" cx="64" cy="187" rx="12" ry="6"/><g transform="translate(0 -2)"><path class="cf" d="M20 52C19 38 24 29 31 24L27 6Q27 3 30 5L47 17Q50 16.5 53 17L70 5Q73 3 73 6L69 24C76 29 81 38 80 52C80 72 67 86 50 86C33 86 20 72 20 52Z"/><path class="ce" d="M32 21L30.5 11L41 18ZM68 21L69.5 11L59 18Z"/><path class="cw" d="M29 66C31 57 42 55 50 60C58 55 69 57 71 66C71 77 61 84 50 84C39 84 29 77 29 66Z"/><path class="cn" d="M45.5 60.5h9l-4.5 5z"/><path class="wh" d="M31 68L6 63M31 73L7 76M69 68L94 63M69 73L93 76"/><path class="hap" d="M31 47Q38 39 45 47M55 47Q62 39 69 47"/><path class="mo" d="M42 70Q50 79 58 70"/></g></g></g><g class="rough"><path class="metal" d="M96 236h26l-4 16h-18z"/></g><ellipse cx="109" cy="234" rx="13" ry="4" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2"/><ellipse cx="109" cy="227" rx="13" ry="4" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2"/><ellipse cx="109" cy="220" rx="13" ry="4" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2"/><g class="rough"><path class="metal" d="M127 236h26l-4 16h-18z"/></g><ellipse cx="140" cy="236" rx="13" ry="3" fill="none" stroke="var(--faint)" stroke-width="1.6"/><g class="rough"><path class="metal" d="M158 236h26l-4 16h-18z"/></g><ellipse cx="171" cy="236" rx="13" ry="3" fill="none" stroke="var(--faint)" stroke-width="1.6"/><g class="rough"><path class="metal" d="M189 236h26l-4 16h-18z"/></g><ellipse cx="202" cy="236" rx="13" ry="3" fill="none" stroke="var(--faint)" stroke-width="1.6"/><g class="rough"><path class="metal" d="M220 236h26l-4 16h-18z"/></g><ellipse cx="233" cy="236" rx="13" ry="3" fill="none" stroke="var(--faint)" stroke-width="1.6"/><g class="rough"><path class="metal" d="M251 236h26l-4 16h-18z"/></g><ellipse cx="264" cy="236" rx="13" ry="3" fill="none" stroke="var(--faint)" stroke-width="1.6"/><g class="rough"><path class="metal" d="M282 236h26l-4 16h-18z"/></g><ellipse cx="295" cy="236" rx="13" ry="3" fill="none" stroke="var(--faint)" stroke-width="1.6"/><g class="rough"><path class="metal" d="M313 236h26l-4 16h-18z"/></g><ellipse cx="326" cy="236" rx="13" ry="3" fill="none" stroke="var(--faint)" stroke-width="1.6"/><g class="rough"><path class="metal" d="M344 236h26l-4 16h-18z"/></g><ellipse cx="357" cy="236" rx="13" ry="3" fill="none" stroke="var(--faint)" stroke-width="1.6"/><g class="rough"><path class="metal" d="M375 236h26l-4 16h-18z"/></g><ellipse cx="388" cy="236" rx="13" ry="3" fill="none" stroke="var(--faint)" stroke-width="1.6"/><g class="rough"><path class="metal" d="M406 236h26l-4 16h-18z"/></g><ellipse cx="419" cy="236" rx="13" ry="3" fill="none" stroke="var(--faint)" stroke-width="1.6"/><g class="rough"><path class="metal" d="M437 236h26l-4 16h-18z"/></g><ellipse cx="450" cy="236" rx="13" ry="3" fill="none" stroke="var(--faint)" stroke-width="1.6"/><text x="109" y="276" class="mono a" text-anchor="middle" font-size="18.5">0</text><text x="450" y="276" class="mono m" text-anchor="middle" font-size="18.5">11</text><text x="282" y="276" class="m" text-anchor="middle" font-size="18.5">shards 1 to 11: empty</text><path class="lna" d="M109 150V196M101 186l8 10 8-10"/><text x="120" y="140" class="a" text-anchor="start" font-size="18.5">every batch</text><path class="ground" d="M6 254H474"/><g class="okp"><rect x="30" y="296" width="196" height="34" rx="17"/><text x="128.0" y="319.66" text-anchor="middle" font-size="18.5">12 shards: 920 MB/s</text></g><g class="okp"><rect x="254" y="296" width="196" height="34" rx="17"/><text x="352.0" y="319.66" text-anchor="middle" font-size="18.5">1 shard: 923 MB/s</text></g></g></svg></div>
      <figcaption><b>Figure 1</b>The generator never sent a key, so a twelve-shard stream was one log with eleven empty neighbours.</figcaption>
    </figure>

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

<figure class="fig ck">
      <div class="stage"><svg class="ck-svg " viewBox="0 0 480 344" role="img" aria-labelledby="ck2-t"><title id="ck2-t">The Felix cat turns two dials on a panel that reads FELIX_PUB_CONN_POOL=16 and FELIX_PUB_SHARDING=rr. The panel cable ends in a plug that dangles, unplugged, above the load generator, which reads pool 4, hash_stream. A badge says runs E and F: void.</title><g font-size="18.5"><g class="rough"><rect class="paper" x="118" y="14" width="352" height="128" rx="8"/></g><text x="134" y="42" class="cap" font-size="18.5">what we set</text><text x="134" y="76" class="mono" font-size="18.5">FELIX_PUB_CONN_POOL=16</text><text x="134" y="110" class="mono" font-size="18.5">FELIX_PUB_SHARDING=rr</text><g class="rough"><circle class="box" cx="440" cy="70" r="12"/></g><path class="lnb" d="M440 70l7 -7"/><g class="rough"><circle class="box" cx="440" cy="104" r="12"/></g><path class="lnb" d="M440 104l7 -7"/><path class="lna" d="M300 142C300 170 268 176 262 196"/><g class="rough"><rect class="metal" x="250" y="194" width="24" height="18" rx="3"/></g><path class="ln" d="M256 212v8M268 212v8"/><text x="222" y="236" class="hand bad" text-anchor="middle" font-size="22">unplugged</text><g class="rough"><rect class="metal" x="298" y="232" width="172" height="96" rx="8"/></g><g class="rough"><rect class="box" x="372" y="222" width="24" height="14" rx="3"/></g><text x="384" y="266" class="cap" text-anchor="middle" font-size="18.5">what ran</text><text x="384" y="296" class="mono" text-anchor="middle" font-size="18.5">pool 4</text><text x="384" y="320" class="mono" text-anchor="middle" font-size="18.5">hash_stream</text><g class="rough"><g transform="translate(2 140) scale(0.6)"><path class="tl-e" d="M84 178C114 176 122 146 108 128C99 116 104 102 114 102"/><path class="tl" d="M84 178C114 176 122 146 108 128C99 116 104 102 114 102"/><path class="cf" d="M30 80C14 108 11 160 20 188L86 188C96 160 94 110 72 80Z"/><path class="cw" d="M38 90C33 120 37 150 50 168C63 150 67 120 62 90C56 97 44 97 38 90Z"/><ellipse class="cf" cx="38" cy="187" rx="12" ry="6"/><ellipse class="cf" cx="64" cy="187" rx="12" ry="6"/><path class="tl-e" d="M70 104C88 104 100 96 108 80" style="stroke-width:16"/><path class="tl" d="M70 104C88 104 100 96 108 80" style="stroke-width:11"/><circle class="cf" cx="109" cy="77" r="8"/><g transform="translate(0 -2)"><path class="cf" d="M20 52C19 38 24 29 31 24L27 6Q27 3 30 5L47 17Q50 16.5 53 17L70 5Q73 3 73 6L69 24C76 29 81 38 80 52C80 72 67 86 50 86C33 86 20 72 20 52Z"/><path class="ce" d="M32 21L30.5 11L41 18ZM68 21L69.5 11L59 18Z"/><path class="cw" d="M29 66C31 57 42 55 50 60C58 55 69 57 71 66C71 77 61 84 50 84C39 84 29 77 29 66Z"/><path class="cn" d="M45.5 60.5h9l-4.5 5z"/><path class="wh" d="M31 68L6 63M31 73L7 76M69 68L94 63M69 73L93 76"/><path class="hap" d="M31 47Q38 39 45 47M55 47Q62 39 69 47"/><path class="mo" d="M42 70Q50 79 58 70"/></g></g></g><g class="badp"><rect x="18" y="296" width="196" height="34" rx="17"/><text x="116.0" y="319.66" text-anchor="middle" font-size="18.5">runs E and F: void</text></g></g></svg></div>
      <figcaption><b>Figure 2</b>The settings looked applied. The generator never read them, so every run that used them measured the defaults.</figcaption>
    </figure>

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

<figure class="fig ck">
      <div class="stage"><svg class="ck-svg " viewBox="0 0 480 366" role="img" aria-labelledby="ck3-t"><title id="ck3-t">Two panels moving the same bytes. One log: a single filing cabinet and a calm cat, 153,589 flushes at 0.575 ms each, fan-in 1.875, 88.6 s of flush time. Twelve logs: a grid of twelve small cabinets, 325,016 flushes at 1.021 ms each, fan-in 1.124, 331.9 s of flush time. A badge below says throughput: about the same.</title><g font-size="18.5"><rect class="panel" x="4" y="4" width="232" height="300" rx="10"/><rect class="panel-bad" x="244" y="4" width="232" height="300" rx="10"/><text x="20" y="34" class="cap" font-size="18.5">ONE LOG</text><text x="260" y="34" class="cap" font-size="18.5">TWELVE LOGS</text><g class="rough"><rect class="metal" x="40" y="56" width="68" height="96" rx="6"/></g><g class="rough"><rect class="box" x="50" y="70" width="48" height="18" rx="3"/></g><g class="rough"><rect class="box" x="50" y="96" width="48" height="18" rx="3"/></g><g class="rough"><rect class="box" x="50" y="122" width="48" height="18" rx="3"/></g><g class="rough"><g transform="translate(136 70) scale(0.62)"><g transform="translate(0 -2)"><path class="cf" d="M20 52C19 38 24 29 31 24L27 6Q27 3 30 5L47 17Q50 16.5 53 17L70 5Q73 3 73 6L69 24C76 29 81 38 80 52C80 72 67 86 50 86C33 86 20 72 20 52Z"/><path class="ce" d="M32 21L30.5 11L41 18ZM68 21L69.5 11L59 18Z"/><path class="cw" d="M29 66C31 57 42 55 50 60C58 55 69 57 71 66C71 77 61 84 50 84C39 84 29 77 29 66Z"/><path class="cn" d="M45.5 60.5h9l-4.5 5z"/><path class="wh" d="M31 68L6 63M31 73L7 76M69 68L94 63M69 73L93 76"/><path class="hap" d="M31 47Q38 39 45 47M55 47Q62 39 69 47"/><path class="mo" d="M42 70Q50 79 58 70"/></g></g></g><g class="rough"><rect class="metal" x="266" y="56" width="38" height="26" rx="4"/></g><g class="rough"><rect class="metal" x="316" y="56" width="38" height="26" rx="4"/></g><g class="rough"><rect class="metal" x="366" y="56" width="38" height="26" rx="4"/></g><g class="rough"><rect class="metal" x="416" y="56" width="38" height="26" rx="4"/></g><g class="rough"><rect class="metal" x="266" y="90" width="38" height="26" rx="4"/></g><g class="rough"><rect class="metal" x="316" y="90" width="38" height="26" rx="4"/></g><g class="rough"><rect class="metal" x="366" y="90" width="38" height="26" rx="4"/></g><g class="rough"><rect class="metal" x="416" y="90" width="38" height="26" rx="4"/></g><g class="rough"><rect class="metal" x="266" y="124" width="38" height="26" rx="4"/></g><g class="rough"><rect class="metal" x="316" y="124" width="38" height="26" rx="4"/></g><g class="rough"><rect class="metal" x="366" y="124" width="38" height="26" rx="4"/></g><g class="rough"><rect class="metal" x="416" y="124" width="38" height="26" rx="4"/></g><text x="120" y="196" text-anchor="middle" font-size="18.5">153,589 flushes</text><text x="120" y="226" class="m" text-anchor="middle" font-size="18.5">0.575 ms each</text><text x="120" y="256" class="m" text-anchor="middle" font-size="18.5">fan-in 1.875</text><text x="120" y="288" class="a" text-anchor="middle" font-size="18.5">88.6 s total</text><text x="360" y="196" text-anchor="middle" font-size="18.5">325,016 flushes</text><text x="360" y="226" class="m" text-anchor="middle" font-size="18.5">1.021 ms each</text><text x="360" y="256" class="m" text-anchor="middle" font-size="18.5">fan-in 1.124</text><text x="360" y="288" class="bad" text-anchor="middle" font-size="18.5">331.9 s total</text><g class="okp"><rect x="80" y="320" width="320" height="34" rx="17"/><text x="240.0" y="343.66" text-anchor="middle" font-size="18.5">throughput: about the same</text></g></g></svg></div>
      <figcaption><b>Figure 3</b>Twelve logs made the device do 3.7 times the flush work, and the throughput number did not notice.</figcaption>
    </figure>

Two effects stack. Group commit lets one `fsync` cover many writers on the same log. With one log, all 64 publishers feed one commit stream. With twelve, each log sees about a twelfth of that, fan-in drops toward 1, and the flush count doubles. And each flush got 1.78 times slower, because twelve interleaved append streams on one filesystem share a journal where one sequential stream had it to itself.

The useful part is the inference. The device did 3.7 times the flush work and throughput barely moved, so the flush path wasn't what was holding it. That also explains why `io_uring`, a flush-path change, was worth about 4% here.

Sharding is a horizontal lever. It spreads a stream's work across brokers, each with its own NIC, cores and disks. Twelve shards on one broker share all of those, so there's nothing to gain and a little to lose. Our docs called sharding a performance lever without saying which kind. [#552](https://github.com/GetFelix/felix/issues/552) recorded the measurements and changed that wording.

## Two brokers

The cheapest test of "horizontal" was to add a broker. Two brokers, same four generators, the same keyed 12-shard load with shards split between them: 1,896.0 MB/s, and 1,852.4 on a repeat. That's 2.1 times one broker. Per-generator throughput went from about 220 to about 470 MB/s, which is the third separate sign the generators were never the limit. Each broker still showed the same "ceiling with CPU to spare" pattern on its own.

So throughput scaled with brokers and not with shards.

To see what one broker was doing, we needed something that could separate one busy task from spread-out work. Per-thread CPU couldn't: eight runtime workers within 0.6% of each other, the work-stealing signature again. A sampled profile with call stacks could. The QUIC endpoint's receive path, from `poll_recv` down to `recvmmsg`, was 22.26% of the process's CPU. The process was using 3.96 cores, so that's 0.88 of a core, on a task that runs on one core at a time.

<figure class="fig ck">
      <div class="stage"><svg class="ck-svg " viewBox="0 0 480 334" role="img" aria-labelledby="ck4-t"><title id="ck4-t">Rows of connection chips on the left funnel into a single narrow door labelled recvmmsg, where a worried cat sits: one task, 0.88 of a core. To the right, eight core boxes are each about half full, labelled about half idle. A note says workers, shards and budgets are all after the door.</title><g font-size="18.5"><text x="20" y="34" class="cap" font-size="18.5">256 CONNECTIONS</text><g class="chw"><rect x="16" y="70" width="30" height="24" rx="4"/></g><g class="chw"><rect x="56" y="70" width="30" height="24" rx="4"/></g><g class="chw"><rect x="96" y="70" width="30" height="24" rx="4"/></g><path class="lnm" d="M150 82L206 150" style="stroke-width:1.6"/><g class="chw"><rect x="30" y="106" width="30" height="24" rx="4"/></g><g class="chw"><rect x="70" y="106" width="30" height="24" rx="4"/></g><g class="chw"><rect x="110" y="106" width="30" height="24" rx="4"/></g><path class="lnm" d="M164 118L206 150" style="stroke-width:1.6"/><g class="chw"><rect x="16" y="142" width="30" height="24" rx="4"/></g><g class="chw"><rect x="56" y="142" width="30" height="24" rx="4"/></g><g class="chw"><rect x="96" y="142" width="30" height="24" rx="4"/></g><path class="lnm" d="M150 154L206 150" style="stroke-width:1.6"/><g class="chw"><rect x="30" y="178" width="30" height="24" rx="4"/></g><g class="chw"><rect x="70" y="178" width="30" height="24" rx="4"/></g><g class="chw"><rect x="110" y="178" width="30" height="24" rx="4"/></g><path class="lnm" d="M164 190L206 150" style="stroke-width:1.6"/><g class="chw"><rect x="16" y="214" width="30" height="24" rx="4"/></g><g class="chw"><rect x="56" y="214" width="30" height="24" rx="4"/></g><g class="chw"><rect x="96" y="214" width="30" height="24" rx="4"/></g><path class="lnm" d="M150 226L206 150" style="stroke-width:1.6"/><g class="rough"><rect class="metal" x="206" y="96" width="62" height="112" rx="4"/></g><g class="rough"><g transform="translate(212 104) scale(0.5)"><g transform="translate(0 -2)"><path class="cf" d="M20 52C19 38 24 29 31 24L27 6Q27 3 30 5L47 17Q50 16.5 53 17L70 5Q73 3 73 6L69 24C76 29 81 38 80 52C80 72 67 86 50 86C33 86 20 72 20 52Z"/><path class="ce" d="M32 21L30.5 11L41 18ZM68 21L69.5 11L59 18Z"/><path class="cw" d="M29 66C31 57 42 55 50 60C58 55 69 57 71 66C71 77 61 84 50 84C39 84 29 77 29 66Z"/><path class="cn" d="M45.5 60.5h9l-4.5 5z"/><path class="wh" d="M31 68L6 63M31 73L7 76M69 68L94 63M69 73L93 76"/><path class="cw" d="M30 45Q38 37 46 45Q38 50 30 45ZM54 45Q62 37 70 45Q62 50 54 45Z"/><circle class="cp" cx="40" cy="45" r="3.4"/><circle class="cp" cx="64" cy="45" r="3.4"/><path class="lid" d="M29 42Q38 37 47 43M53 43Q62 37 71 42"/><path class="mo" d="M43 75Q50 69 57 75"/></g></g></g><text x="237" y="236" class="a" text-anchor="middle" font-size="18.5">one task</text><text x="237" y="262" class="bad" text-anchor="middle" font-size="18.5">0.88 of a core</text><text x="237" y="82" class="mono" text-anchor="middle" font-size="18.5">recvmmsg</text><path class="lna" d="M272 152H300M292 144l8 8-8 8"/><text x="390" y="34" class="cap" text-anchor="middle" font-size="18.5">8 CORES</text><g class="rough"><rect class="box" x="312" y="70" width="30" height="72" rx="4"/></g><rect x="314" y="106" width="26" height="34" rx="3" fill="var(--accent-soft)"/><g class="rough"><rect class="box" x="352" y="70" width="30" height="72" rx="4"/></g><rect x="354" y="106" width="26" height="34" rx="3" fill="var(--accent-soft)"/><g class="rough"><rect class="box" x="392" y="70" width="30" height="72" rx="4"/></g><rect x="394" y="106" width="26" height="34" rx="3" fill="var(--accent-soft)"/><g class="rough"><rect class="box" x="432" y="70" width="30" height="72" rx="4"/></g><rect x="434" y="106" width="26" height="34" rx="3" fill="var(--accent-soft)"/><g class="rough"><rect class="box" x="312" y="160" width="30" height="72" rx="4"/></g><rect x="314" y="196" width="26" height="34" rx="3" fill="var(--accent-soft)"/><g class="rough"><rect class="box" x="352" y="160" width="30" height="72" rx="4"/></g><rect x="354" y="196" width="26" height="34" rx="3" fill="var(--accent-soft)"/><g class="rough"><rect class="box" x="392" y="160" width="30" height="72" rx="4"/></g><rect x="394" y="196" width="26" height="34" rx="3" fill="var(--accent-soft)"/><g class="rough"><rect class="box" x="432" y="160" width="30" height="72" rx="4"/></g><rect x="434" y="196" width="26" height="34" rx="3" fill="var(--accent-soft)"/><text x="388" y="262" class="ok" text-anchor="middle" font-size="18.5">about half idle</text><path class="ground" d="M6 280H474"/><text x="240" y="316" class="m" text-anchor="middle" font-size="18.5">workers, shards, budgets: all after the door</text></g></svg></div>
      <figcaption><b>Figure 4</b>Every knob we turned sat downstream of one task reading the socket.</figcaption>
    </figure>

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

**Don't run the binary on a live host to check a flag.** The broker took no `--help` flag then, so `felix-broker --help` started a second broker. It contaminated a run once, and nearly did again.

## Trying it

`felix-loadgen` takes `--keys <n>` to spread records across shards, and reads the client's `FELIX_PUB_*` variables from the environment. `FELIX_STORAGE_IO_URING=1` turns on ring flushes on Linux; the [durable storage docs](https://github.com/GetFelix/felix/blob/main/docs/durable-storage.md) describe it with the other storage settings. The full working log, with every run and every retraction, is in [`docs/perf-investigation-sharding-ceiling.md`](https://github.com/GetFelix/felix/blob/main/docs/perf-investigation-sharding-ceiling.md).

To run Felix itself, the [Docker Compose guide](https://docs.getfelix.dev/deployment/docker-compose/) starts a control plane and a broker with `docker compose up -d` (or `podman compose`).

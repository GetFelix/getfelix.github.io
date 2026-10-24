+++
title = "Before you loosen the timeout, run the old commit"
description = "Intermittent failures in Felix's cluster tests kept turning out to be real bugs in the broker, so before loosening a timeout I now run the test against a commit from before the suspect change; three cases show what that finds."
date = 2026-10-17
slug = "before-you-loosen-the-timeout"
path = "blog/before-you-loosen-the-timeout.html"
[taxonomies]
topics = ["testing", "replication"]
[extra]
read_minutes = 5
card = "cards/before-you-loosen-the-timeout.svg"
+++

Felix's cluster tests start real brokers and a real control plane, then publish, kill, freeze and move things. Now and then one fails once in CI and passes on re-run. The reflex is to call it a timing flake and raise the timeout.

<figure class="fig ck">
      <div class="stage glow"><svg class="ck-svg" viewBox="0 0 440 280" role="img" aria-labelledby="ck1-t"><title id="ck1-t">A test card with a FLAKY sticker being peeled off; underneath it is a bug saying told you.</title><g font-size="18"><g class="rough"><rect class="box" x="40" y="30" width="360" height="220" rx="10"/></g><text x="64" y="68" class="mono" font-size="16">cluster_test</text><path class="ln dash" d="M64 92H250M64 116H210M64 140H230"/><g class="chx"><rect x="64" y="190" width="70" height="30" rx="5"/><text x="99" y="211" text-anchor="middle" font-size="15">FAIL</text></g><g class="chw"><rect x="144" y="190" width="70" height="30" rx="5"/><text x="179" y="211" text-anchor="middle" font-size="15">PASS</text></g><g transform="translate(0 22)"><g class="rough"><ellipse class="mouse" cx="318" cy="190" rx="26" ry="20" style="fill:var(--bad)"/><circle class="cf" cx="318" cy="166" r="11"/><path class="ln" d="M318 172V208"/></g><circle class="dot" cx="313" cy="164" r="2.2"/><circle class="dot" cx="323" cy="164" r="2.2"/><path class="ln" d="M311 156C306 146 302 144 298 144M325 156C330 146 334 144 338 144M294 184L280 178M294 194L278 196M296 204L282 214M342 184L356 178M342 194L358 196M340 204L354 214"/></g><g class="rough"><path class="bubble" d="M262 70h120a10 10 0 0 1 10 10v28a10 10 0 0 1-10 10h-78l-14 14 0-14h-28a10 10 0 0 1-10-10v-28a10 10 0 0 1 10-10z" transform="translate(-6 36)"/></g><text x="322" y="144" class="hand" text-anchor="middle" font-size="24">told you</text><g transform="rotate(-10 150 90)"><g class="rough"><rect class="note" x="214" y="56" width="120" height="40" rx="4" style="fill:var(--paper)"/></g><text x="274" y="84" class="wn mono" text-anchor="middle" font-size="22" font-weight="700">FLAKY</text></g></g></svg></div>
      <figcaption><b>Figure 1</b>Almost every sticker that said flaky was covering a bug.</figcaption>
    </figure>

In Felix that reflex has been wrong almost every time. Each failure that looked like load on a slow runner pointed at a defect in the broker. I now have one rule: before I loosen a bound, I run the test against a commit from before the change I suspect, and compare.

## A publish refused for a leader that never left

The first case was `a_quorum_publish_during_a_copy_is_not_held_by_it`. It failed in CI with "shard leadership moved before the batch could reach a quorum". Leadership had not moved. The broker log showed the owner opening the shard at a new generation 20 ms before the failure, still as leader.

Here is the part of Felix involved. When a shard is moved to another broker, the destination is staged first, and staging starts a new generation under the same leader. A quorum mark, the record of how far a majority of replicas hold the log, belongs to one generation. The leader has no mark for the new generation until its first replication pass reports in.

The wait for a quorum read "no mark at this generation" as "I am not the leader" and refused at once. Any `Quorum` publish landing in that gap was rejected, and so was one already waiting when the old mark was replaced.

<figure class="fig ck">
      <div class="stage glow"><svg class="ck-svg" viewBox="0 0 440 280" role="img" aria-labelledby="ck2-t"><title id="ck2-t">The Felix cat runs from the generation 0 lane into the generation 1 lane while a referee verdict reads NotLeading because there is no mark yet.</title><g font-size="18"><path class="lane" d="M16 90H170C206 90 206 170 242 170H424"/><text x="16" y="72" class="cap" font-size="13">GENERATION 0</text><text x="424" y="214" class="cap" text-anchor="end" font-size="13">GENERATION 1</text><g class="chw"><rect x="60" y="94" width="86" height="30" rx="5"/><text x="103" y="115" text-anchor="middle" font-size="15">mark</text></g><g class="rough"><g transform="translate(226 24) scale(0.78)"><path class="tl-e" d="M84 178C114 176 122 146 108 128C99 116 104 102 114 102"/><path class="tl" d="M84 178C114 176 122 146 108 128C99 116 104 102 114 102"/><path class="cf" d="M30 80C14 108 11 160 20 188L86 188C96 160 94 110 72 80Z"/><path class="cw" d="M38 90C33 120 37 150 50 168C63 150 67 120 62 90C56 97 44 97 38 90Z"/><ellipse class="cf" cx="38" cy="187" rx="12" ry="6"/><ellipse class="cf" cx="64" cy="187" rx="12" ry="6"/><path class="tl-e" d="M70 104C88 104 100 96 108 80" style="stroke-width:16"/><path class="tl" d="M70 104C88 104 100 96 108 80" style="stroke-width:11"/><circle class="cf" cx="109" cy="77" r="8"/><g transform="translate(0 -2) scale(1)"><path class="cf" d="M20 52C19 38 24 29 31 24L27 6Q27 3 30 5L47 17Q50 16.5 53 17L70 5Q73 3 73 6L69 24C76 29 81 38 80 52C80 72 67 86 50 86C33 86 20 72 20 52Z"/><path class="ce" d="M32 21L30.5 11L41 18ZM68 21L69.5 11L59 18Z"/><path class="cw" d="M29 66C31 57 42 55 50 60C58 55 69 57 71 66C71 77 61 84 50 84C39 84 29 77 29 66Z"/><path class="cn" d="M45.5 60.5h9l-4.5 5z"/><path class="wh" d="M31 68L6 63M31 73L7 76M69 68L94 63M69 73L93 76"/><path class="hap" d="M31 47Q38 39 45 47M55 47Q62 39 69 47"/><path class="mo" d="M42 70Q50 79 58 70"/></g></g></g><g class="chg"><rect x="330" y="124" width="94" height="30" rx="5"/><text x="377" y="144" text-anchor="middle" font-size="13">no mark yet</text></g><g class="chx"><rect x="150" y="226" width="170" height="38" rx="6"/><text x="235" y="251" text-anchor="middle" font-size="16" class="mono">NotLeading</text></g><path class="lnb dash" d="M270 176C272 196 262 212 250 224"/></g></svg></div>
      <figcaption><b>Figure 2</b>Same runner. New lane. The referee read an empty hand as a quitter.</figcaption>
    </figure>

The fix is `MarkTable::wait_while_leading`. It follows the generation this broker leads. If there is no mark yet, it waits for one, and it re-checks every 50 ms that the broker still leads the shard. Only losing leadership ends the wait with `NotLeading` ([#796](https://github.com/GetFelix/felix/issues/796)).

The test only failed under heavy CPU starvation. With 16 busy processes on 16 cores, 26 of 30 runs failed that way on main and none did with the fix. With 8 busy processes, 20 of 20 passed either way. A bound that was loose enough for 8 processes would have hidden a real refusal that production could hit on a bad day.

## Healthy subscribers dropping events

The second was a demo test that checks that a stalled consumer only loses its own events. Healthy subscribers lost between 0.15% and 1.0% of theirs, against a bound of 0.1%. It looked like a tight bound on a loaded machine.

Felix gives every subscriber a bounded queue, and with the default `drop_new` policy a full queue drops new events instead of slowing the publisher. That isolation is the point of the design. So a healthy subscriber losing events means something is filling its queue faster than it can read.

This was the A/B habit in full. I ran the test interleaved, A then B then A then B, on one machine with its load running:

<div class="table-wrap">
      <table>
        <thead>
          <tr><th scope="col">Build</th><th scope="col">Runs</th><th scope="col">Runs where a healthy subscriber lost events</th></tr>
        </thead>
        <tbody>
          <tr><td>main</td><td class="num">105</td><td class="num">25</td></tr>
          <tr><td>the commit before the publish scheduler landed</td><td class="num">50</td><td class="num">0</td></tr>
          <tr><td>main with one publish worker per connection</td><td class="num">25</td><td class="num">0</td></tr>
        </tbody>
      </table>
    </div>

<figure class="fig ck">
      <div class="stage glow"><svg class="ck-svg" viewBox="0 0 440 280" role="img" aria-labelledby="ck3-t"><title id="ck3-t">The Felix cat points at two test tubes, main and before the change, heated by one flame; only the main tube bubbles red.</title><g font-size="18"><g class="rough"><g transform="translate(24 60) scale(0.8)"><path class="tl-e" d="M84 178C114 176 122 146 108 128C99 116 104 102 114 102"/><path class="tl" d="M84 178C114 176 122 146 108 128C99 116 104 102 114 102"/><path class="cf" d="M30 80C14 108 11 160 20 188L86 188C96 160 94 110 72 80Z"/><path class="cw" d="M38 90C33 120 37 150 50 168C63 150 67 120 62 90C56 97 44 97 38 90Z"/><ellipse class="cf" cx="38" cy="187" rx="12" ry="6"/><ellipse class="cf" cx="64" cy="187" rx="12" ry="6"/><path class="tl-e" d="M70 104C88 104 100 96 108 80" style="stroke-width:16"/><path class="tl" d="M70 104C88 104 100 96 108 80" style="stroke-width:11"/><circle class="cf" cx="109" cy="77" r="8"/><g transform="translate(0 -2) scale(1)"><path class="cf" d="M20 52C19 38 24 29 31 24L27 6Q27 3 30 5L47 17Q50 16.5 53 17L70 5Q73 3 73 6L69 24C76 29 81 38 80 52C80 72 67 86 50 86C33 86 20 72 20 52Z"/><path class="ce" d="M32 21L30.5 11L41 18ZM68 21L69.5 11L59 18Z"/><path class="cw" d="M29 66C31 57 42 55 50 60C58 55 69 57 71 66C71 77 61 84 50 84C39 84 29 77 29 66Z"/><path class="cn" d="M45.5 60.5h9l-4.5 5z"/><path class="wh" d="M31 68L6 63M31 73L7 76M69 68L94 63M69 73L93 76"/><path class="hap" d="M31 47Q38 39 45 47M55 47Q62 39 69 47"/><path class="mo" d="M42 70Q50 79 58 70"/></g></g></g><g class="rough"><path class="bubble" d="M20 14h120a10 10 0 0 1 10 10v26a10 10 0 0 1-10 10h-72l-14 12 2-12h-36a10 10 0 0 1-10-10v-26a10 10 0 0 1 10-10z"/></g><text x="85" y="45" class="hand" text-anchor="middle" font-size="22">same load</text><text x="236" y="64" text-anchor="middle" font-size="15">main</text><text x="354" y="64" text-anchor="middle" font-size="15">before the change</text><g class="rough"><rect class="panel-bad" x="218" y="150" width="36" height="52" opacity="0.9"/><path class="metal" d="M218 80V202a18 18 0 0 0 36 0V80" style="fill:none"/><rect class="panel-ok" x="336" y="150" width="36" height="52"/><path class="metal" d="M336 80V202a18 18 0 0 0 36 0V80" style="fill:none"/></g><circle class="ledok" cx="354" cy="176" r="0" /><g style="fill:var(--bad)"><circle cx="230" cy="186" r="4"/><circle cx="242" cy="170" r="3"/><circle cx="232" cy="156" r="3"/><circle cx="244" cy="130" r="4"/><circle cx="236" cy="108" r="3"/></g><g style="fill:var(--warn)"><path d="M236 240C226 252 228 262 236 264C244 262 246 252 236 240Z"/><path d="M354 240C344 252 346 262 354 264C362 262 364 252 354 240Z"/></g><rect class="metal" x="190" y="232" width="210" height="8" rx="3"/><text x="295" y="276" class="cap" text-anchor="middle" font-size="12">SAME FLAME</text></g></svg></div>
      <figcaption><b>Figure 3</b>Same flame. Only one tube changed.</figcaption>
    </figure>

The old commit never lost an event, and the knob that restores the old queue depth removed the drops on main. That pointed at the scheduler, and the broker counter `felix_sub_queue_dropped_total` showed drops on healthy subscribers.

The cause was an executor loop. With a backlog queued, a publish executor takes the next job and fans it out to subscribers without ever suspending. The feeders it had just woken could not run until it stopped, so their queues overflowed even though they read fast enough. The fix is one line, a `yield_now()` after every job. A single-threaded test queues 32 publishes behind a subscriber queue of 4 and checks that the subscriber receives all 32. With the line commented out it received 4 ([#802](https://github.com/GetFelix/felix/issues/802)).

## A lease that was checked too late

The third is a test of a frozen leader. The test slows a broker's clock to 1/100, freezes the process with SIGSTOP for about a second, resumes it, and expects the broker still believes it holds its lease. Once, it didn't: the broker logged `lease expired` 50 ms after resuming.

The guess in the issue was that the freeze outlasted the lease on the wall clock, a slow-runner story. The logs said otherwise. At 1/100 speed, a 1.2 s freeze is 12 ms on the broker's clock, so the lease could only have expired if the broker had not yet read the slowdown when it froze.

The clock-fault file is only re-read when the process reads the clock. The harness waits 250 ms and assumes the lease refresh loop reads the clock about that often. It did not. That loop picked its period once at startup, from a placeholder 10 s lease: 470 ms. The real 1 s lease, adopted on the first heartbeat, never changed it. So an idle leader could go more than 250 ms without a clock read.

Safety was never at risk, because the commit-time check reads the clock directly. But the cached admission flag, the `felix_broker_lease_held` gauge and the notification that ends a deposed leader's readers could be 470 ms late instead of 47 ms. The refresh loop now recomputes its period from the current lease on every pass ([#1088](https://github.com/GetFelix/felix/issues/1088)).

## One that really was the test

Not every failure is a product bug. A consumer group test polled right after three acknowledged publishes and got only the first record. A poll that returned nothing or part of the data looked like a visibility race.

It reproduced in 229 of 300 runs with six copies in parallel. The broker in that test acknowledges a `Leader` publish once it is queued, before the write, and `docs/semantics.md` already said so. Nothing in the group path was wrong. The test now asks for commit acknowledgements, and the docs say plainly that an enqueue ack does not make a record readable ([#1038](https://github.com/GetFelix/felix/issues/1038)).

I count that one in favour of the habit. I did not loosen anything, and I could say why the test was wrong.

## What it costs

Running the old commit costs time. A cluster test is slow, and an A/B means building two binaries and running each many times.

It also needs a reproduction. Where a failure only appears under load, I load the machine until it fails often, as with the 16 busy processes above, then compare. A failure I can make happen 26 times in 30 is one I can fix.

## What I learned

A timing flake and a real bug look the same from the outside: one red run, a green re-run. The difference shows up when you compare against an older commit. A real bug is usually a change in behaviour, and the old commit has the old behaviour.

A loosened bound doesn't just hide that. It teaches the test that the new behaviour is fine. Both the quorum refusal and the starved subscribers would be gone from the tests and still in the broker.

## Trying it

`docker compose up` from the repo root starts a broker and a control plane. The cluster harness is in `crates/testing/felix-cluster`; `task test` runs the cluster tests. The delivery guarantees behind the subscriber queues are in the docs at [docs.getfelix.dev](https://docs.getfelix.dev).

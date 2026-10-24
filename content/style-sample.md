+++
title = "Sharing one flush between many writes"
description = "A style sample for the blog layout, written around group commit: why one flush can serve many writes, and how to say what it promises."
path = "blog/style-sample.html"
template = "page.html"
date = 2026-10-16
in_search_index = false
[extra]
noindex = true
read_minutes = 3
+++

<aside class="callout" aria-label="About this page">
      <p class="callout-t"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>This is a style sample</p>
      <p>It shows every element a post can use, so the layout can be checked in each theme and on a phone. It is not listed on the blog, not in the feed and not indexed. The first real post replaces it.</p>
    </aside>

Every write that a client is told is safe has to reach the disk first, and asking the disk to flush is slow: a few hundred microseconds on a good NVMe drive, and far longer on a cloud volume. If each write paid for its own flush, a busy broker would spend most of its time waiting on the drive.

Group commit is the old answer to this. Writes that arrive while a flush is running wait for the next one, and that next flush covers all of them. The cost of one flush is shared by however many writes are waiting.

## The shape of it {#shape}

The idea fits in a figure. Three writes arrive close together. None of them is acknowledged until the data is on disk, but they do not each ask for a flush.

<figure class="fig">
      <div class="stage">
        <svg class="tz-svg" viewBox="0 0 372 140" role="img" aria-labelledby="fig-1-t"><title id="fig-1-t">Three writes, A, B and C, feed into a single flush, which makes all three durable at once.</title><rect class="tz-fol" x="0" y="6" width="92" height="32" rx="8"/><text class="tz-ft" x="46" y="26" text-anchor="middle">write A</text><rect class="tz-fol" x="0" y="54" width="92" height="32" rx="8"/><text class="tz-ft" x="46" y="74" text-anchor="middle">write B</text><rect class="tz-fol" x="0" y="102" width="92" height="32" rx="8"/><text class="tz-ft" x="46" y="122" text-anchor="middle">write C</text><path class="tz-wire" d="M92 22C124 22 124 70 152 70M92 70H152M92 118C124 118 124 70 152 70"/><rect class="tz-lead" x="152" y="50" width="104" height="40" rx="9"/><text class="tz-lt" x="204" y="74" text-anchor="middle">one flush</text><path class="tz-wire" d="M256 70H280"/><g class="tz-ok"><rect x="280" y="50" width="92" height="40" rx="9"/><path d="M290 70l4 4 8-9"/></g><text class="tz-ft" x="340" y="74" text-anchor="middle">on disk</text></svg>
      </div>
      <figcaption><b>Figure 1</b>Three writes share one flush. Each is acknowledged when that flush returns.</figcaption>
    </figure>

What it buys depends on how many writes are waiting. With one writer it changes nothing. With many, the number of flushes stops growing with the number of writes:

<div class="table-wrap">
      <table>
        <thead>
          <tr><th scope="col">Waiting writes</th><th scope="col">Flushes, one each</th><th scope="col">Flushes, grouped</th></tr>
        </thead>
        <tbody>
          <tr><td>1</td><td class="num">1</td><td class="num">1</td></tr>
          <tr><td>8</td><td class="num">8</td><td class="num">1</td></tr>
          <tr><td>64</td><td class="num">64</td><td class="num">1</td></tr>
        </tbody>
      </table>
    </div>

## In code {#code}

A writer queues its data, then either starts a flush or waits for the one that will cover it. This is a sketch of the idea, not Felix's implementation:

<pre class="code" data-lang="Rust" tabindex="0"><code><span class="tok-k">async fn</span> <span class="tok-f">commit</span>(<span class="tok-k">&amp;self</span>, batch: <span class="tok-t">Batch</span>) -&gt; io::<span class="tok-t">Result</span>&lt;()&gt; {
    <span class="tok-k">let</span> ticket = <span class="tok-k">self</span>.queue.<span class="tok-f">push</span>(batch);
    <span class="tok-c">// The first writer to find no flush running leads this round.</span>
    <span class="tok-k">if let</span> <span class="tok-t">Ok</span>(_guard) = <span class="tok-k">self</span>.flushing.<span class="tok-f">try_lock</span>() {
        <span class="tok-k">let</span> upto = <span class="tok-k">self</span>.queue.<span class="tok-f">last_ticket</span>();
        <span class="tok-k">self</span>.file.<span class="tok-f">sync_data</span>().<span class="tok-k">await</span>?;
        <span class="tok-k">self</span>.queue.<span class="tok-f">release_through</span>(upto);
    }
    <span class="tok-k">self</span>.queue.<span class="tok-f">wait</span>(ticket).<span class="tok-k">await</span>
}</code></pre>

Inline code, like `sync_data`, sits in the text. A shell command looks the same as any other block:

<pre class="code" data-lang="Shell" tabindex="0"><code><span class="tok-f">docker</span> compose up -d
<span class="tok-f">docker</span> compose logs -f felix-broker   <span class="tok-c"># watch it come up</span></code></pre>

<aside class="callout warn" aria-label="Caution">
      <p class="callout-t"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17h.01"/></svg>The easy mistake</p>
      <p>The leader must decide which writes its flush covers <em>before</em> it starts flushing. A write queued after that point is not on disk when the flush returns, and acknowledging it then would be a lie.</p>
    </aside>

## Saying it precisely {#spec}

That rule is easier to check in a model than in prose. A few lines of TLA+ say what a flush is allowed to promise:

<pre class="code tla" data-lang="TLA+" tabindex="0"><code><span class="tla-rule">-------------------- MODULE GroupCommit --------------------</span>
<span class="tla-k">EXTENDS</span> Naturals, FiniteSets
<span class="tla-k">CONSTANT</span> Writes
<span class="tla-k">VARIABLES</span> queued, covered, durable

<span class="tla-def">Init</span> <span class="tla-op">==</span> queued <span class="tla-op">=</span> {} <span class="tla-op">/\</span> covered <span class="tla-op">=</span> {} <span class="tla-op">/\</span> durable <span class="tla-op">=</span> {}

<span class="tla-def">Write</span>(w) <span class="tla-op">==</span> <span class="tla-op">/\</span> w <span class="tla-op">\notin</span> queued
            <span class="tla-op">/\</span> queued<span class="tla-op">'</span> <span class="tla-op">=</span> queued <span class="tla-op">\cup</span> {w}
            <span class="tla-op">/\</span> <span class="tla-k">UNCHANGED</span> &lt;&lt;covered, durable&gt;&gt;

<span class="tla-c">\* The leader fixes what this flush covers, then the flush lands.</span>
<span class="tla-def">Start</span> <span class="tla-op">==</span> <span class="tla-op">/\</span> covered <span class="tla-op">=</span> {}
         <span class="tla-op">/\</span> covered<span class="tla-op">'</span> <span class="tla-op">=</span> queued <span class="tla-op">\</span> durable
         <span class="tla-op">/\</span> <span class="tla-k">UNCHANGED</span> &lt;&lt;queued, durable&gt;&gt;

<span class="tla-def">Land</span> <span class="tla-op">==</span> <span class="tla-op">/\</span> durable<span class="tla-op">'</span> <span class="tla-op">=</span> durable <span class="tla-op">\cup</span> covered
        <span class="tla-op">/\</span> covered<span class="tla-op">'</span> <span class="tla-op">=</span> {}
        <span class="tla-op">/\</span> <span class="tla-k">UNCHANGED</span> queued

<span class="tla-def">Next</span> <span class="tla-op">==</span> (<span class="tla-op">\E</span> w <span class="tla-op">\in</span> Writes : Write(w)) <span class="tla-op">\/</span> Start <span class="tla-op">\/</span> Land

<span class="tla-c">\* Nothing becomes durable that was not queued first.</span>
<span class="tla-def">Safe</span> <span class="tla-op">==</span> durable <span class="tla-op">\subseteq</span> queued
<span class="tla-rule">============================================================</span></code></pre>

### Checking it {#checking}

TLC explores every interleaving of `Write`, `Start` and `Land` for a small set of writes and reports any state where `Safe` fails. Three things are worth noticing:

- A write queued after `Start` waits for the next round.
- A flush with nothing to cover still takes a step, which is harmless.
- Nothing here says how long a write waits. That is a performance question, not a safety one.

<blockquote><p>A quotation, when a post needs one, is set off with a rule and muted text.</p></blockquote>

That is every element. A real post uses as many of them as it needs and no more.

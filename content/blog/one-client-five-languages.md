+++
title = "One client, five languages: how the C# SDK reuses the Rust client"
description = "Felix doesn't rewrite its client for each language. How the C# SDK binds the Rust cluster client through the C ABI, how it crosses the native boundary without leaking or double-freeing, and how a token provider stays safe to rotate a refresh token."
date = 2026-10-25
slug = "one-client-five-languages"
path = "blog/one-client-five-languages.html"

[taxonomies]
topics = ["architecture", "compatibility"]

[extra]
read_minutes = 6
card = "cards/one-client-five-languages.svg"
+++

A client for a replicated log has more to get right than it looks. It finds the broker that leads a shard, follows a redirect when leadership moves, reconnects and resumes a subscription where it left off, and decides which errors are worth retrying. Write that once and it is hard enough. Write it five times and the five copies disagree, quietly, in the cases nobody tests.

So Felix writes it once. The Rust cluster client does the work. Python and TypeScript bind to it, the C ABI (`libfelix` and its header `felix.h`) exposes it to anything that can call C, and the C# SDK, `Felix.Client`, is a thin layer over that ABI. Rust, C, Python, TypeScript and C#: one set of routing, retry and reconnect rules.

## What C# gets for free

`Felix.Client` calls `libfelix` with P/Invoke. When a C# publish lands on a shard that has moved, the client that follows the redirect is the Rust one, so a .NET program sees the same behaviour as a Python one, including the same error classes. There is no C# reimplementation of the protocol to fall behind.

Sharing code doesn't prove the wrapper is right, so every client is also checked against a shared specification. [`scenarios.toml`](https://github.com/GetFelix/felix/blob/main/crates/testing/felix-conformance/scenarios.toml) is a catalogue of the semantics a client must implement: a round trip, a redirect, a resubscribe after a broker is lost, a typed error. Each language's tests name the scenarios they cover, and `felix-conformance verify` fails the build if a required scenario has no passing result. The C# scenarios run against a broker fixture on Linux x64. Every other platform (Linux, macOS and Windows, on x64 and arm64) loads the native library and calls into it, which is where a packaging mistake would show.

<figure class="fig ck">
      <div class="stage glow"><svg class="ck-svg" viewBox="0 0 480 310" role="img" aria-labelledby="cs1-t"><title id="cs1-t">The Felix cat at a border crossing between a Rust side and a C# side, stamping passports. Each passport is a callback handed across the border. Each comes back once, stamped freed once, as a result.</title><g font-size="18.5"><text x="112" y="40" class="a" text-anchor="middle" font-size="20">Rust core</text><text x="378" y="40" class="a" text-anchor="middle" font-size="20">C# app</text><path class="lnm dash" d="M245 58V262"/><text x="245" y="296" class="cap" text-anchor="middle" font-size="13">libfelix · felix.h</text><g class="rough"><rect class="box" x="10" y="268" width="200" height="14" rx="4"/><rect class="box" x="280" y="268" width="190" height="14" rx="4"/></g><g class="rough"><rect class="paper" x="24" y="150" width="58" height="40" rx="4"/></g><text x="53" y="175" class="mono" text-anchor="middle" font-size="13">callback</text><g class="rough"><rect class="paper" x="24" y="202" width="58" height="40" rx="4"/></g><text x="53" y="227" class="mono" text-anchor="middle" font-size="13">callback</text><path class="lna dash" d="M86 170Q150 150 206 188" style="stroke-width:1.8"/><path class="lna dash" d="M86 222Q150 226 206 204" style="stroke-width:1.8"/><g class="rough"><g transform="translate(212 148) scale(0.62)"><path class="tl-e" d="M84 178C114 176 122 146 108 128C99 116 104 102 114 102"/><path class="tl" d="M84 178C114 176 122 146 108 128C99 116 104 102 114 102"/><path class="cf" d="M30 80C14 108 11 160 20 188L86 188C96 160 94 110 72 80Z"/><path class="cw" d="M38 90C33 120 37 150 50 168C63 150 67 120 62 90C56 97 44 97 38 90Z"/><ellipse class="cf" cx="38" cy="187" rx="12" ry="6"/><ellipse class="cf" cx="64" cy="187" rx="12" ry="6"/><path class="tl-e" d="M68 108C86 112 100 112 114 108" style="stroke-width:16"/><path class="tl" d="M68 108C86 112 100 112 114 108" style="stroke-width:11"/><circle class="cf" cx="116" cy="107" r="8"/><g transform="translate(0 -2)"><path class="cf" d="M20 52C19 38 24 29 31 24L27 6Q27 3 30 5L47 17Q50 16.5 53 17L70 5Q73 3 73 6L69 24C76 29 81 38 80 52C80 72 67 86 50 86C33 86 20 72 20 52Z"/><path class="ce" d="M32 21L30.5 11L41 18ZM68 21L69.5 11L59 18Z"/><path class="cw" d="M29 66C31 57 42 55 50 60C58 55 69 57 71 66C71 77 61 84 50 84C39 84 29 77 29 66Z"/><path class="cn" d="M45.5 60.5h9l-4.5 5z"/><path class="wh" d="M31 68L6 63M31 73L7 76M69 68L94 63M69 73L93 76"/><path class="hap" d="M31 47Q38 39 45 47M55 47Q62 39 69 47"/><path class="mo" d="M42 70Q50 79 58 70"/></g></g></g><g class="rough"><rect class="metal" x="278" y="206" width="24" height="12" rx="3"/><rect class="metal" x="284" y="192" width="12" height="15" rx="3"/></g><g class="rough"><rect class="paper" x="338" y="150" width="58" height="40" rx="4"/></g><text x="367" y="175" class="mono" text-anchor="middle" font-size="13">callback</text><g class="rough"><rect class="paper" x="338" y="202" width="58" height="40" rx="4"/></g><text x="367" y="227" class="mono" text-anchor="middle" font-size="13">callback</text><g class="okp"><rect x="402" y="140" width="66" height="24" rx="12"/><text x="436" y="157" text-anchor="middle" font-size="13">freed once</text></g><g class="okp"><rect x="402" y="192" width="66" height="24" rx="12"/><text x="436" y="209" text-anchor="middle" font-size="13">freed once</text></g><path class="lna dash" d="M304 196Q320 176 334 172" style="stroke-width:1.8"/><path class="lna dash" d="M304 212Q320 226 334 224" style="stroke-width:1.8"/><path class="lnok" d="M367 140Q245 70 91 140M100 126l-10 14l15 2" style="stroke-width:1.8"/><text x="245" y="88" class="ok" text-anchor="middle" font-size="14">result back, once</text></g></svg></div>
      <figcaption><b>Figure 1</b>A callback goes across the border once, and what it carries comes back once. The cat's job is to make sure nobody is stamped twice.</figcaption>
    </figure>

## Crossing the boundary

The C ABI is asynchronous. A call returns at once, and the result arrives later as a C callback, on a Rust thread, with a `user_data` pointer the caller handed in. A .NET `Task` is the natural shape for that, and most of the SDK's care goes into making the translation safe.

Each call gets a small state object holding a `TaskCompletionSource`. The SDK allocates a `GCHandle` for it and passes the handle's address as `user_data`, so the object stays alive while the native side holds a pointer to it. The task is created with `RunContinuationsAsynchronously`, so the code awaiting it never runs on the Rust thread that invoked the callback.

The rule that matters is that the handle is freed exactly once. If the native call refuses the request, no callback will ever run, and the caller frees the handle. If the call returns `OK`, the callback owns the handle from then on and the caller must not touch it. A double free is worse than a leak here: handle slots are reused, so freeing one twice can release whatever call has been given the slot since, and that call's callback then finds nothing. The free sits behind an atomic exchange, so whichever path gets there first wins and the other does nothing. A test counts the handles freed against the calls made.

The last rule is that no exception crosses into native code. A managed exception that unwinds through a native frame ends the process. Every callback body is wrapped, and a failure inside it faults the task instead of propagating.

## Tokens that renew themselves

A Felix token lasts 15 minutes by default, and the broker checks it each time a stream authenticates, including the streams a reconnect opens. A process that outlives one token needs a way to get the next. In C# that is a delegate on the connect options:

```csharp
TokenProvider = async ct => await myIdentity.FreshFelixTokenAsync(ct)
```

The type is `Func<CancellationToken, ValueTask<string>>`. The timing is not C#'s business. The Rust core calls the provider lazily: when a stream is about to authenticate and the client holds no token, the held one has used two thirds of its life, or the broker has just refused it. An idle client makes no calls and runs no timer. Only one call is in flight at a time, so streams that open together wait on it and share the token. That is what makes it safe to rotate a refresh token inside the provider, which is how Felix's control plane issues them: every refresh spends the token you sent and returns a replacement.

A call that takes longer than 30 seconds fails the operations waiting on it. A provider that fails is final for that operation. It is not retried, because each attempt can rotate a refresh token, and a retry could spend one the first attempt had already replaced. The next operation asks again.

What the C ABI can't express is cancellation, so C# adds it. The `CancellationToken` the provider receives is cancelled at the 30 second timeout, when the connect fails, and once the client and everything made from it has been disposed. That last condition is why the token source is reference-counted. A subscription can outlive the client that created it, and both share the same connections and the same token. If disposing the client cancelled a fetch that was in flight, the control plane might already have rotated the refresh token while the new access token was lost on its way back. The old refresh token would be spent and the new one gone. So the fetch is cancelled only when the last handle that could need it is gone.

## A library that wouldn't load

The odd bug in this work was on macOS. A release build of `libfelix.dylib` was refused by `dlopen` with `mis-aligned LINKEDIT string pool`. Nothing in the Rust or C# code was involved.

The cause was cargo's default release profile. On Apple targets rustc runs the system `strip` over every linked artifact, and on macOS 27 that `strip` left the shared library's LINKEDIT string pool 4-byte aligned, which dyld rejects. The fix is in [`Cargo.toml`](https://github.com/GetFelix/felix/blob/main/Cargo.toml): the `felix-capi` release profile sets `strip = "none"`. The symbols stay in the file, which a shared library exports anyway.

A library that builds but can't load passes every compile-time check, so CI now loads the release build and calls into it on all six platform and architecture combinations.

## Try it

```bash
dotnet add package Felix.Client
```

This subscribes before it publishes, so the record isn't missed, and bounds the whole exchange with one cancellation token:

```csharp
using System.Text;
using Felix;

using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));

try
{
    await using var client = await FelixClient.ConnectAsync(new FelixClientOptions
    {
        Addrs = ["127.0.0.1:5000"],
        TenantId = "t1",
        Token = Environment.GetEnvironmentVariable("FELIX_TOKEN"),
    }, cts.Token);

    // Subscribe first so the publish below is not missed.
    await using var sub = await client.SubscribeAsync(
        "t1", "default", "events", shard: 0, StartPosition.Latest, cts.Token);

    await client.PublishAsync(
        "t1", "default", "events", Encoding.UTF8.GetBytes("hello"), cancellationToken: cts.Token);

    var ev = await sub.ReadAsync(TimeSpan.FromSeconds(5), cts.Token);
    Console.WriteLine(ev is null ? "nothing arrived" : $"{ev.Offset}: {Encoding.UTF8.GetString(ev.Payload.Span)}");
}
catch (FelixException e) when (e.IsRetryable)
{
    Console.Error.WriteLine($"try again: {e.Status}: {e.Message}");
}
catch (OperationCanceledException)
{
    Console.Error.WriteLine("gave up after 30 seconds");
}
```

Both handles are `await using`, so the subscription and the client are released on every path, including the exceptions. A broker that is down or a shard that is moving surfaces as a `FelixException` with `IsRetryable` set; anything else propagates. The [C# client page](https://docs.getfelix.dev/clients/csharp/) covers sharded subscriptions, consumer groups, caches, counters, conditional publishes and the token provider in full, and the [C ABI page](https://docs.getfelix.dev/clients/c/) describes the layer underneath, for a language that doesn't have an SDK yet.

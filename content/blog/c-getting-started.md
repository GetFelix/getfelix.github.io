+++
title = "Getting started with the C ABI"
description = "Download libfelix, link it dynamically or statically, and connect, publish and subscribe from C with a program that checks every status and frees every handle."
date = 2026-10-25
slug = "c-getting-started"
path = "blog/c-getting-started.html"

[taxonomies]
topics = ["compatibility"]

[extra]
read_minutes = 4
card = "cards/c-getting-started.svg"
+++

`libfelix` is the Felix client as a C library. It wraps the same Rust client that Python, TypeScript and C# use, so reconnection, redirect-following and error classes behave the same here. Any language with a C FFI can bind to it, and you can call it from C directly.

## Get the library

Each Felix release attaches one archive per platform, `libfelix-<version>-<rid>.tar.gz` (`.zip` on Windows). It holds the shared library, the static library, `include/felix.h` and `LINKING.txt`.

<pre class="code" data-lang="Shell" tabindex="0"><code>VERSION=X.Y.Z   # a Felix release that attaches libfelix archives
RID=linux-x64   # linux-arm64, osx-arm64, osx-x64, win-x64, win-arm64
gh release download "v$VERSION" -R GetFelix/felix -p "libfelix-$VERSION-$RID.tar.gz"
mkdir libfelix &amp;&amp; tar -xzf "libfelix-$VERSION-$RID.tar.gz" -C libfelix</code></pre>

## Link it

Linking dynamically needs only the header and the library. The rpath lets the program find `libfelix` at run time without installing it:

<pre class="code" data-lang="Shell" tabindex="0"><code>cc -std=c11 app.c -Ilibfelix/include -Llibfelix/lib -lfelix \
   -Wl,-rpath,"$PWD/libfelix/lib" -o app</code></pre>

For a static link, add the system libraries the Rust code depends on. `LINKING.txt` lists them for your platform:

<pre class="code" data-lang="Shell" tabindex="0"><code>cc -std=c11 app.c -Ilibfelix/include libfelix/lib/libfelix.a &lt;libraries from LINKING.txt&gt; -o app</code></pre>

## Connect, publish, subscribe

Every call that talks to the broker returns at once and reports its result to a callback on a library thread. The call itself returns a `FelixStatus`, and anything but `FELIX_STATUS_OK` means it was refused and the callback will not run.

This program turns each call into a blocking one with a mutex and a condition variable, subscribes before it publishes so the record is not missed, checks every status, and frees every handle on every path. The token comes from the environment, so it is never in the source. Change the address, tenant, namespace and stream to match your broker.

<pre class="code" data-lang="C" tabindex="0"><code>#include &lt;inttypes.h&gt;
#include &lt;pthread.h&gt;
#include &lt;stdbool.h&gt;
#include &lt;stdio.h&gt;
#include &lt;stdlib.h&gt;

#include "felix.h"

/* Turns an asynchronous call into a blocking one: the callback fills it in
   on a library thread and wakes the caller. */
struct waiter {
    pthread_mutex_t mu;
    pthread_cond_t cv;
    bool done;
    FelixStatus status;
    void *handle;      /* the new client, subscription or event */
    bool has_offset;
    uint64_t offset;
    char message[256]; /* copied: the callback's message dies with the callback */
};

static void finish(struct waiter *w, FelixStatus status, const char *message, void *handle) {
    pthread_mutex_lock(&amp;w-&gt;mu);
    w-&gt;done = true;
    w-&gt;status = status;
    w-&gt;handle = handle;
    snprintf(w-&gt;message, sizeof w-&gt;message, "%s", message ? message : "");
    pthread_cond_signal(&amp;w-&gt;cv);
    pthread_mutex_unlock(&amp;w-&gt;mu);
}

/* A refused call never runs its callback, so its error comes from the thread. */
static FelixStatus wait_for(struct waiter *w, FelixStatus started) {
    if (started != FELIX_STATUS_OK) {
        snprintf(w-&gt;message, sizeof w-&gt;message, "%s", felix_last_error_message());
        return started;
    }
    pthread_mutex_lock(&amp;w-&gt;mu);
    while (!w-&gt;done) pthread_cond_wait(&amp;w-&gt;cv, &amp;w-&gt;mu);
    w-&gt;done = false;
    FelixStatus status = w-&gt;status;
    pthread_mutex_unlock(&amp;w-&gt;mu);
    return status;
}

static void on_connect(void *user_data, FelixStatus status, const char *message,
                       FelixClient *client) {
    finish(user_data, status, message, client);
}

static void on_subscribe(void *user_data, FelixStatus status, const char *message,
                         FelixSubscription *subscription) {
    finish(user_data, status, message, subscription);
}

static void on_publish(void *user_data, FelixStatus status, const char *message,
                       bool has_offset, uint64_t offset) {
    struct waiter *w = user_data;
    w-&gt;has_offset = has_offset;
    w-&gt;offset = offset;
    finish(w, status, message, NULL);
}

static void on_event(void *user_data, FelixStatus status, const char *message,
                     FelixEvent *event) {
    finish(user_data, status, message, event);
}

int main(void) {
    const char *token = getenv("FELIX_TOKEN");
    if (token == NULL || *token == '\0') {
        fprintf(stderr, "set FELIX_TOKEN\n");
        return 1;
    }

    struct waiter w = {.done = false};
    pthread_mutex_init(&amp;w.mu, NULL);
    pthread_cond_init(&amp;w.cv, NULL);
    FelixClient *client = NULL;
    FelixSubscription *sub = NULL;
    FelixEvent *event = NULL;
    const uint8_t *data = NULL;
    size_t len = 0;
    int exit_code = 1;
    FelixStatus status;

    status = felix_client_connect("127.0.0.1:5000", "t1", token, "localhost",
                                  NULL /* system CAs */, NULL, on_connect, &amp;w);
    if (wait_for(&amp;w, status) != FELIX_STATUS_OK) {
        fprintf(stderr, "connect: %s\n", w.message);
        goto cleanup;
    }
    client = w.handle;

    /* Subscribe first, so the publish below is not missed. */
    status = felix_client_subscribe(client, "t1", "default", "events", 0,
                                    FELIX_START_LATEST, 0, NULL, on_subscribe, &amp;w);
    if (wait_for(&amp;w, status) != FELIX_STATUS_OK) {
        fprintf(stderr, "subscribe: %s\n", w.message);
        goto cleanup;
    }
    sub = w.handle;

    static const uint8_t payload[] = "hello";
    status = felix_client_publish(client, "t1", "default", "events", payload,
                                  sizeof payload - 1, NULL, 0, FELIX_ACK_PER_MESSAGE,
                                  FELIX_DELIVERY_AT_MOST_ONCE, NULL, on_publish, &amp;w);
    if (wait_for(&amp;w, status) != FELIX_STATUS_OK) {
        fprintf(stderr, "publish: %s\n", w.message);
        goto cleanup;
    }
    if (w.has_offset) printf("published at offset %" PRIu64 "\n", w.offset);

    status = felix_subscription_next(sub, 5000 /* ms */, NULL, on_event, &amp;w);
    status = wait_for(&amp;w, status);
    if (status != FELIX_STATUS_OK) {
        fprintf(stderr, "read: %s\n", status == FELIX_STATUS_TIMEOUT ? "timed out" : w.message);
        goto cleanup;
    }
    event = w.handle;
    if (felix_event_payload(event, &amp;data, &amp;len) != FELIX_STATUS_OK) {
        fprintf(stderr, "payload: %s\n", felix_last_error_message());
        goto cleanup;
    }
    printf("%.*s\n", (int)len, (const char *)data);
    exit_code = 0;

cleanup:
    /* Every call has completed by here, so no callback still holds &amp;w. */
    felix_event_free(event);
    felix_subscription_free(sub);
    felix_client_free(client);
    pthread_cond_destroy(&amp;w.cv);
    pthread_mutex_destroy(&amp;w.mu);
    return exit_code;
}</code></pre>

Run it with a token for your tenant:

<pre class="code" data-lang="Shell" tabindex="0"><code>FELIX_TOKEN=... ./app</code></pre>

TLS is always on. Pass a PEM file as `ca_file` to trust your own CA instead of the system store.

## Where to go next

The [C client page](https://docs.getfelix.dev/clients/c/) covers the rest: cancellation, token refresh, batches, producers, consumer groups, caches and atomic commits.

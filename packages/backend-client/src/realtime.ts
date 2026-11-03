// Realtime over SSE from the api service. Exposes a channel API shaped like
// supabase-js's postgres_changes so the apps' invalidation hooks are unchanged:
//
//   db.channel('x').on('postgres_changes', { event, schema, table }, cb).subscribe(statusCb)
//   db.removeChannel(channel)

import type { AuthClient } from "./auth";

export interface ChangePayload {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  schema: string;
  table: string;
  new: Record<string, unknown>;
  old: Record<string, unknown>;
}
export type ChannelStatus = "SUBSCRIBED" | "CHANNEL_ERROR" | "CLOSED";

interface Binding {
  event: string;
  table: string;
  cb: (payload: ChangePayload) => void;
}

export class RealtimeChannel {
  bindings: Binding[] = [];
  statusCb: ((status: ChannelStatus, err?: Error) => void) | undefined;

  readonly name: string;
  private readonly hub: RealtimeHub;

  constructor(name: string, hub: RealtimeHub) {
    this.name = name;
    this.hub = hub;
  }

  on(
    _type: "postgres_changes",
    filter: { event: string; schema?: string; table: string },
    cb: (payload: ChangePayload) => void,
  ): this {
    this.bindings.push({ event: filter.event, table: filter.table, cb });
    return this;
  }

  subscribe(statusCb?: (status: ChannelStatus, err?: Error) => void): this {
    this.statusCb = statusCb;
    this.hub.add(this);
    return this;
  }
}

const MAX_BACKOFF_MS = 30_000;

export class RealtimeHub {
  private channels = new Set<RealtimeChannel>();
  private abort: AbortController | null = null;
  private backoff = 1000;
  private connectedOnce = false;

  private readonly url: string;
  private readonly auth: AuthClient;

  constructor(url: string, auth: AuthClient) {
    this.url = url;
    this.auth = auth;
  }

  add(ch: RealtimeChannel) {
    this.channels.add(ch);
    if (!this.abort) void this.run();
  }

  remove(ch: RealtimeChannel) {
    this.channels.delete(ch);
    ch.statusCb?.("CLOSED");
    if (this.channels.size === 0) {
      this.abort?.abort();
      this.abort = null;
      this.connectedOnce = false;
    }
  }

  private status(s: ChannelStatus, err?: Error) {
    for (const ch of this.channels) ch.statusCb?.(s, err);
  }

  private dispatch(raw: string) {
    let ev: { table: string; type: ChangePayload["eventType"]; new: Record<string, unknown> | null; old: Record<string, unknown> | null };
    try { ev = JSON.parse(raw); } catch { return; }
    const payload: ChangePayload = {
      eventType: ev.type, schema: "public", table: ev.table, new: ev.new ?? {}, old: ev.old ?? {},
    };
    for (const ch of this.channels) {
      for (const b of ch.bindings) {
        if (b.table === ev.table && (b.event === "*" || b.event === ev.type)) b.cb(payload);
      }
    }
  }

  /** After a reconnect, events from the gap are lost — poke every binding with
   *  an empty change so each hook invalidates its caches once. */
  private resync() {
    for (const ch of this.channels) {
      for (const b of ch.bindings) {
        b.cb({ eventType: "UPDATE", schema: "public", table: b.table, new: {}, old: {} });
      }
    }
  }

  private async run() {
    const abort = new AbortController();
    this.abort = abort;
    while (!abort.signal.aborted && this.channels.size > 0) {
      const token = this.auth.getAccessToken();
      if (!token) { await sleep(2000, abort.signal); continue; }
      try {
        const res = await fetch(`${this.url}/realtime/v1/stream`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
          signal: abort.signal,
        });
        if (res.status === 401) {
          await this.auth.refreshSession();
          throw new Error("realtime: not authenticated");
        }
        if (!res.ok || !res.body) throw new Error(`realtime: HTTP ${res.status}`);
        await this.read(res.body);
        // Clean server close (connection lifetime cap) — reconnect right away.
        this.backoff = 1000;
      } catch (err) {
        if (abort.signal.aborted) return;
        this.status("CHANNEL_ERROR", err as Error);
        await sleep(this.backoff, abort.signal);
        this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
      }
    }
  }

  private async read(body: ReadableStream<Uint8Array>) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const block = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        let event = "message";
        const data: string[] = [];
        for (const line of block.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
        }
        if (event === "ready") {
          this.backoff = 1000;
          this.status("SUBSCRIBED");
          if (this.connectedOnce) this.resync();
          this.connectedOnce = true;
        } else if (event === "change") {
          this.dispatch(data.join("\n"));
        }
      }
    }
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

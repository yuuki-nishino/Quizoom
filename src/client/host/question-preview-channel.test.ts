import { describe, it, expect, vi } from "vitest";
import type { AssetId, EventId } from "../../shared/domain-types";
import {
  previewChannelMessageSchema,
  previewChannelName,
  previewDraftSchema,
  publishDrafts,
  subscribeDrafts,
  type ChannelFactory,
  type ChannelLike,
  type PreviewDraft,
} from "./question-preview-channel";

const EVENT = "event-1" as EventId;

/** 同一名のチャンネル同士が互いにメッセージを届け合う(自分自身には届かない) BroadcastChannel の代替 */
function createBus(): { factory: ChannelFactory; inject(name: string, data: unknown): void } {
  const channels = new Map<string, Set<ChannelLike>>();
  const factory: ChannelFactory = (name) => {
    const channel: ChannelLike = {
      onmessage: null,
      postMessage(data) {
        for (const other of channels.get(name) ?? []) if (other !== channel) other.onmessage?.({ data });
      },
      close() {
        channels.get(name)?.delete(channel);
      },
    };
    if (!channels.has(name)) channels.set(name, new Set());
    channels.get(name)!.add(channel);
    return channel;
  };
  return {
    factory,
    inject(name, data) {
      for (const channel of channels.get(name) ?? []) channel.onmessage?.({ data });
    },
  };
}

const draft = (body: string, imageAssetId: string | null = null): PreviewDraft => ({
  body,
  explanation: "解説",
  imageAssetId: null,
  options: [
    { label: "りんご", imageAssetId: imageAssetId as AssetId | null, isCorrect: true },
    { label: "みかん", imageAssetId: null, isCorrect: false },
  ],
});

describe("previewChannelName", () => {
  it("scopes the channel to the event and the editing session", () => {
    expect(previewChannelName(EVENT, "s1")).toBe("quizoom:question-preview:event-1:s1");
    expect(previewChannelName(EVENT, "s1")).not.toBe(previewChannelName(EVENT, "s2"));
  });
});

describe("previewChannelMessageSchema", () => {
  it("accepts request, draft and closed messages", () => {
    expect(previewChannelMessageSchema.safeParse({ type: "request" }).success).toBe(true);
    expect(previewChannelMessageSchema.safeParse({ type: "closed" }).success).toBe(true);
    expect(previewChannelMessageSchema.safeParse({ type: "draft", draft: draft("Q") }).success).toBe(true);
  });

  it("rejects malformed messages", () => {
    for (const bad of [null, "x", {}, { type: "other" }, { type: "draft" }, { type: "draft", draft: { body: 1 } }, { type: "draft", draft: { ...draft("Q"), options: "no" } }]) {
      expect(previewChannelMessageSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("requires option text, correctness and an image reference that is a string or null", () => {
    const bad = { ...draft("Q"), options: [{ label: "a", isCorrect: true, imageAssetId: 5 }] };
    expect(previewDraftSchema.safeParse(bad).success).toBe(false);
  });
});

describe("publishDrafts / subscribeDrafts", () => {
  it("answers a request from the preview with the latest draft", () => {
    const bus = createBus();
    let latest = draft("v1");
    publishDrafts(EVENT, "s1", () => latest, bus.factory);
    const onDraft = vi.fn();
    const sub = subscribeDrafts(EVENT, "s1", { onDraft, onClosed: vi.fn() }, bus.factory);

    latest = draft("v2");
    sub.requestDraft();

    expect(onDraft).toHaveBeenCalledTimes(1);
    expect(onDraft).toHaveBeenCalledWith(draft("v2"));
  });

  it("pushes every edit to an open preview without it re-requesting", () => {
    const bus = createBus();
    const pub = publishDrafts(EVENT, "s1", () => draft("v1"), bus.factory);
    const onDraft = vi.fn();
    subscribeDrafts(EVENT, "s1", { onDraft, onClosed: vi.fn() }, bus.factory);

    pub.push(draft("v2", "img-1"));
    pub.push(draft("v3"));

    expect(onDraft.mock.calls.map((c) => (c[0] as PreviewDraft).body)).toEqual(["v2", "v3"]);
    expect((onDraft.mock.calls[0]![0] as PreviewDraft).options[0]!.imageAssetId).toBe("img-1");
  });

  it("tells the preview the editor closed", () => {
    const bus = createBus();
    const pub = publishDrafts(EVENT, "s1", () => draft("v1"), bus.factory);
    const onClosed = vi.fn();
    subscribeDrafts(EVENT, "s1", { onDraft: vi.fn(), onClosed }, bus.factory);

    pub.close();

    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it("never delivers across events or editing sessions", () => {
    const bus = createBus();
    const pub = publishDrafts(EVENT, "s1", () => draft("v1"), bus.factory);
    const otherSession = vi.fn();
    const otherEvent = vi.fn();
    subscribeDrafts(EVENT, "s2", { onDraft: otherSession, onClosed: otherSession }, bus.factory);
    subscribeDrafts("event-2" as EventId, "s1", { onDraft: otherEvent, onClosed: otherEvent }, bus.factory);

    pub.push(draft("v2"));
    pub.close();

    expect(otherSession).not.toHaveBeenCalled();
    expect(otherEvent).not.toHaveBeenCalled();
  });

  it("ignores malformed messages instead of rendering them", () => {
    const bus = createBus();
    const onDraft = vi.fn();
    const onClosed = vi.fn();
    subscribeDrafts(EVENT, "s1", { onDraft, onClosed }, bus.factory);

    bus.inject(previewChannelName(EVENT, "s1"), { type: "draft", draft: { body: 123 } });
    bus.inject(previewChannelName(EVENT, "s1"), "garbage");

    expect(onDraft).not.toHaveBeenCalled();
    expect(onClosed).not.toHaveBeenCalled();
  });

  it("stops delivering after the subscriber is closed", () => {
    const bus = createBus();
    const pub = publishDrafts(EVENT, "s1", () => draft("v1"), bus.factory);
    const onDraft = vi.fn();
    const sub = subscribeDrafts(EVENT, "s1", { onDraft, onClosed: vi.fn() }, bus.factory);

    sub.close();
    pub.push(draft("v2"));

    expect(onDraft).not.toHaveBeenCalled();
  });

  it("does not answer when no editor is publishing (the preview then times out on its own)", () => {
    const bus = createBus();
    const onDraft = vi.fn();
    const sub = subscribeDrafts(EVENT, "s1", { onDraft, onClosed: vi.fn() }, bus.factory);

    sub.requestDraft();

    expect(onDraft).not.toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, it } from "vitest";
import {
  __resetPubSubForTests,
  publish,
  subscribe,
  type UpdateEvent,
} from "./pubsub";

afterEach(() => {
  __resetPubSubForTests();
});

const EVT = (seq: number): UpdateEvent => ({
  seq,
  ciphertext: `v1.U${seq}`,
  clientId: "c",
});

describe("pubsub", () => {
  it("delivers a published event to a single subscriber", () => {
    const got: UpdateEvent[] = [];
    subscribe("rec", (e) => got.push(e));
    publish("rec", EVT(1));
    expect(got).toEqual([EVT(1)]);
  });

  it("fans out to every subscriber on the same record", () => {
    const a: UpdateEvent[] = [];
    const b: UpdateEvent[] = [];
    subscribe("rec", (e) => a.push(e));
    subscribe("rec", (e) => b.push(e));
    publish("rec", EVT(7));
    expect(a).toEqual([EVT(7)]);
    expect(b).toEqual([EVT(7)]);
  });

  it("isolates records — events on rec-x do not reach rec-y subscribers", () => {
    const got: UpdateEvent[] = [];
    subscribe("rec-y", (e) => got.push(e));
    publish("rec-x", EVT(1));
    expect(got).toEqual([]);
  });

  it("unsubscribe stops further delivery", () => {
    const got: UpdateEvent[] = [];
    const off = subscribe("rec", (e) => got.push(e));
    publish("rec", EVT(1));
    off();
    publish("rec", EVT(2));
    expect(got).toEqual([EVT(1)]);
  });

  it("a listener that throws does not break delivery to other listeners", () => {
    const got: UpdateEvent[] = [];
    subscribe("rec", () => {
      throw new Error("boom");
    });
    subscribe("rec", (e) => got.push(e));
    publish("rec", EVT(1));
    expect(got).toEqual([EVT(1)]);
  });

  it("a listener unsubscribing during dispatch is honored", () => {
    const got: number[] = [];
    let off: (() => void) | null = null;
    off = subscribe("rec", () => {
      got.push(1);
      off?.();
    });
    publish("rec", EVT(1));
    publish("rec", EVT(2));
    expect(got).toEqual([1]);
  });
});

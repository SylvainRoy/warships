import { describe, expect, it } from "vitest";
import { closeOutcome } from "../src/client/reconnect.js";

describe("WebSocket close outcome", () => {
  it("reconnects after a joined connection closes", () => {
    expect(closeOutcome(1006, { joined: true, resuming: false, reconnectForLobby: false })).toEqual({
      reconnect: true,
      resuming: true,
      message: "Connection lost — reconnecting…",
    });
  });

  it("keeps retrying after a reconnect attempt fails", () => {
    expect(closeOutcome(1006, { joined: false, resuming: true, reconnectForLobby: false })).toEqual({
      reconnect: true,
      resuming: true,
      message: "Connection lost — reconnecting…",
    });
  });

  it("does not reconnect after a kick", () => {
    expect(closeOutcome(4000, { joined: true, resuming: true, reconnectForLobby: true })).toEqual({
      reconnect: false,
      resuming: false,
      message: null,
    });
  });

  it("does not reconnect after another tab takes over", () => {
    expect(closeOutcome(4001, { joined: true, resuming: true, reconnectForLobby: false })).toEqual({
      reconnect: false,
      resuming: false,
      message: "This captain joined from another tab.",
    });
  });

  it("does not retry when there is no joined or lobby reconnect state", () => {
    expect(closeOutcome(1006, { joined: false, resuming: false, reconnectForLobby: false })).toEqual({
      reconnect: false,
      resuming: false,
      message: null,
    });
  });
});

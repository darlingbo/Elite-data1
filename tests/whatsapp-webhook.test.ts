import { describe, expect, it } from "vitest";
import { parseWhapiMessage } from "@/lib/whapi-webhook";

describe("Whapi incoming message parser", () => {
  it("parses a normal incoming text message", () => {
    expect(parseWhapiMessage({
      messages: [{
        id: "msg-1",
        chat_id: "233501234567@s.whatsapp.net",
        from: "233501234567",
        from_me: false,
        text: { body: "How much is MTN 5GB?" },
      }],
    })).toMatchObject({
      id: "msg-1",
      from: "233501234567",
      text: "How much is MTN 5GB?",
    });
  });

  it("ignores outgoing and group messages", () => {
    expect(parseWhapiMessage({
      messages: [{ id: "msg-2", from: "233501234567", from_me: true, text: { body: "Sent" } }],
    })).toBeNull();
    expect(parseWhapiMessage({
      messages: [{ id: "msg-3", chat_id: "123@g.us", from: "233501234567", text: { body: "Group" } }],
    })).toBeNull();
  });
});

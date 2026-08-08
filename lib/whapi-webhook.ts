export type IncomingWhatsAppMessage = {
  id: string;
  from: string;
  text: string;
  fromMe: boolean;
  chatId: string;
};

function firstString(...values: unknown[]): string {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim() ?? "";
}

export function parseWhapiMessage(payload: Record<string, unknown>): IncomingWhatsAppMessage | null {
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const raw = (messages[0] ?? payload.message ?? payload) as Record<string, unknown>;
  if (!raw || typeof raw !== "object") return null;

  const source = (raw.source ?? {}) as Record<string, unknown>;
  const textObject = (raw.text ?? {}) as Record<string, unknown>;
  const chatId = firstString(raw.chat_id, raw.chatId, source.chat_id, source.chatId);
  const from = firstString(raw.from, source.from, chatId).split("@")[0].replace(/\D/g, "");
  const text = firstString(
    typeof raw.text === "string" ? raw.text : undefined,
    textObject.body,
    raw.body,
    raw.caption,
  );
  const fromMe = raw.from_me === true || raw.fromMe === true || source.from_me === true;
  const id = firstString(raw.id, raw.message_id, raw.messageId);

  if (!id || !from || !text || fromMe || chatId.endsWith("@g.us")) return null;
  return { id, from, text: text.slice(0, 2_000), fromMe, chatId: chatId || `${from}@s.whatsapp.net` };
}

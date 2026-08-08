export async function sendWhatsAppText(to: string, message: string): Promise<void> {
  const apiKey = process.env.WHATSAPP_API_KEY;
  if (!apiKey) return;

  try {
    await fetch("https://gate.whapi.cloud/messages/text", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: to.includes("@") ? to : `${to.replace(/\D/g, "")}@s.whatsapp.net`,
        body: message,
      }),
    });
  } catch {
    // silent — never break an order because WhatsApp failed
  }
}

// Sends a WhatsApp message to the admin number via Whapi.cloud
export async function sendAdminWhatsApp(message: string): Promise<void> {
  const to = process.env.ADMIN_WHATSAPP_NUMBER ?? "233509794503";
  await sendWhatsAppText(to, message);
}

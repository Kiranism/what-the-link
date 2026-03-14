import { Hono } from "hono";
import {
  getQRCode,
  getConnectionStatus,
  disconnectWhatsApp,
  initWhatsApp,
} from "../services/whatsapp";

export const whatsappRouter = new Hono();

whatsappRouter.get("/qr", (c) => {
  const { connected, phoneNumber, lastDisconnectCode } = getConnectionStatus();
  const qr = getQRCode();
  let message: string;
  if (connected) {
    message = "Already connected";
  } else if (qr) {
    message = "Scan the QR code with WhatsApp";
  } else if (lastDisconnectCode === 405) {
    message =
      "Connecting… (server is retrying with latest WhatsApp version; QR will appear when ready)";
  } else if (lastDisconnectCode === 440) {
    message =
      "Another device or session took over. Open WhatsApp on your phone → Linked devices and remove the old one, then refresh this page to show a new QR.";
  } else {
    message = "Waiting for connection...";
  }
  return c.json({
    qr: qr ?? null,
    connected,
    ...(phoneNumber && { phoneNumber }),
    message,
  });
});

whatsappRouter.get("/status", (c) => {
  return c.json(getConnectionStatus());
});

whatsappRouter.post("/disconnect", async (c) => {
  await disconnectWhatsApp();
  return c.json({ success: true });
});

whatsappRouter.post("/reconnect", async (c) => {
  await initWhatsApp();
  return c.json({ success: true });
});

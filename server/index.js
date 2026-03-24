import { ServerClient } from "postmark";
import { z } from "zod";

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number.parseInt(process.env.PORT || "3002", 10);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

const POSTMARK_API_KEY = process.env.POSTMARK_API_KEY;
const CONTACT_FROM_EMAIL = process.env.CONTACT_FROM_EMAIL;
const CONTACT_TO_EMAIL = process.env.CONTACT_TO_EMAIL;
const CONTACT_FROM_NAME = "holon.software";

if (!POSTMARK_API_KEY) {
  throw new Error("POSTMARK_API_KEY environment variable is required");
}

if (!CONTACT_FROM_EMAIL) {
  throw new Error("CONTACT_FROM_EMAIL environment variable is required");
}

if (!CONTACT_TO_EMAIL) {
  throw new Error("CONTACT_TO_EMAIL environment variable is required");
}

const postmark = new ServerClient(POSTMARK_API_KEY);

const submissionSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().max(320),
  message: z.string().trim().min(10).max(5000),
  website: z.string().max(0).optional().or(z.literal("")),
});

function getCorsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN === "*" ? "*" : origin || ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
  };
}

function json(data, status = 200, origin = "") {
  return new Response(JSON.stringify(data), {
    status,
    headers: getCorsHeaders(origin),
  });
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildInternalEmail(submission) {
  return {
    subject: `New contact form message from ${submission.name}`,
    text: [
      "New holon.software contact form submission",
      "",
      `Name: ${submission.name}`,
      `Email: ${submission.email}`,
      "",
      "Message:",
      submission.message,
    ]
      .filter(Boolean)
      .join("\n"),
    html: `
      <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 640px; margin: 0 auto; padding: 32px 20px; color: #0f172a;">
          <h2 style="margin: 0 0 20px;">New holon.software contact form submission</h2>
          <p style="margin: 0 0 8px;"><strong>Name:</strong> ${escapeHtml(submission.name)}</p>
          <p style="margin: 0 0 8px;"><strong>Email:</strong> ${escapeHtml(submission.email)}</p>
          <p style="margin: 24px 0 8px;"><strong>Message:</strong></p>
          <div style="padding: 16px; border-radius: 12px; background: #eff6ff; white-space: pre-wrap;">${escapeHtml(submission.message)}</div>
        </body>
      </html>
    `.trim(),
  };
}

function buildSenderCopy(submission) {
  return {
    subject: "We received your message - holon.software",
    text: [
      `Hi ${submission.name},`,
      "",
      "Thanks for reaching out to holon.software. This is a copy of your message:",
      "",
      `Email: ${submission.email}`,
      "",
      submission.message,
      "",
      "We will get back to you soon.",
    ]
      .filter(Boolean)
      .join("\n"),
    html: `
      <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 640px; margin: 0 auto; padding: 32px 20px; color: #0f172a;">
          <h2 style="margin: 0 0 18px;">We received your message</h2>
          <p style="margin: 0 0 12px;">Hi ${escapeHtml(submission.name)},</p>
          <p style="margin: 0 0 12px;">Thanks for reaching out to holon.software. This is a copy of your message:</p>
          <div style="padding: 16px; border-radius: 12px; background: #eff6ff;">
            <p style="margin: 0 0 8px;"><strong>Email:</strong> ${escapeHtml(submission.email)}</p>
            <p style="margin: 16px 0 8px;"><strong>Message:</strong></p>
            <div style="white-space: pre-wrap;">${escapeHtml(submission.message)}</div>
          </div>
          <p style="margin: 18px 0 0;">We will get back to you soon.</p>
        </body>
      </html>
    `.trim(),
  };
}

async function handleContact(request) {
  const origin = request.headers.get("origin") || "";

  if (ALLOWED_ORIGIN !== "*" && origin && origin !== ALLOWED_ORIGIN) {
    return json({ error: "Origin not allowed" }, 403, origin);
  }

  const body = await request.json();
  const parsed = submissionSchema.safeParse(body);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return json({ error: issue?.message || "Invalid form submission" }, 400, origin);
  }

  const submission = parsed.data;

  if (submission.website) {
    return json({ ok: true }, 200, origin);
  }

  const internalEmail = buildInternalEmail(submission);
  const senderCopy = buildSenderCopy(submission);

  await postmark.sendEmail({
    From: CONTACT_FROM_EMAIL,
    To: CONTACT_TO_EMAIL,
    ReplyTo: submission.email,
    Subject: internalEmail.subject,
    HtmlBody: internalEmail.html,
    TextBody: internalEmail.text,
    MessageStream: "outbound",
  });

  await postmark.sendEmail({
    From: `${CONTACT_FROM_NAME} <${CONTACT_FROM_EMAIL}>`,
    To: submission.email,
    Subject: senderCopy.subject,
    HtmlBody: senderCopy.html,
    TextBody: senderCopy.text,
    MessageStream: "outbound",
  });

  return json({ ok: true }, 200, origin);
}

async function fetch(request) {
  const origin = request.headers.get("origin") || "";
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
  }

  if (url.pathname === "/health") {
    return json({ status: "ok" }, 200, origin);
  }

  if (url.pathname === "/api/contact" && request.method === "POST") {
    try {
      return await handleContact(request);
    } catch (error) {
      console.error("Contact API error", error);
      return json({ error: "Failed to send message" }, 500, origin);
    }
  }

  return json({ error: "Not found" }, 404, origin);
}

console.log(`Contact API running on http://${HOST}:${PORT}`);

Bun.serve({
  hostname: HOST,
  port: PORT,
  fetch,
});

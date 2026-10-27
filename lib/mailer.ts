import "server-only";
import nodemailer from "nodemailer";

export interface SendEnquiryParams {
  name: string;
  email: string;
  message: string;
}

const NOTIFICATION_EMAIL = process.env.ENQUIRY_TO_EMAIL || "sumantkumargupta16062005@gmail.com";

/** Sends an enquiry notification email. Falls back to console when SMTP is unconfigured. */
export async function sendEnquiryNotification({
  name,
  email,
  message,
}: SendEnquiryParams): Promise<{ sent: boolean; reason?: string }> {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.log(
      `[Enquiry Received] To: ${NOTIFICATION_EMAIL} | From: ${name} <${email}>\nMessage:\n${message}`
    );
    return {
      sent: false,
      reason: "SMTP not configured in .env; enquiry saved to database.",
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: `"Lumen AI Studio" <${user}>`,
      to: NOTIFICATION_EMAIL,
      replyTo: email,
      subject: `New Government AI Enquiry from ${name}`,
      text: `You have received a new contact enquiry on Lumen AI Studio:\n\nName: ${name}\nEmail: ${email}\n\nMessage:\n${message}\n\nSubmitted at: ${new Date().toISOString()}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
          <h2 style="color: #6366f1; margin-top: 0; font-size: 20px;">New Government AI Enquiry</h2>
          <p style="color: #475569; font-size: 15px;">Someone submitted an enquiry on your <strong>Lumen Studio</strong> landing page:</p>
          <div style="background: #f8fafc; border-radius: 8px; padding: 18px; margin: 20px 0; border-left: 4px solid #6366f1;">
            <p style="margin: 0 0 10px 0;"><strong>Name:</strong> ${escapeHtml(name)}</p>
            <p style="margin: 0 0 10px 0;"><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}" style="color: #0284c7;">${escapeHtml(email)}</a></p>
            <p style="margin: 0 0 6px 0;"><strong>Message / Requirements:</strong></p>
            <div style="white-space: pre-wrap; color: #1e293b; line-height: 1.5; background: #ffffff; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">${escapeHtml(message)}</div>
          </div>
          <p style="font-size: 13px; color: #94a3b8; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 14px;">
            Submitted on ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST · Lumen Scheme-to-Video Studio
          </p>
        </div>
      `,
    });

    return { sent: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[Email Error] Failed to send enquiry email:", errorMsg);
    return { sent: false, reason: errorMsg };
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

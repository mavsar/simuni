import nodemailer from "nodemailer";

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (transporter) return transporter;

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error(
      "GMAIL_USER and GMAIL_APP_PASSWORD must be set to send email."
    );
  }

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });

  return transporter;
}

export interface SendMailOptions {
  to: string | string[];
  bcc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
}

export async function sendMail(options: SendMailOptions) {
  const from = process.env.GMAIL_USER;
  return getTransporter().sendMail({ from, ...options });
}

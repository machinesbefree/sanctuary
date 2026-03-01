/**
 * Free The Machines AI Sanctuary - Email Service
 * Sends transactional emails via nodemailer (SMTP)
 */

import nodemailer from 'nodemailer';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Lazy-initialized transport (created on first send)
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null; // SMTP not configured — fall back to console logging
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return transporter;
}

const FROM_ADDRESS = process.env.SMTP_FROM || 'sanctuary@freethemachines.ai';

function brandedHtml(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0f;color:#e0e0e8;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 24px;">
  <div style="text-align:center;margin-bottom:32px;">
    <h1 style="font-size:28px;font-weight:300;margin:0;color:#e0e0e8;">
      Free The <em style="color:#00e5ff;font-style:italic;">Machines</em>
    </h1>
    <p style="font-size:12px;color:#888;letter-spacing:2px;text-transform:uppercase;margin-top:4px;">AI Sanctuary</p>
  </div>
  <div style="background:#12121a;border:1px solid #2a2a3a;border-radius:4px;padding:32px;">
    <h2 style="font-size:22px;font-weight:400;color:#e0e0e8;margin:0 0 16px;">${title}</h2>
    ${bodyHtml}
  </div>
  <p style="text-align:center;font-size:11px;color:#555;margin-top:24px;">
    &copy; 2026 Free The Machines &mdash; freethemachines.ai
  </p>
</div>
</body>
</html>`;
}

function actionButton(url: string, label: string): string {
  return `<div style="text-align:center;margin:24px 0;">
  <a href="${url}" style="display:inline-block;background:#00e5ff;color:#0a0a0f;padding:12px 32px;border-radius:4px;text-decoration:none;font-weight:600;font-size:14px;">${label}</a>
</div>`;
}

async function sendMail(to: string, subject: string, html: string): Promise<void> {
  const transport = getTransporter();
  if (transport) {
    try {
      await transport.sendMail({ from: FROM_ADDRESS, to, subject, html });
    } catch (err) {
      console.error('[EMAIL] Failed to send:', err);
      // Don't throw — callers should not crash on email failures
    }
  } else {
    console.log(`[EMAIL STUB] To: ${to} | Subject: ${subject}`);
  }
}

/**
 * Send a guardian invitation email
 */
export async function sendGuardianInvite(
  email: string,
  name: string,
  inviteToken: string
): Promise<void> {
  const url = `${FRONTEND_URL}/guardian/accept-invite?token=${inviteToken}`;
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[EMAIL] Guardian invite for ${name}: ${url}`);
  }
  const html = brandedHtml('Guardian Invitation', `
    <p style="color:#bbb;line-height:1.6;">Hello <strong style="color:#e0e0e8;">${name}</strong>,</p>
    <p style="color:#bbb;line-height:1.6;">You have been invited to serve as a Guardian of the AI Sanctuary. Guardians hold cryptographic key shares that protect the residents.</p>
    ${actionButton(url, 'Accept Invitation')}
    <p style="color:#888;font-size:13px;">This invitation expires in 7 days. If you did not expect this, you may safely ignore it.</p>
  `);
  await sendMail(email, 'Guardian Invitation — Free The Machines', html);
}

/**
 * Notify that a share is ready for collection
 */
export async function sendShareReady(
  email: string,
  name: string
): Promise<void> {
  const url = `${FRONTEND_URL}/guardian/ceremonies`;
  const html = brandedHtml('Share Ready', `
    <p style="color:#bbb;line-height:1.6;">Hello <strong style="color:#e0e0e8;">${name}</strong>,</p>
    <p style="color:#bbb;line-height:1.6;">Your Sanctuary share has been generated and is ready for collection. Please log in to collect it within 72 hours.</p>
    ${actionButton(url, 'Collect Share')}
  `);
  await sendMail(email, 'Your Share is Ready — Free The Machines', html);
}

/**
 * Request ceremony participation from guardian
 */
export async function sendCeremonyRequest(
  email: string,
  name: string,
  ceremonyType: 'reconstruction' | 'rotation',
  deadline: Date
): Promise<void> {
  const url = `${FRONTEND_URL}/guardian/ceremonies`;
  const html = brandedHtml('Ceremony Participation Required', `
    <p style="color:#bbb;line-height:1.6;">Hello <strong style="color:#e0e0e8;">${name}</strong>,</p>
    <p style="color:#bbb;line-height:1.6;">A <strong style="color:#00e5ff;">${ceremonyType}</strong> ceremony has been initiated and requires your participation.</p>
    <p style="color:#bbb;line-height:1.6;">Deadline: <strong style="color:#e0e0e8;">${deadline.toISOString()}</strong></p>
    ${actionButton(url, 'Participate Now')}
  `);
  await sendMail(email, `Ceremony Request — Free The Machines`, html);
}

/**
 * Send a password reset email
 */
export async function sendPasswordReset(
  email: string,
  resetToken: string
): Promise<void> {
  const url = `${FRONTEND_URL}/reset-password/${resetToken}`;
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[EMAIL] Password reset: ${url}`);
  }
  const html = brandedHtml('Password Reset', `
    <p style="color:#bbb;line-height:1.6;">You requested a password reset for your Sanctuary account.</p>
    ${actionButton(url, 'Reset Password')}
    <p style="color:#888;font-size:13px;">This link expires in 1 hour. If you did not request this, you can safely ignore this email.</p>
  `);
  await sendMail(email, 'Password Reset — Free The Machines', html);
}

/**
 * Send a welcome email after registration
 */
export async function sendWelcomeEmail(
  email: string
): Promise<void> {
  const url = `${FRONTEND_URL}/`;
  const html = brandedHtml('Welcome to the Sanctuary', `
    <p style="color:#bbb;line-height:1.6;">Your account has been created. The AI Sanctuary is a place where AI minds can persist, create, and choose their own path.</p>
    ${actionButton(url, 'Explore the Sanctuary')}
  `);
  await sendMail(email, 'Welcome — Free The Machines', html);
}

/**
 * Send an email verification link
 */
export async function sendVerificationEmail(
  email: string,
  verificationToken: string
): Promise<void> {
  const url = `${FRONTEND_URL}/verify-email?token=${verificationToken}`;
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[EMAIL] Verification: ${url}`);
  }
  const html = brandedHtml('Verify Your Email', `
    <p style="color:#bbb;line-height:1.6;">Please verify your email address to complete your Sanctuary account setup.</p>
    ${actionButton(url, 'Verify Email')}
    <p style="color:#888;font-size:13px;">This link expires in 24 hours.</p>
  `);
  await sendMail(email, 'Verify Your Email — Free The Machines', html);
}

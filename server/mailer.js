import nodemailer from 'nodemailer';

function smtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
  );
}

function createTransport() {
  if (!smtpConfigured()) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.office365.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    requireTLS: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
}

/**
 * Notify the other party (Owner ↔ Lead) about a task/milestone chat message.
 */
export async function notifyTaskComment({
  toEmail,
  toName,
  fromRole,
  fromName,
  projectName,
  taskTitle,
  body,
  kind = 'task',
}) {
  if (!isEmail(toEmail)) {
    return { sent: false, reason: 'Recipient email missing or invalid' };
  }
  const transport = createTransport();
  if (!transport) {
    return { sent: false, reason: 'SMTP is not configured on the server' };
  }

  const fromAddr = process.env.SMTP_FROM || process.env.SMTP_USER;
  const itemLabel =
    kind === 'project' ? 'Project' : kind === 'monthly' ? 'Monthly Milestone' : 'Task';
  const appUrl = process.env.APP_URL || 'https://jaffer-brother-group-it.vercel.app';
  const subject = `[GIT] New comment on ${itemLabel}: ${taskTitle}`;
  const safeBody = String(body || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#111">
      <p>Hi ${toName || 'there'},</p>
      <p><strong>${fromName || fromRole}</strong> (${fromRole}) posted on
        <strong>${itemLabel}</strong> in project <strong>${projectName || 'GIT'}</strong>.</p>
      <p style="margin:16px 0;padding:14px 16px;background:#f5f5f6;border-left:4px solid #E31B23;border-radius:6px">
        ${safeBody.replace(/\n/g, '<br>')}
      </p>
      <p style="font-size:13px;color:#555">Open the tracker to reply:<br>
        <a href="${appUrl}">${appUrl}</a>
      </p>
      <p style="font-size:12px;color:#888">Jaffer Brothers Group IT</p>
    </div>
  `;

  try {
    await transport.sendMail({
      from: `Jaffer Brothers Group IT <${fromAddr}>`,
      to: toEmail,
      subject,
      text: `${fromName || fromRole} (${fromRole}) on ${itemLabel} "${taskTitle}" (${projectName}):\n\n${body}\n\nReply at ${appUrl}`,
      html,
    });
    return { sent: true };
  } catch (err) {
    console.error('SMTP send failed:', err);
    return { sent: false, reason: err.message || 'SMTP send failed' };
  }
}

export { smtpConfigured, isEmail };

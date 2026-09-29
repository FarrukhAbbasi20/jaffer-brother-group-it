import nodemailer from 'nodemailer';

/* ---------- Microsoft Graph (Microsoft 365) sender ----------
 * Used when GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET and GRAPH_SENDER are set in .env.
 * The Azure app needs the APPLICATION permission Mail.Send with admin consent; restrict it to the
 * sender mailbox with an Exchange application access policy. Mail is sent as GRAPH_SENDER. */
function graphConfigured() {
  return Boolean(process.env.GRAPH_TENANT_ID && process.env.GRAPH_CLIENT_ID && process.env.GRAPH_CLIENT_SECRET && process.env.GRAPH_SENDER);
}
let graphToken = { value: '', exp: 0 };
async function graphAccessToken() {
  if (graphToken.value && Date.now() < graphToken.exp - 60000) return graphToken.value;
  const url = `https://login.microsoftonline.com/${encodeURIComponent(process.env.GRAPH_TENANT_ID)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({ client_id: process.env.GRAPH_CLIENT_ID, client_secret: process.env.GRAPH_CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' });
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new Error(json.error_description || json.error || `token request failed (${res.status})`);
  graphToken = { value: json.access_token, exp: Date.now() + (Number(json.expires_in) || 3600) * 1000 };
  return graphToken.value;
}
export async function graphSendMail({ to, subject, text, html, replyTo }) {
  const token = await graphAccessToken();
  const sender = process.env.GRAPH_SENDER;
  const message = {
    subject,
    body: { contentType: html ? 'HTML' : 'Text', content: html || text || '' },
    toRecipients: [].concat(to).filter(Boolean).map((a) => ({ emailAddress: { address: String(a).trim() } })),
    from: { emailAddress: { address: sender, name: process.env.GRAPH_SENDER_NAME || 'Jaffer Brothers Group IT' } },
  };
  if (replyTo) message.replyTo = [{ emailAddress: { address: replyTo } }];
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message, saveToSentItems: true }),
  });
  if (res.status !== 202) { const err = await res.json().catch(() => ({})); throw new Error(err?.error?.message || `Graph sendMail failed (${res.status})`); }
  return { sent: true, via: 'graph' };
}

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
  const transport = graphConfigured() ? null : createTransport();
  if (!graphConfigured() && !transport) {
    return { sent: false, reason: 'No mail sender is configured on the server (Graph or SMTP)' };
  }

  const fromAddr = graphConfigured() ? process.env.GRAPH_SENDER : (process.env.SMTP_FROM || process.env.SMTP_USER);
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

  const text = `${fromName || fromRole} (${fromRole}) on ${itemLabel} "${taskTitle}" (${projectName}):\n\n${body}\n\nReply at ${appUrl}`;
  try {
    if (graphConfigured()) return await graphSendMail({ to: toEmail, subject, text, html });
    await transport.sendMail({ from: `Jaffer Brothers Group IT <${fromAddr}>`, to: toEmail, subject, text, html });
    return { sent: true, via: 'smtp' };
  } catch (err) {
    console.error('mail send failed:', err);
    return { sent: false, reason: err.message || 'mail send failed' };
  }
}

export { smtpConfigured, graphConfigured, isEmail };

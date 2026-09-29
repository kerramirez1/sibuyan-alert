import nodemailer from 'nodemailer';

/**
 * The approved product name.
 *
 * One constant for the sender display name, the subject lines and the body
 * wordmark, because the three had already drifted apart: the product was renamed
 * to "Sibuyan Alert" while every transactional email still announced "Sibuyan
 * Accident Alert" — including the sender name a recipient sees in their inbox
 * before they open anything.
 *
 * The SMTP account address is deliberately NOT part of this. The mailbox the
 * messages are sent from is unchanged; only the name shown beside it is.
 */
export const PRODUCT_NAME = 'Sibuyan Alert';

// MVP: email is optional. Password reset degrades gracefully when SMTP is
// not configured (see isEmailConfigured + forgotPassword handler).
export const isEmailConfigured = () => Boolean(
  process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim()
);

// Gmail app passwords are 16 continuous characters — pasting them with
// spaces (as Google displays them) makes SMTP auth fail with a 535.
// Normalize once so `SMTP_PASS="abcd efgh ..."` just works.
export const getSmtpConfig = () => ({
  host: (process.env.SMTP_HOST || 'smtp.gmail.com').trim(),
  port: parseInt(process.env.SMTP_PORT, 10) || 587,
  user: (process.env.SMTP_USER || '').trim(),
  pass: (process.env.SMTP_PASS || '').replace(/\s+/g, ''),
});

// Create transporter
const createTransporter = () => {
  const config = getSmtpConfig();
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: false, // true for 465, false for other ports
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
};

// Verifies SMTP credentials at boot so a bad app password is visible in the
// logs immediately instead of surfacing as silent forgot-password failures.
export const verifyEmailTransport = async () => {
  if (!isEmailConfigured()) return { success: false, skipped: true };
  try {
    const transporter = createTransporter();
    await transporter.verify();
    console.log('✅ Email service ready (SMTP verified)');
    return { success: true };
  } catch (error) {
    console.error(`❌ Email service misconfigured: ${error?.message || error} (check SMTP_USER/SMTP_PASS app password)`);
    return { success: false, error: error?.message };
  }
};

/**
 * Bare, comparable form of a mail address.
 *
 * Nodemailer reports `accepted`/`rejected` as bare addresses (`x@y.com`) while a
 * caller passes whatever it built, which may carry a display name
 * (`Name <x@y.com>`). Comparing the two without normalising them would make an
 * accepted recipient look missing.
 */
const normalizeMailAddress = (value) => {
  const raw = String(value ?? '').trim().toLowerCase();
  const angled = raw.match(/<([^>]+)>/);
  return (angled ? angled[1] : raw).trim();
};

/**
 * `j***@example.com` — enough to confirm which address was attempted, not enough
 * to be a contact record. The privacy policy covers email as account data but
 * says nothing about writing it to logs, so logs get the masked form only.
 */
export const maskMailAddress = (value) => {
  const address = normalizeMailAddress(value);
  const at = address.indexOf('@');
  if (at <= 0) return address ? '***' : '';
  return `${address[0]}***${address.slice(at)}`;
};

/**
 * A readable plain-text rendering of an HTML email body.
 *
 * The previous fallback was `html.replace(/<[^>]*>/g, '')`, which strips tags but
 * leaves the CONTENTS of `<style>` and `<script>` blocks. Every message the app
 * sent therefore opened its text/plain part with roughly a kilobyte of CSS
 * declarations. Captured from the real invitation: 2351 bytes, of which the first
 * ~1000 were `body { ... }`, `.container { ... }`, `.header { ... }` and so on.
 *
 * Neither consequence is cosmetic. Mail filters score a text/plain part dense
 * with code-like tokens as suspicious — it is the shape of an obfuscated payload —
 * and a screen reader or text-only client received a stylesheet instead of the
 * invitation, with the actual message buried below it.
 *
 * Block boundaries become newlines first, so the result reads as lines rather
 * than one run-together paragraph. `&amp;` is decoded last so a literal `&lt;`
 * in the source is not decoded twice.
 */
export const htmlToPlainText = (html) => {
  if (typeof html !== 'string' || !html) return '';

  return html
    // Style and script CONTENT is never message text.
    .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    // Block boundaries become line breaks before the tags are removed.
    .replace(/<\/(p|div|h[1-6]|li|tr|ul|ol|blockquote|table)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

/**
 * Send email notification
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} [options.text] - Plain text content
 * @param {Object} [options.headers] - Extra RFC 5322 headers (e.g. List-Unsubscribe); derived from `html` when absent
 *
 * Resolving is NOT delivering. `sendMail` resolves once the SMTP transaction
 * completes, and `info.accepted` / `info.rejected` are the transport's own
 * verdict per recipient. The original version returned `success: true` for any
 * resolved send and discarded both lists, so a message the mail server refused
 * for the intended address still read as delivered — the responder received
 * nothing while the administrator was told the invitation had been sent.
 *
 * ## Why an absent recipient list is a FAILURE, not a pass
 *
 * Nodemailer's SMTP transport always reports both lists. `smtp-connection`'s
 * `_actionDATA` builds `{ accepted, rejected }` and that object is what
 * `send()` hands back as `info`; and DATA is only reached when
 * `rejected.length < to.length`, so a completed send always has at least one
 * entry in `accepted`. Verified against nodemailer 9.0.3 in node_modules.
 *
 * So "no lists" and "empty accepted" are not legitimate outcomes for the
 * configured transport — they mean acceptance could not be confirmed. Treating
 * them as success is exactly the false positive that let a dead invitation read
 * as sent, so they are reported as an explicit indeterminate state instead.
 *
 * This function reports SMTP acceptance only. A provider that accepts at RCPT
 * TO and bounces later cannot be detected here — see `DELIVERY_UNCONFIRMED` in
 * the caller for what that means to an administrator.
 */
export const sendEmail = async (options) => {
  // Derived before the try so the catch can classify a rejection too — the
  // throw happens before these would otherwise be assigned.
  const intended = normalizeMailAddress(options.to);
  const recipient = maskMailAddress(options.to);

  if (!isEmailConfigured()) {
    console.warn('Email skipped: SMTP is not configured (set SMTP_HOST/SMTP_USER/SMTP_PASS to enable password reset emails)');
    return { success: false, code: 'EMAIL_NOT_CONFIGURED', error: 'Email delivery is not configured' };
  }
  try {
    const transporter = createTransporter();
    // The SAME normalised identity that authenticates. Reading the raw env var
    // here instead meant a `SMTP_USER` with a stray space or newline — easy to
    // paste into a Heroku config var or a .env — authenticated as
    // `alerts@x.com` while the From header said `<alerts@x.com >`. Gmail relays
    // only for the account it authenticated, so the two must not be able to
    // diverge.
    const senderAddress = getSmtpConfig().user;

    const mailOptions = {
      from: `"${PRODUCT_NAME}" <${senderAddress}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || htmlToPlainText(options.html),
      // Custom headers are the caller's: List-Unsubscribe for the invitation,
      // nothing for the rest. Nodemailer rejects header values containing
      // newlines, so a smuggled second header cannot pass through here.
      ...(options.headers ? { headers: options.headers } : {}),
    };

    const info = await transporter.sendMail(mailOptions);

    const messageId = info?.messageId || null;
    const accepted = Array.isArray(info?.accepted) ? info.accepted.map(normalizeMailAddress) : null;
    const rejected = Array.isArray(info?.rejected) ? info.rejected.map(normalizeMailAddress) : null;

    // `messageId` is the correlation handle: it is what a provider's logs and a
    // bounce report can be matched against. It carries no secret.
    const context = `recipient=${recipient} messageId=${messageId || 'none'}`;

    if (!accepted || !rejected || (accepted.length === 0 && rejected.length === 0)) {
      console.error(`[email] DELIVERY_UNCONFIRMED ${context}: transport reported no recipient verdict`);
      return {
        success: false,
        code: 'DELIVERY_UNCONFIRMED',
        messageId,
        accepted: accepted || [],
        rejected: rejected || [],
        error: 'The mail server did not confirm whether it accepted the recipient',
      };
    }

    if (accepted.length === 0 || (intended && !accepted.includes(intended))) {
      console.error(`[email] RECIPIENT_REJECTED ${context}: accepted=${accepted.length} rejected=${rejected.length}`);
      return {
        success: false,
        code: 'RECIPIENT_REJECTED',
        messageId,
        accepted,
        rejected,
        // No address is echoed back: this string reaches an administrator and
        // may end up in a log, and the recipient list is not ours to expose.
        error: 'The mail server did not accept the recipient address',
      };
    }

    // The transport's own final response and the envelope it actually used.
    //
    // This is the evidence that separates "the transport took it" from "the
    // provider relayed it". `response` is the SMTP server's last line (for Gmail,
    // `250 2.0.0 OK <id> - gsmtp`), and `envelopeFrom` shows the sender address
    // the envelope carried — which is what reveals a From header that does not
    // match the authenticated account. Neither carries a secret, and the
    // recipient is logged only in its masked form.
    const envelopeFrom = info?.envelope?.from ? normalizeMailAddress(info.envelope.from) : 'unknown';
    const transportResponse = typeof info?.response === 'string' ? info.response.slice(0, 200) : 'none';

    console.log(
      `[email] accepted recipient=${recipient} messageId=${messageId || 'none'} `
      + `envelopeFrom=${envelopeFrom} response="${transportResponse}"`,
    );
    return { success: true, messageId, accepted, rejected };
  } catch (error) {
    // A rejection of EVERY recipient makes Nodemailer THROW instead of resolve:
    // `smtp-connection._actionRCPT` reports `EENVELOPE` ("all recipients were
    // rejected") and hangs the rejected list off the error. With the single
    // recipient these flows use, that is the ordinary rejection path — so
    // classifying it here is what actually reaches an administrator.
    //
    // Without this, a rejected address surfaced as a generic `SMTP_ERROR` ("the
    // mail server did not accept the message") and the RECIPIENT_REJECTED branch
    // in the caller was unreachable, so nobody was ever told to check the address.
    const rejectedList = Array.isArray(error?.rejected)
      ? error.rejected.map(normalizeMailAddress)
      : [];
    const intendedRejected = rejectedList.length > 0
      && (!intended || rejectedList.includes(intended));

    if (error?.code === 'EENVELOPE' && intendedRejected) {
      console.error(`[email] RECIPIENT_REJECTED recipient=${recipient} (transport threw EENVELOPE, rejected=${rejectedList.length})`);
      return {
        success: false,
        code: 'RECIPIENT_REJECTED',
        messageId: null,
        accepted: [],
        rejected: rejectedList,
        // No address echoed back — this string reaches an administrator.
        error: 'The mail server did not accept the recipient address',
      };
    }

    console.error('❌ Email error:', error);
    return { success: false, code: 'SMTP_ERROR', error: error.message };
  }
};

/**
 * Send reporter verification notification
 */
export const sendVerificationEmail = async (user, status, feedback = '') => {
  const isApproved = status === 'approved';

  const subject = isApproved
    ? 'Your Reporter Account Has Been Verified'
    : 'Reporter Verification Update';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f5; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: ${isApproved ? 'linear-gradient(135deg, #10B981, #059669)' : 'linear-gradient(135deg, #EF4444, #DC2626)'}; color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { padding: 30px; }
        .status-badge { display: inline-block; padding: 8px 16px; border-radius: 20px; font-weight: bold; margin: 20px 0; background: ${isApproved ? '#D1FAE5' : '#FEE2E2'}; color: ${isApproved ? '#065F46' : '#991B1B'}; }
        .message { color: #374151; line-height: 1.6; }
        .feedback { background: #F3F4F6; border-left: 4px solid ${isApproved ? '#10B981' : '#EF4444'}; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0; }
        .button { display: inline-block; background: #2563EB; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-top: 20px; }
        .footer { padding: 20px; text-align: center; color: #6B7280; font-size: 14px; border-top: 1px solid #E5E7EB; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${isApproved ? '🎉 Account Verified!' : '⚠️ Verification Update'}</h1>
        </div>
        <div class="content">
          <p class="message">Hello <strong>${user.name}</strong>,</p>
          <div class="status-badge">${isApproved ? '✓ APPROVED' : '✗ REJECTED'}</div>
          <p class="message">
            ${isApproved
      ? `Your reporter account has been verified! You can now submit accident reports on the ${PRODUCT_NAME} platform.`
      : 'Unfortunately, your reporter verification request was not approved at this time.'}
          </p>
          ${feedback ? `
            <div class="feedback">
              <strong>Admin Feedback:</strong><br>
              ${feedback}
            </div>
          ` : ''}
          ${isApproved ? `
            <a href="${process.env.CLIENT_URL}/report" class="button">Start Reporting</a>
          ` : `
            <p class="message">You may update your ID document and resubmit your verification request.</p>
            <a href="${process.env.CLIENT_URL}/login" class="button">Login to Resubmit</a>
          `}
        </div>
        <div class="footer">
          <p>${PRODUCT_NAME}</p>
          <p>Keeping Sibuyan Island safe together</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: user.email,
    subject,
    html,
  });
};

/**
 * Send report status notification
 */
export const sendReportStatusEmail = async (user, report, status, feedback = '') => {
  const isVerified = status === 'verified';

  const subject = isVerified
    ? 'Your Accident Report Has Been Verified'
    : 'Accident Report Update';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f5; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: ${isVerified ? 'linear-gradient(135deg, #10B981, #059669)' : 'linear-gradient(135deg, #F59E0B, #D97706)'}; color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { padding: 30px; }
        .report-card { background: #F9FAFB; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .report-card h3 { margin: 0 0 10px 0; color: #1F2937; }
        .report-detail { color: #6B7280; margin: 5px 0; }
        .status-badge { display: inline-block; padding: 8px 16px; border-radius: 20px; font-weight: bold; background: ${isVerified ? '#D1FAE5' : '#FEF3C7'}; color: ${isVerified ? '#065F46' : '#92400E'}; }
        .message { color: #374151; line-height: 1.6; }
        .feedback { background: #F3F4F6; border-left: 4px solid ${isVerified ? '#10B981' : '#F59E0B'}; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0; }
        .button { display: inline-block; background: #2563EB; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-top: 20px; }
        .footer { padding: 20px; text-align: center; color: #6B7280; font-size: 14px; border-top: 1px solid #E5E7EB; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${isVerified ? '🗺️ Report Published!' : '📝 Report Status Update'}</h1>
        </div>
        <div class="content">
          <p class="message">Hello <strong>${user.name}</strong>,</p>
          <div class="report-card">
            <h3>Report #${report._id.toString().slice(-8).toUpperCase()}</h3>
            <p class="report-detail">📍 ${report.address}</p>
            <p class="report-detail">🕐 ${new Date(report.accidentTime).toLocaleString()}</p>
            <p class="report-detail">
              Status: <span class="status-badge">${status.toUpperCase()}</span>
            </p>
          </div>
          <p class="message">
            ${isVerified
      ? 'Your accident report has been verified and is now visible on the public map.'
      : 'Your accident report was not verified. Please see the feedback below.'}
          </p>
          ${feedback ? `
            <div class="feedback">
              <strong>Admin Feedback:</strong><br>
              ${feedback}
            </div>
          ` : ''}
          <a href="${process.env.CLIENT_URL}/dashboard" class="button">View on Map</a>
        </div>
        <div class="footer">
          <p>${PRODUCT_NAME}</p>
          <p>Thank you for helping keep Sibuyan Island safe!</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: user.email,
    subject,
    html,
  });
};

/**
 * Send new accident alert email (for admins)
 */
export const sendNewReportAlertEmail = async (adminEmail, report, reporter) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f5; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #EF4444, #DC2626); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { padding: 30px; }
        .alert-badge { display: inline-block; padding: 8px 16px; border-radius: 20px; font-weight: bold; background: #FEE2E2; color: #991B1B; margin-bottom: 20px; }
        .report-card { background: #F9FAFB; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .report-card h3 { margin: 0 0 15px 0; color: #1F2937; }
        .report-detail { color: #374151; margin: 10px 0; display: flex; align-items: center; gap: 10px; }
        .report-detail span { color: #6B7280; }
        .description { background: white; border: 1px solid #E5E7EB; border-radius: 8px; padding: 15px; margin-top: 15px; }
        .button { display: inline-block; background: #DC2626; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-top: 20px; }
        .footer { padding: 20px; text-align: center; color: #6B7280; font-size: 14px; border-top: 1px solid #E5E7EB; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🚨 New Accident Report</h1>
        </div>
        <div class="content">
          <span class="alert-badge">⚠️ PENDING VERIFICATION</span>
          <div class="report-card">
            <h3>Report Details</h3>
            <div class="report-detail">
              <strong>📍 Location:</strong>
              <span>${report.address}</span>
            </div>
            <div class="report-detail">
              <strong>🕐 Time:</strong>
              <span>${new Date(report.accidentTime).toLocaleString()}</span>
            </div>
            <div class="report-detail">
              <strong>👤 Reporter:</strong>
              <span>${reporter.name} (${reporter.email})</span>
            </div>
            <div class="report-detail">
              <strong>📐 Coordinates:</strong>
              <span>${report.coordinates?.lat?.toFixed?.(6) ?? 'unknown'}, ${report.coordinates?.lng?.toFixed?.(6) ?? 'unknown'}</span>
            </div>
            <div class="description">
              <strong>Description:</strong><br>
              ${report.description}
            </div>
          </div>
          <a href="${process.env.CLIENT_URL}/admin/reports/${report._id}" class="button">Review Report</a>
        </div>
        <div class="footer">
          <p>${PRODUCT_NAME} - Admin Notification</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: adminEmail,
    subject: `New Accident Report - ${report.address}`,
    html,
  });
};

/**
 * Send password reset email
 */
export const sendPasswordResetEmail = async (email, name, resetUrl) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f5; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #3B82F6, #2563EB); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { padding: 30px; }
        .message { color: #374151; line-height: 1.6; margin-bottom: 20px; }
        .warning { background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0; color: #92400E; }
        .button { display: inline-block; background: #3B82F6; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; margin: 20px 0; font-weight: bold; }
        .button:hover { background: #2563EB; }
        .footer { padding: 20px; text-align: center; color: #6B7280; font-size: 14px; border-top: 1px solid #E5E7EB; }
        .expiry { color: #6B7280; font-size: 14px; margin-top: 15px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔐 Password Reset Request</h1>
        </div>
        <div class="content">
          <p class="message">Hello <strong>${name}</strong>,</p>
          <p class="message">
            We received a request to reset your password for your ${PRODUCT_NAME} account.
          </p>
          <p class="message">
            Click the button below to reset your password:
          </p>
          <a href="${resetUrl}" class="button">Reset Password</a>
          <p class="expiry">⏱️ This link will expire in 1 hour</p>
          <div class="warning">
            <strong>⚠️ Security Notice:</strong><br>
            If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
          </div>
          <p class="message">
            If the button doesn't work, copy and paste this link into your browser:
          </p>
          <p style="word-break: break-all; color: #3B82F6; font-size: 12px;">
            ${resetUrl}
          </p>
        </div>
        <div class="footer">
          <p>${PRODUCT_NAME}</p>
          <p>Keeping Sibuyan Island safe together</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: `🔐 Password Reset Request - ${PRODUCT_NAME}`,
    html,
  });
};

/**
 * Invitation for a responder account a municipal administrator just created.
 *
 * The account is provisioned with NO password, and sign-in already refuses an
 * account that has none — so this link is the only way in, and nothing about the
 * account is usable until it is followed. The token is the same single-use,
 * time-limited one the reset flow issues, which is why the copy says "set your
 * password" rather than "reset it": there is no old password to replace.
 *
 * Deliberately no credential is included, because none exists to include.
 */
export const sendResponderInvitationEmail = async (
  email,
  name,
  inviteUrl,
  { municipality = '', agency = '', invitedBy = '' } = {},
) => {
  const context = [
    municipality ? `<li><strong>Municipality:</strong> ${municipality}</li>` : '',
    agency ? `<li><strong>Unit type:</strong> ${agency}</li>` : '',
    invitedBy ? `<li><strong>Added by:</strong> ${invitedBy}</li>` : '',
  ].filter(Boolean).join('');

  // Who invited them, in a sentence — not only as a list row. "You have been
  // added" with no named source is the shape of a phishing mail; a named
  // municipal administrator is the detail that makes it checkable.
  const invitedBySentence = invitedBy
    ? `${invitedBy} has created a responder account for you`
    : 'A municipal administrator has created a responder account for you';

  // Written by hand rather than derived from the HTML. The link goes on its own
  // line, the details are one per line, and nothing decorative is carried over.
  const text = [
    PRODUCT_NAME,
    '',
    `Hello ${name},`,
    '',
    `${invitedBySentence} on the ${PRODUCT_NAME} system${municipality ? ` for ${municipality}` : ''}.`,
    '',
    ...(municipality ? [`  Municipality: ${municipality}`] : []),
    ...(agency ? [`  Unit type: ${agency}`] : []),
    ...(invitedBy ? [`  Added by: ${invitedBy}`] : []),
    ...(municipality || agency || invitedBy ? [''] : []),
    'Set your own password to activate the account. Open this link:',
    '',
    inviteUrl,
    '',
    'This link can only be used once and expires in 1 hour.',
    '',
    'The account cannot be signed into until you set a password. If this invitation expires, ask your municipal administrator to send a new one.',
    '',
    'If you were not expecting this invitation, you can ignore this email.',
    '',
    PRODUCT_NAME,
  ].join('\n');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f5; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #3B82F6, #2563EB); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { padding: 30px; }
        .message { color: #374151; line-height: 1.6; margin-bottom: 20px; }
        .details { background: #F9FAFB; border-radius: 8px; padding: 15px 15px 15px 35px; margin: 20px 0; color: #374151; line-height: 1.8; }
        .warning { background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0; color: #92400E; }
        .button { display: inline-block; background: #3B82F6; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; margin: 20px 0; font-weight: bold; }
        .button:hover { background: #2563EB; }
        .footer { padding: 20px; text-align: center; color: #6B7280; font-size: 14px; border-top: 1px solid #E5E7EB; }
        .expiry { color: #6B7280; font-size: 14px; margin-top: 15px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🚑 Responder Account Invitation</h1>
        </div>
        <div class="content">
          <p class="message">Hello <strong>${name}</strong>,</p>
          <p class="message">
            ${invitedBySentence} on the ${PRODUCT_NAME} system${municipality ? ` for ${municipality}` : ''}.
          </p>
          ${context ? `<ul class="details">${context}</ul>` : ''}
          <p class="message">
            Set your own password to activate the account:
          </p>
          <a href="${inviteUrl}" class="button">Set My Password</a>
          <p class="expiry">⏱️ This link can only be used once and expires in 1 hour</p>
          <div class="warning">
            <strong>⚠️ Before you set a password:</strong><br>
            The account cannot be signed into until you do. If this invitation expires, ask your municipal administrator to send a new one.
          </div>
          <p class="message">
            If the button doesn't work, copy and paste this link into your browser:
          </p>
          <p style="word-break: break-all; color: #3B82F6; font-size: 12px;">
            ${inviteUrl}
          </p>
        </div>
        <div class="footer">
          <p>${PRODUCT_NAME}</p>
          <p>Keeping Sibuyan Island safe together</p>
        </div>
      </div>
    </body>
    </html>
  `;

  // One spam-score lever that costs nothing: a List-Unsubscribe header. Gmail
  // and Outlook weigh its presence when deciding inbox vs spam, and it lets a
  // recipient's "unsubscribe" action resolve without becoming a spam complaint
  // (complaints hurt the sender reputation every future invitation relies on).
  // Only the mailto form: a one-click URL would need a real endpoint behind
  // it, and at this volume — per-responder invitations, not bulk mail — there
  // is no endpoint to build. A dead URL would be worse than none.
  const senderMailbox = getSmtpConfig().user;

  return sendEmail({
    to: email,
    // No emoji in the subject. It carries no meaning a reader needs, and a
    // decorative pictograph in front of a credential-setting call to action is a
    // small but free contribution to a spam score.
    subject: `Responder account invitation - ${PRODUCT_NAME}`,
    html,
    text,
    ...(senderMailbox
      ? { headers: { 'List-Unsubscribe': `<mailto:${senderMailbox}?subject=Unsubscribe>` } }
      : {}),
  });
};

export default {
  isEmailConfigured,
  getSmtpConfig,
  verifyEmailTransport,
  sendEmail,
  sendVerificationEmail,
  sendReportStatusEmail,
  sendNewReportAlertEmail,
  sendPasswordResetEmail,
  sendResponderInvitationEmail,
};

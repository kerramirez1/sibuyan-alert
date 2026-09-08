import nodemailer from 'nodemailer';

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
 * Send email notification
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} [options.text] - Plain text content
 */
export const sendEmail = async (options) => {
  if (!isEmailConfigured()) {
    console.warn('Email skipped: SMTP is not configured (set SMTP_HOST/SMTP_USER/SMTP_PASS to enable password reset emails)');
    return { success: false, error: 'Email delivery is not configured' };
  }
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"Sibuyan Accident Alert" <${process.env.SMTP_USER}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]*>/g, ''),
    };

    const info = await transporter.sendMail(mailOptions);

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Email error:', error);
    return { success: false, error: error.message };
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
      ? 'Your reporter account has been verified! You can now submit accident reports on the Sibuyan Accident Alert platform.'
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
          <p>Sibuyan Accident Alert System</p>
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
          <p>Sibuyan Accident Alert System</p>
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
          <p>Sibuyan Accident Alert - Admin Notification</p>
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
            We received a request to reset your password for your Sibuyan Accident Alert account.
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
          <p>Sibuyan Accident Alert System</p>
          <p>Keeping Sibuyan Island safe together</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: '🔐 Password Reset Request - Sibuyan Accident Alert',
    html,
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
};

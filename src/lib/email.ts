import { Resend } from "resend"

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "PolyWiz"
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3025"
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "noreply@polymash.com"

let _resend: Resend | null = null
function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY
    if (!key) throw new Error("RESEND_API_KEY is not set")
    _resend = new Resend(key)
  }
  return _resend
}

export async function sendPasswordResetEmail(
  email: string,
  token: string
): Promise<boolean> {
  const resetUrl = `${APP_URL}/reset-password?token=${token}`

  try {
    const { error } = await getResend().emails.send({
      from: `${APP_NAME} <${FROM_EMAIL}>`,
      to: email,
      subject: `Reset your ${APP_NAME} password`,
      html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

        <!-- Header with brand color -->
        <tr><td style="background-color:#0399FE;padding:28px 32px;text-align:center;">
          <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">✦ ${APP_NAME}</span>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px 32px 16px;">
          <h1 style="margin:0 0 12px;font-size:20px;font-weight:600;color:#18181b;">Reset your password</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#52525b;">
            We received a request to reset the password for your ${APP_NAME} account. Click the button below to choose a new password.
          </p>

          <!-- Bulletproof button (works in all email clients) -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
            <tr><td align="center" style="background-color:#0399FE;border-radius:8px;">
              <a href="${resetUrl}" target="_blank"
                 style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.2px;">
                Reset Password
              </a>
            </td></tr>
          </table>

          <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#a1a1aa;">
            This link expires in 1 hour. If you didn't request this reset, you can safely ignore this email — your password won't be changed.
          </p>
        </td></tr>

        <!-- Fallback link -->
        <tr><td style="padding:0 32px 24px;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:#a1a1aa;">
            Button not working? Copy and paste this link into your browser:<br/>
            <a href="${resetUrl}" style="color:#0399FE;word-break:break-all;font-size:11px;">${resetUrl}</a>
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 32px;border-top:1px solid #f0f0f0;text-align:center;">
          <p style="margin:0;font-size:12px;color:#d4d4d8;">
            ${APP_NAME} by Polymash Design
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
      `,
    })

    if (error) {
      console.error("Failed to send password reset email:", error)
      return false
    }

    return true
  } catch (err) {
    console.error("Email send error:", err)
    return false
  }
}

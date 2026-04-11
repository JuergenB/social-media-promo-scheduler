import { NextResponse } from "next/server"
import { sendPasswordResetEmail } from "@/lib/email"

/**
 * GET /api/auth/test-email
 * Temporary diagnostic endpoint — tests Resend email delivery.
 * Returns detailed diagnostics instead of swallowing errors.
 * DELETE THIS FILE after confirming email works in production.
 */
export async function GET() {
  const diagnostics: Record<string, unknown> = {
    RESEND_API_KEY_SET: !!process.env.RESEND_API_KEY,
    RESEND_API_KEY_PREFIX: process.env.RESEND_API_KEY?.slice(0, 6) || "EMPTY",
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL || "NOT SET",
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "NOT SET",
  }

  // Test using our actual wrapper function
  try {
    const sent = await sendPasswordResetEmail(
      "juergen@polymash.com",
      "diagnostic-test-token"
    )
    diagnostics.emailSent = sent
    diagnostics.wrapperUsed = true
  } catch (err) {
    diagnostics.emailSent = false
    diagnostics.error = err instanceof Error ? err.message : String(err)
    diagnostics.stack = err instanceof Error ? err.stack?.split("\n").slice(0, 3) : undefined
  }

  return NextResponse.json(diagnostics)
}

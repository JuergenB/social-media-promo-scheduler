import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { storeResetToken } from "@/lib/airtable/client"
import { sendPasswordResetEmail } from "@/lib/email"

export async function POST(request: NextRequest) {
  const { email } = await request.json()

  if (!email || typeof email !== "string") {
    // Always return success to prevent email enumeration
    return NextResponse.json({ ok: true })
  }

  const token = crypto.randomBytes(32).toString("hex")
  const stored = await storeResetToken(email.toLowerCase().trim(), token)

  if (stored) {
    const sent = await sendPasswordResetEmail(email, token)
    console.log(`[forgot-password] email=${email} stored=${stored} sent=${sent} resendKeySet=${!!process.env.RESEND_API_KEY} appUrl=${process.env.NEXT_PUBLIC_APP_URL}`)
  } else {
    console.log(`[forgot-password] email=${email} stored=false (user not found)`)
  }

  // Always return success regardless of whether the email exists
  return NextResponse.json({ ok: true })
}

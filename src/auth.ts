import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { fetchUserByEmail } from "@/lib/airtable/client"
import type { UserRole } from "@/lib/airtable/types"

export type { UserRole }

declare module "next-auth" {
  interface User {
    displayName?: string
    role?: UserRole
    allowedBrandIds?: string[]
    defaultBrandId?: string | null
  }
  interface Session {
    user: User & { email?: string | null; name?: string | null; image?: string | null }
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    displayName?: string
    role?: UserRole
    allowedBrandIds?: string[]
    defaultBrandId?: string | null
  }
}

const users = (process.env.AUTH_USERS || "")
  .split(",")
  .filter(Boolean)
  .map((entry) => {
    const [id, email, password, displayName, role] = entry.split(":")
    return {
      id,
      email,
      password,
      displayName: displayName?.trim() || email?.split("@")[0] || "User",
      role: (role?.trim() as UserRole) || "viewer",
    }
  })

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const user = users.find(
          (u) =>
            u.email === credentials.email &&
            u.password === credentials.password
        )
        if (!user) return null

        // Fetch brand access from Airtable Users table
        const profile = await fetchUserByEmail(user.email)

        return {
          id: user.id,
          name: user.displayName,
          email: user.email,
          displayName: user.displayName,
          // Airtable role takes precedence, fall back to AUTH_USERS role
          role: profile?.role || user.role,
          allowedBrandIds: profile?.brandIds || [],
          defaultBrandId: profile?.defaultBrandId || null,
        }
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.displayName = (user as { displayName?: string }).displayName
        token.role = (user as { role?: UserRole }).role
        token.allowedBrandIds = (user as { allowedBrandIds?: string[] }).allowedBrandIds
        token.defaultBrandId = (user as { defaultBrandId?: string | null }).defaultBrandId
      }
      return token
    },
    async session({ session, token }) {
      if (token.displayName) {
        session.user.displayName = token.displayName as string
      }
      if (token.role) {
        session.user.role = token.role as UserRole
      }
      session.user.allowedBrandIds = (token.allowedBrandIds as string[]) || []
      session.user.defaultBrandId = (token.defaultBrandId as string | null) || null
      return session
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isLoginPage = nextUrl.pathname === "/login"
      const isAuthApi = nextUrl.pathname.startsWith("/api/auth")

      if (isAuthApi) return true
      if (isLoggedIn && isLoginPage) {
        return Response.redirect(new URL("/dashboard", nextUrl))
      }
      if (!isLoggedIn && !isLoginPage) {
        return Response.redirect(new URL("/login", nextUrl))
      }
      return true
    },
  },
})

import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"

export type UserRole = "admin" | "curator" | "viewer"

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
        return {
          id: user.id,
          name: user.displayName,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
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
        token.role = (user as { role?: string }).role
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

import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import Credentials from "next-auth/providers/credentials"

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "Dev Sign In",
      credentials: { name: { label: "Name", type: "text", placeholder: "Enter your name" } },
      async authorize(credentials) {
        if (credentials?.name && typeof credentials.name === "string" && credentials.name.trim()) {
          return { id: "1", name: credentials.name, email: `${credentials.name.replace(/\s+/g, ".").toLowerCase()}@dev.local` }
        }
        return null
      },
    }),
    Google({
      authorization: { params: { prompt: "consent", access_type: "offline", response_type: "code" } }
    }),
  ],
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/" },
  callbacks: {
    async jwt({ token, account }) {
      if (account) token.provider = account.provider
      return token
    },
    async session({ session, token }) {
      if (session.user) session.user.id = token.sub!
      return session
    }
  }
})

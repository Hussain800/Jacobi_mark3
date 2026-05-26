import NextAuth from "next-auth"
import Google from "next-auth/providers/google"

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google({
    authorization: { params: { prompt: "consent", access_type: "offline", response_type: "code" } }
  })],
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

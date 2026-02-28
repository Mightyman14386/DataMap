import { handlers } from "~/server/auth";
import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"

import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "~/server/db";
import { accounts, sessions, users, verificationTokens } from "~/server/db/schema";

const handler = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/gmail.readonly",
          access_type: "offline",  // gets you a refresh token
          prompt: "consent",
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, account }) {
      // Store the access token so you can call Gmail API later
      if (account) {
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
      }
      return token
    },
    async session({ session, token }) {
      // Make access token available on the client
      session.accessToken = token.accessToken as string | undefined
      return session
    }
  }
})

export { handler as GET, handler as POST }

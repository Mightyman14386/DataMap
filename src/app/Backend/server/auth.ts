import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "../Firebase/firebase.js";
import { collection, doc, setDoc } from "firebase/firestore";

declare module "next-auth" {
  interface Session {
    accessToken?: string | undefined;
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
    };
  }
  interface JWT {
    accessToken?: string | undefined;
    refreshToken?: string;
    userId?: string;
  }
}

export const config: NextAuthConfig = {
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/gmail.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, user }) {
      if (account && user) {
          token.accessToken = account.access_token;
          token.refreshToken = account.refresh_token;
          token.userId = user.id;

          // Save to Firestore
          await setDoc(doc(db, "users", user.id!), {
              email: user.email,
              name: user.name,
              image: user.image,
              accessToken: account.access_token,
              refreshToken: account.refresh_token,
              updatedAt: new Date(),
          }, { merge: true });
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
      if (session.user) session.user.id = token.userId as string;
      return session;
    },
  },
};

const result = NextAuth(config);

export const auth = result.auth as any;
export const handlers = result.handlers as any;
export const signIn = result.signIn as any;
export const signOut = result.signOut as any;
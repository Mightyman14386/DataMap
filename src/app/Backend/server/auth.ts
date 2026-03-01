import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "../Firebase/firebase";
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
  basePath: "/Backend/api/auth", 
  trustHost: true,
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
      console.log("[NextAuth JWT] Input - user:", !!user, "account:", !!account);
      
      if (account && user) {
        // Ensure we have a proper user ID
        const userId = user.id || user.email;
        
        console.log("[NextAuth JWT] Setting tokens - userId:", userId);
        
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.userId = userId;

          // Save to Firestore
          await setDoc(doc(db, "users", user.email!), {
              id: user.id,
              email: user.email,
              name: user.name,
              image: user.image,
              accessToken: account.access_token,
              refreshToken: account.refresh_token,
              updatedAt: new Date(),
          }, { merge: true });
          console.log("[NextAuth JWT] Saved to Firestore");
        }
      } else {
        console.log("[NextAuth JWT] Returning existing token");
      }
      
      console.log("[NextAuth JWT] Token:", { ...token, accessToken: token.accessToken ? "***" : undefined });
      return token;
    },
    async session({ session, token }) {
      console.log("[NextAuth Session] Input - session.user:", session.user, "token:", { ...token, accessToken: token.accessToken ? "***" : undefined });
      
      if (session.user) {
        session.user.id = (token.userId as string) || session.user.email || "unknown";
        session.accessToken = token.accessToken as string | undefined;
      }
      
      console.log("[NextAuth Session] Output - user.id:", session.user?.id, "hasAccessToken:", !!session.accessToken);
      return session;
    },
  },
};

export const { auth, handlers, signIn, signOut } = NextAuth(config);
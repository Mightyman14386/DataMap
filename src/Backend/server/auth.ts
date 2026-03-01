/**
 * NextAuth configuration
 */

import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { FirestoreAdapter } from "@auth/firebase-adapter";
import { adminDb } from "~/lib/firebase-admin";

export const { auth, handlers, signIn, signOut } = NextAuth({
	adapter: FirestoreAdapter(adminDb),
	providers: [
		GoogleProvider({
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
		async jwt({ token, account }) {
			if (account) {
				token.accessToken = account.access_token;
				token.refreshToken = account.refresh_token;
			}
			return token;
		},
		async session({ session, token }) {
			session.accessToken = token.accessToken as string | undefined;
			return session;
		},
	},
});

export interface Session {
	user?: {
		id: string;
		email?: string;
		name?: string;
		image?: string;
	};
	accessToken?: string;
}

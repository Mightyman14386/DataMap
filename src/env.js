import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
	/**
	 * Specify your server-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars.
	 */
	server: {
		AUTH_SECRET:
			process.env.NODE_ENV === "production"
				? z.string()
				: z.string().optional(),
		GOOGLE_CLIENT_ID: z.string(),
		GOOGLE_CLIENT_SECRET: z.string(),
		DATABASE_URL: z.string().url().optional(),
		OPENAI_API_KEY: z.string().optional(),
		ANTHROPIC_API_KEY: z.string().optional(),
		GEMINI_API_KEY: z.string().optional(),
		HIBP_API_KEY: z.string().optional(),
		REACT_APP_FIREBASE_PROJECT_ID: z.string().optional(),
		REACT_APP_FIREBASE_API_KEY: z.string().optional(),
		REACT_APP_FIREBASE_AUTH_DOMAIN: z.string().optional(),
		REACT_APP_FIREBASE_STORAGE_BUCKET: z.string().optional(),
		REACT_APP_FIREBASE_MESSAGING_SENDER_ID: z.string().optional(),
		REACT_APP_FIREBASE_APP_ID: z.string().optional(),
		REACT_APP_FIREBASE_MEASUREMENT_ID: z.string().optional(),
		FIREBASE_PRIVATE_KEY: z.string().optional(),
		FIREBASE_CLIENT_EMAIL: z.string().optional(),
		NODE_ENV: z
			.enum(["development", "test", "production"])
			.default("development"),
	},

	/**
	 * Specify your client-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars. To expose them to the client, prefix them with
	 * `NEXT_PUBLIC_`.
	 */
	client: {
		// NEXT_PUBLIC_CLIENTVAR: z.string(),
	},

	/**
	 * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
	 * middlewares) or client-side so we need to destruct manually.
	 */
	runtimeEnv: {
		AUTH_SECRET: process.env.AUTH_SECRET,
		GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
		GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
		DATABASE_URL: process.env.DATABASE_URL,
		OPENAI_API_KEY: process.env.OPENAI_API_KEY,
		ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
		GEMINI_API_KEY: process.env.GEMINI_API_KEY,
		HIBP_API_KEY: process.env.HIBP_API_KEY,
		REACT_APP_FIREBASE_PROJECT_ID: process.env.REACT_APP_FIREBASE_PROJECT_ID,
		REACT_APP_FIREBASE_API_KEY: process.env.REACT_APP_FIREBASE_API_KEY,
		REACT_APP_FIREBASE_AUTH_DOMAIN: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
		REACT_APP_FIREBASE_STORAGE_BUCKET: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
		REACT_APP_FIREBASE_MESSAGING_SENDER_ID: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
		REACT_APP_FIREBASE_APP_ID: process.env.REACT_APP_FIREBASE_APP_ID,
		REACT_APP_FIREBASE_MEASUREMENT_ID: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
		FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
		FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
		NODE_ENV: process.env.NODE_ENV,
	},
	/**
	 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
	 * useful for Docker builds.
	 */
	skipValidation: true,
	/**
	 * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
	 * `SOME_VAR=''` will throw an error.
	 */
	emptyStringAsUndefined: true,
});

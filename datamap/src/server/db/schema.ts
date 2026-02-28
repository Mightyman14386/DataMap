import { relations } from "drizzle-orm";
import {
	index,
	pgTableCreator,
	primaryKey,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AdapterAccount } from "next-auth/adapters";

/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = pgTableCreator((name) => `datamap_${name}`);

export const posts = createTable(
	"post",
	(d) => ({
		id: d.integer().primaryKey().generatedByDefaultAsIdentity(),
		name: d.varchar({ length: 256 }),
		createdById: d
			.varchar({ length: 255 })
			.notNull()
			.references(() => users.id),
		createdAt: d
			.timestamp({ withTimezone: true })
			.$defaultFn(() => /* @__PURE__ */ new Date())
			.notNull(),
		updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
	}),
	(t) => [
		index("created_by_idx").on(t.createdById),
		index("name_idx").on(t.name),
	],
);

export const users = createTable("user", (d) => ({
	id: d
		.varchar({ length: 255 })
		.notNull()
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	name: d.varchar({ length: 255 }),
	email: d.varchar({ length: 255 }).notNull(),
	emailVerified: d
		.timestamp({
			mode: "date",
			withTimezone: true,
		})
		.$defaultFn(() => /* @__PURE__ */ new Date()),
	image: d.varchar({ length: 255 }),
}));

export const usersRelations = relations(users, ({ many }) => ({
	accounts: many(accounts),
	discoveredServices: many(discoveredServices),
}));

export const accounts = createTable(
	"account",
	(d) => ({
		userId: d
			.varchar({ length: 255 })
			.notNull()
			.references(() => users.id),
		type: d.varchar({ length: 255 }).$type<AdapterAccount["type"]>().notNull(),
		provider: d.varchar({ length: 255 }).notNull(),
		providerAccountId: d.varchar({ length: 255 }).notNull(),
		refresh_token: d.text(),
		access_token: d.text(),
		expires_at: d.integer(),
		token_type: d.varchar({ length: 255 }),
		scope: d.varchar({ length: 255 }),
		id_token: d.text(),
		session_state: d.varchar({ length: 255 }),
	}),
	(t) => [
		primaryKey({ columns: [t.provider, t.providerAccountId] }),
		index("account_user_id_idx").on(t.userId),
	],
);

export const accountsRelations = relations(accounts, ({ one }) => ({
	user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessions = createTable(
	"session",
	(d) => ({
		sessionToken: d.varchar({ length: 255 }).notNull().primaryKey(),
		userId: d
			.varchar({ length: 255 })
			.notNull()
			.references(() => users.id),
		expires: d.timestamp({ mode: "date", withTimezone: true }).notNull(),
	}),
	(t) => [index("t_user_id_idx").on(t.userId)],
);

export const sessionsRelations = relations(sessions, ({ one }) => ({
	user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const verificationTokens = createTable(
	"verification_token",
	(d) => ({
		identifier: d.varchar({ length: 255 }).notNull(),
		token: d.varchar({ length: 255 }).notNull(),
		expires: d.timestamp({ mode: "date", withTimezone: true }).notNull(),
	}),
	(t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

export const discoveredServices = createTable(
	"discovered_service",
	(d) => ({
		id: d.integer().primaryKey().generatedByDefaultAsIdentity(),
		userId: d
			.varchar({ length: 255 })
			.notNull()
			.references(() => users.id),
		serviceName: d.varchar({ length: 255 }).notNull(),
		domain: d.varchar({ length: 255 }).notNull(),
		discoveredVia: d.varchar({ length: 64 }).notNull().default("gmail_metadata"),
		firstSeenAt: d
			.timestamp({ mode: "date", withTimezone: true })
			.$defaultFn(() => /* @__PURE__ */ new Date())
			.notNull(),
		lastSeenAt: d
			.timestamp({ mode: "date", withTimezone: true })
			.$defaultFn(() => /* @__PURE__ */ new Date())
			.notNull(),
		lastUsedAt: d.timestamp({ mode: "date", withTimezone: true }),
		isActive: d.boolean().notNull().default(true),
	}),
	(t) => [
		index("discovered_service_user_id_idx").on(t.userId),
		index("discovered_service_domain_idx").on(t.domain),
		uniqueIndex("discovered_service_user_domain_uidx").on(t.userId, t.domain),
	],
);

export const discoveredServicesRelations = relations(
	discoveredServices,
	({ one, many }) => ({
		user: one(users, {
			fields: [discoveredServices.userId],
			references: [users.id],
		}),
		riskResults: many(riskResults),
	}),
);

export const riskResults = createTable(
	"risk_result",
	(d) => ({
		id: d.integer().primaryKey().generatedByDefaultAsIdentity(),
		serviceId: d
			.integer()
			.notNull()
			.references(() => discoveredServices.id),
		policyDataSelling: d.integer().notNull(),
		policyAiTraining: d.integer().notNull(),
		policyDeleteDifficulty: d.integer().notNull(),
		policySummary: d.text(),
		breachDetected: d.boolean().notNull().default(false),
		breachName: d.varchar({ length: 255 }),
		breachYear: d.integer(),
		score: d.integer().notNull(),
		tier: d.varchar({ length: 16 }).notNull(),
		reasons: d.text().array().notNull().default([]),
		scoredAt: d
			.timestamp({ mode: "date", withTimezone: true })
			.$defaultFn(() => /* @__PURE__ */ new Date())
			.notNull(),
	}),
	(t) => [
		index("risk_result_service_id_idx").on(t.serviceId),
		index("risk_result_tier_idx").on(t.tier),
		index("risk_result_score_idx").on(t.score),
	],
);

export const riskResultsRelations = relations(riskResults, ({ one }) => ({
	service: one(discoveredServices, {
		fields: [riskResults.serviceId],
		references: [discoveredServices.id],
	}),
}));

export const policyCache = createTable(
	"policy_cache",
	(d) => ({
		id: d.integer().primaryKey().generatedByDefaultAsIdentity(),
		serviceName: d.varchar({ length: 255 }).notNull(),
		domain: d.varchar({ length: 255 }).notNull(),
		dataSelling: d.integer().notNull(),
		aiTraining: d.integer().notNull(),
		deleteDifficulty: d.integer().notNull(),
		summary: d.text(),
		source: d.varchar({ length: 64 }).notNull().default("seed"),
		policyVersion: d.varchar({ length: 128 }),
		analyzedAt: d
			.timestamp({ mode: "date", withTimezone: true })
			.$defaultFn(() => /* @__PURE__ */ new Date())
			.notNull(),
	}),
	(t) => [
		uniqueIndex("policy_cache_domain_uidx").on(t.domain),
		index("policy_cache_service_name_idx").on(t.serviceName),
	],
);
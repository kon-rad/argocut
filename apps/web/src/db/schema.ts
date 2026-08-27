import { sql } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
	id: text("id").primaryKey(),

	// todo: implement fully anonymous sign-in for privacy
	// we don't have any auth flows currently so this is fine for now
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text("image"),
	createdAt: timestamp("created_at")
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
	updatedAt: timestamp("updated_at")
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
}).enableRLS();

export const sessions = pgTable("sessions", {
	id: text("id").primaryKey(),
	expiresAt: timestamp("expires_at").notNull(),
	token: text("token").notNull().unique(),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
}).enableRLS();

export const accounts = pgTable("accounts", {
	id: text("id").primaryKey(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at"),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
	scope: text("scope"),
	password: text("password"),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
}).enableRLS();

export const feedback = pgTable("feedback", {
	id: text("id").primaryKey(),
	message: text("message").notNull(),
	createdAt: timestamp("created_at")
		.$defaultFn(() => new Date())
		.notNull(),
});

export const verifications = pgTable("verifications", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at").$defaultFn(
		() => /* @__PURE__ */ new Date(),
	),
	updatedAt: timestamp("updated_at").$defaultFn(
		() => /* @__PURE__ */ new Date(),
	),
}).enableRLS();

/**
 * Inherited from upstream ArgoCut and referenced by no code in this fork.
 *
 * Declared here so the schema matches what is actually in the database —
 * without it every `drizzle-kit generate` treats the table as a rename
 * candidate for whatever is being added. Dropping it would be a data-loss
 * migration for anyone who has one, which is not worth it for a dead table.
 */
export const waitlist = pgTable("waitlist", {
	id: text("id").primaryKey(),
	email: text("email").notNull().unique(),
	createdAt: timestamp("created_at").notNull(),
}).enableRLS();

/**
 * ArgoCut editor documents: projects, per-project media metadata, saved sounds.
 *
 * The body stays an opaque `jsonb` document rather than a normalised schema.
 * `SerializedProject` is the editor's own shape and it changes whenever the
 * timeline gains a feature; a normalised schema would demand a migration for
 * each one. Index the columns worth querying and leave the body alone.
 *
 * Media *binaries* are deliberately not here — see `services/storage/server/
 * file-store.ts`. A 900 MB source as `bytea` is wrong on backup size, memory
 * and streaming alike.
 */
export const storageDocs = pgTable(
	"storage_docs",
	{
		collection: text("collection").notNull(),
		key: text("key").notNull(),
		data: jsonb("data").notNull(),
		version: integer("version").default(1).notNull(),

		// Nullable until auth is wired for the editor. A single-user local tool has
		// exactly one owner; the column exists so multi-tenant is a filter rather
		// than a migration.
		ownerId: text("owner_id").references(() => users.id, {
			onDelete: "cascade",
		}),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.collection, table.key] }),
		index("storage_docs_collection_updated_idx").on(
			table.collection,
			table.updatedAt.desc(),
		),
		// Sorting the projects page by name should not deserialise every document.
		index("storage_docs_name_idx").on(
			sql`((${table.data} -> 'metadata' ->> 'name'))`,
		),
	],
);

/**
 * A brand: the container everything else is created inside.
 *
 * `rootPath` points at a real directory on the machine running the server — the
 * folder is the truth for content, and this row is an index over it. That is
 * deliberate: the style guide stays a `.md` you can edit in any editor, and the
 * logos stay files you can drop in by hand, without the app being the only way
 * to touch your own brand.
 */
export const brands = pgTable(
	"brands",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		slug: text("slug").notNull(),
		description: text("description"),

		/** Absolute path to the brand folder on the server's filesystem. */
		rootPath: text("root_path").notNull(),
		/** Style guide markdown, relative to `rootPath`. */
		styleGuidePath: text("style_guide_path").default("style-guide.md").notNull(),
		/** Asset directory, relative to `rootPath`. */
		assetsDir: text("assets_dir").default("assets").notNull(),

		/** Palette and type pulled from the style guide's front matter, if present. */
		tokens: jsonb("tokens"),

		ownerId: text("owner_id").references(() => users.id, {
			onDelete: "cascade",
		}),
		lastScannedAt: timestamp("last_scanned_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("brands_slug_idx").on(table.slug),
		uniqueIndex("brands_root_path_idx").on(table.rootPath),
	],
);

/**
 * One row per file found under a brand's assets directory.
 *
 * A scan result, not a source of truth: the file on disk can change without the
 * app knowing, so this is refreshed by rescanning rather than trusted forever.
 */
export const brandAssets = pgTable(
	"brand_assets",
	{
		id: text("id").primaryKey(),
		brandId: text("brand_id")
			.notNull()
			.references(() => brands.id, { onDelete: "cascade" }),

		/** logo | emblem | title-card | font | image | video | other */
		kind: text("kind").notNull(),
		name: text("name").notNull(),
		/** Path relative to the brand's `rootPath`. */
		relPath: text("rel_path").notNull(),
		mime: text("mime"),
		size: integer("size"),
		width: integer("width"),
		height: integer("height"),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("brand_assets_brand_path_idx").on(table.brandId, table.relPath),
		index("brand_assets_brand_kind_idx").on(table.brandId, table.kind),
	],
);

/**
 * Small singleton values that do not deserve a table each — the active brand,
 * chiefly. Keyed by name so a new setting costs no migration.
 */
export const appSettings = pgTable("app_settings", {
	key: text("key").primaryKey(),
	value: jsonb("value").notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

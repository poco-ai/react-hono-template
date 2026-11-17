import assert from "node:assert/strict";
import { test } from "node:test";
import { getTableConfig as pgTableConfig } from "drizzle-orm/pg-core";
import { getTableConfig as sqliteTableConfig } from "drizzle-orm/sqlite-core";
import { defineSchema } from "../src/db/define-schema";
import { resolveServerDialect, setSqlDialect } from "../src/db/dialect";

type TableConfig = {
	name: string;
	columns: { name: string }[];
	indexes: { config: { name: string } }[];
	uniqueConstraints: { name?: string }[];
};

const describeTable = (
	table: unknown,
	dialect: "sqlite" | "postgres",
): TableConfig | null => {
	try {
		if (dialect === "sqlite") {
			return sqliteTableConfig(table as never) as TableConfig;
		}
		return pgTableConfig(table as never) as TableConfig;
	} catch {
		return null;
	}
};

const names = (values: { name?: string }[]) =>
	values.map((value) => value.name ?? "").sort();

const indexNames = (indexes: { config: { name: string } }[]) =>
	indexes.map((index) => index.config.name).sort();

test("sqlite and postgres schemas share table, column and index names", () => {
	const sqlite = defineSchema("sqlite");
	const postgres = defineSchema("postgres");
	const keys = Object.keys(sqlite).sort();
	assert.deepEqual(Object.keys(postgres).sort(), keys);

	let tables = 0;
	for (const key of keys) {
		const left = describeTable(sqlite[key as keyof typeof sqlite], "sqlite");
		const right = describeTable(
			postgres[key as keyof typeof postgres],
			"postgres",
		);
		if (!left && !right) continue;
		assert.ok(left, `${key} is a table on postgres only`);
		assert.ok(right, `${key} is a table on sqlite only`);
		tables += 1;
		assert.equal(right.name, left.name, key);
		assert.deepEqual(
			names(right.columns),
			names(left.columns),
			`${key} columns`,
		);
		assert.deepEqual(
			indexNames(right.indexes),
			indexNames(left.indexes),
			`${key} indexes`,
		);
		assert.deepEqual(
			names(right.uniqueConstraints),
			names(left.uniqueConstraints),
			`${key} unique constraints`,
		);
	}
	assert.ok(tables > 10);
});

test("mysql is a named dialect slot that throws", () => {
	assert.throws(
		() => setSqlDialect("mysql"),
		/MySQL dialect is not implemented/,
	);
	assert.throws(
		() => resolveServerDialect("mysql"),
		/MySQL dialect is not implemented/,
	);
	assert.throws(
		() => resolveServerDialect("sqlite"),
		/Bun server runs on PostgreSQL/,
	);
	assert.equal(resolveServerDialect(undefined), "postgres");
});

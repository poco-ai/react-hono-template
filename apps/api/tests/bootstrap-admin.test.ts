import type { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createAdminUserDao } from "../src/dao/admin-user.dao";
import { createTestDb } from "./helpers/test-db";

const insertUser = (sqlite: Database, id: string, role = "user") => {
	sqlite.run(
		`INSERT INTO user (id, name, email, email_verified, role, created_at, updated_at)
		 VALUES (?, ?, ?, 0, ?, 0, 0)`,
		[id, id, `${id}@example.com`, role],
	);
};

test("first-admin promotion is atomic and only promotes one user", async () => {
	const { sqlite, db } = createTestDb();
	insertUser(sqlite, "user-1");
	insertUser(sqlite, "user-2");
	const dao = createAdminUserDao(db);

	await dao.promoteFirstAdmin("user-1");
	await dao.promoteFirstAdmin("user-2");

	assert.deepEqual(
		sqlite.query("SELECT id, role FROM user ORDER BY id").all(),
		[
			{ id: "user-1", role: "admin" },
			{ id: "user-2", role: "user" },
		],
	);
});

test("an existing multi-role admin blocks further promotion", async () => {
	const { sqlite, db } = createTestDb();
	insertUser(sqlite, "owner", "user,admin");
	insertUser(sqlite, "late");
	const dao = createAdminUserDao(db);

	await dao.promoteFirstAdmin("late");

	assert.equal(
		(
			sqlite.query("SELECT role FROM user WHERE id = 'late'").get() as {
				role: string;
			}
		).role,
		"user",
	);
});

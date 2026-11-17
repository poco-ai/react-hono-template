import type { BatchItem, BatchResponse } from "drizzle-orm/batch";
import { getSqlDialect } from "./dialect";
import type { Database } from "./types";

type BatchDb = Database & {
	batch?: <T extends readonly BatchItem[]>(
		statements: T,
	) => Promise<BatchResponse<T>>;
	transaction?: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
};

type QueryResult<Query> = Query extends { _: { result: infer Result } }
	? Result
	: never;

type IsTuple<T extends readonly unknown[]> = number extends T["length"]
	? false
	: true;

/**
 * Fixed tuples keep each statement's result in its own slot. Open arrays
 * (built with `push`) collapse to the result union, matching D1 `db.batch`.
 */
type BatchResults<T> = T extends readonly (infer Item)[]
	? IsTuple<T> extends true
		? T extends readonly [infer Head, ...infer Tail]
			? [QueryResult<Head>, ...BatchResults<Tail>]
			: []
		: QueryResult<Item>[]
	: never;

/**
 * Atomic multi-statement helper.
 *
 * D1 has no interactive transactions, so SQLite still sends one `db.batch`.
 * PostgreSQL builds the statements on the transaction handle and runs them in
 * order. Build every statement with the callback argument — a query created on
 * the outer pool is not part of the transaction.
 */
export const runBatch = async <const T extends readonly unknown[]>(
	db: Database,
	build: (tx: Database) => T,
): Promise<BatchResults<T>> => {
	const executor = db as BatchDb;
	if (getSqlDialect() === "postgres") {
		if (!executor.transaction) {
			throw new Error("PostgreSQL database does not support transactions");
		}
		return executor.transaction(async (tx) => {
			const statements = build(tx as unknown as Database);
			const results: unknown[] = [];
			for (const statement of statements) {
				results.push(await statement);
			}
			return results as unknown as BatchResults<T>;
		});
	}

	const statements = build(db);
	if (statements.length === 0) {
		return [] as unknown as BatchResults<T>;
	}
	if (typeof executor.batch === "function") {
		return executor.batch(
			statements as unknown as readonly BatchItem[],
		) as Promise<BatchResults<T>>;
	}
	const results: unknown[] = [];
	for (const statement of statements) {
		results.push(await statement);
	}
	return results as unknown as BatchResults<T>;
};

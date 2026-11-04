/**
 * Minimal typing for Bun's built-in SQLite driver used by the DAO integration
 * tests. `bun-types` is not a dependency of this workspace, and the tests only
 * use the synchronous helpers below.
 */
declare module "bun:sqlite" {
	export class Database {
		constructor(filename?: string);
		exec(sql: string): void;
		run(sql: string, ...params: readonly unknown[]): unknown;
		query(sql: string): {
			get(...params: readonly unknown[]): unknown;
			all(...params: readonly unknown[]): unknown[];
		};
		close(): void;
	}
}

import { setSqlDialect } from "../src/db/dialect";

setSqlDialect("postgres");
process.env.BETTER_AUTH_SECRET ||= "smoke-secret-smoke-secret-smoke-secret";
process.env.BILLING_MOCK_MODE ||= "true";

const { runSmoke } = await import("./postgres-smoke.impl");
await runSmoke();

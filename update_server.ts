import fs from 'fs';
let server = fs.readFileSync('server.ts', 'utf-8');

server = server.replace(/import fs from "fs";\nimport path from "path";/, `import path from "path";\nimport { db } from "./src/db/index.ts";\nimport { users, subscriptions, plans, settings } from "./src/db/schema.ts";\nimport { eq, desc, sql } from "drizzle-orm";`);

server = server.replace(/const DB_FILE = path\.join\(process\.cwd\(\), "db\.json"\);[\s\S]*?function writeDB\(data: any\) \{[\s\S]*?\}/, `// Helper to get nested subscriptions
async function getUserWithSubs(userId: string) {
    const userRes = await db.select().from(users).where(eq(users.id, userId));
    if (userRes.length === 0) return null;
    const user = userRes[0];
    const subs = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
    return { ...user, subscriptions: subs };
}`);

// We need to replace readDB and writeDB usages. Let's do it manually because it's safer.

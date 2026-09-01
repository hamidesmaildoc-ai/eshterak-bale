const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf-8');

// replace sync readDB/writeDB declarations
code = code.replace(/function readDB\(\): DB \{[\s\S]*?return defaultDB;\n\}/, `async function readDB(): Promise<DB> {
  const allUsers = await db.select().from(users);
  const allSubs = await db.select().from(subscriptions);
  const allPlans = await db.select().from(plans);
  const allSettings = await db.select().from(settings);
  const allTxs = await db.select().from(transactions);
  
  const mappedUsers = allUsers.map(u => ({
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    username: u.username,
    botState: u.botState,
    subscriptionEnd: u.subscriptionEnd,
    stateData: u.stateData,
    subscriptions: allSubs.filter(s => s.userId === u.id)
  }));
  
  const mappedSettings = { cardNumber: "", adminChatId: "" };
  allSettings.forEach(s => {
    mappedSettings[s.key] = s.value;
  });
  
  return { users: mappedUsers, plans: allPlans, settings: mappedSettings, transactions: allTxs };
}`);

code = code.replace(/function writeDB\(db: DB\) \{[\s\S]*?\n\}/, `async function writeDB(data: DB) {
  // Overwrite plans
  if (data.plans.length > 0) {
      await db.delete(plans);
      for (const p of data.plans) {
          await db.insert(plans).values({ id: p.id, name: p.name, durationDays: p.durationDays, price: p.price, description: p.description });
      }
  }
  
  // Overwrite settings
  if (data.settings) {
      await db.delete(settings);
      if (data.settings.cardNumber) await db.insert(settings).values({ key: 'cardNumber', value: data.settings.cardNumber });
      if (data.settings.adminChatId) await db.insert(settings).values({ key: 'adminChatId', value: data.settings.adminChatId });
  }

  // Overwrite users (simple approach: upsert user, delete subs, re-insert subs)
  for (const u of data.users) {
      await db.insert(users).values({
          id: u.id,
          firstName: u.firstName || null,
          lastName: u.lastName || null,
          username: u.username || null,
          botState: u.botState || 'IDLE',
          subscriptionEnd: u.subscriptionEnd || null,
          stateData: (u as any).stateData || null
      }).onConflictDoUpdate({
          target: users.id,
          set: {
              firstName: u.firstName || null,
              lastName: u.lastName || null,
              username: u.username || null,
              botState: u.botState || 'IDLE',
              subscriptionEnd: u.subscriptionEnd || null,
              stateData: (u as any).stateData || null
          }
      });

      await db.delete(subscriptions).where(eq(subscriptions.userId, u.id));
      if (u.subscriptions && u.subscriptions.length > 0) {
          for (const sub of u.subscriptions) {
              await db.insert(subscriptions).values({
                  id: sub.id,
                  userId: u.id,
                  planId: sub.planId,
                  planName: sub.planName,
                  endDate: sub.endDate,
                  joinLink: sub.joinLink || null,
              });
          }
      }
  }

  // Transactions
  if (data.transactions.length > 0) {
      await db.delete(transactions);
      for (const t of data.transactions) {
          await db.insert(transactions).values({ id: t.id, userId: t.userId, planId: t.planId, status: t.status, date: t.date });
      }
  }
}`);

// We need to change `readDB()` to `await readDB()` and `writeDB(db)` to `await writeDB(db)`.
// We also need to add async to functions if needed.
// E.g., app.get(...) -> app.get(..., async (req, res) => ...)
code = code.replace(/app\.(get|post|put|delete)\("([^"]+)", \((req, res)\) => \{/g, `app.$1("$2", async ($3) => {`);
// Also readDB().settings -> (await readDB()).settings
code = code.replace(/readDB\(\)\.settings/g, `(await readDB()).settings`);
// readDB() -> await readDB()
code = code.replace(/const db = readDB\(\);/g, `const db = await readDB();`);
// writeDB(db) -> await writeDB(db)
code = code.replace(/writeDB\(db\);/g, `await writeDB(db);`);
// writeDB(defaultDB) -> await writeDB(defaultDB)
code = code.replace(/writeDB\(defaultDB\);/g, `// await writeDB(defaultDB);`);
// Initial writeDB
code = code.replace(/if \(!fs\.existsSync\(DB_FILE\)\) \{\n  writeDB\(defaultDB\);\n\}/, `// Initial db write is skipped for pg`);


// Replace top imports
code = code.replace(/import fs from "fs";/, `import { db } from "./src/db/index.js";\nimport { users, subscriptions, plans, settings, transactions } from "./src/db/schema.js";\nimport { eq } from "drizzle-orm";`);


fs.writeFileSync('server.ts', code);
console.log("Done");

import fs from 'fs';
import path from 'path';
import { db } from './src/db/index.ts';
import { users, subscriptions, plans, settings } from './src/db/schema.ts';
import * as dotenv from 'dotenv';
dotenv.config();

const DB_FILE = path.join(process.cwd(), "db.json");

async function migrate() {
    if (!fs.existsSync(DB_FILE)) {
        console.log("No db.json found.");
        return;
    }
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    
    console.log("Migrating users...");
    if (data.users && data.users.length > 0) {
        for (const u of data.users) {
            await db.insert(users).values({
                id: u.id,
                firstName: u.firstName || null,
                lastName: u.lastName || null,
                username: u.username || null,
                botState: u.botState || 'IDLE',
                subscriptionEnd: u.subscriptionEnd || null,
            }).onConflictDoNothing();
            
            if (u.subscriptions && u.subscriptions.length > 0) {
                for (const sub of u.subscriptions) {
                    await db.insert(subscriptions).values({
                        id: sub.id,
                        userId: u.id,
                        planId: sub.planId,
                        planName: sub.planName,
                        endDate: sub.endDate,
                        joinLink: sub.joinLink || null,
                    }).onConflictDoNothing();
                }
            }
        }
    }
    
    console.log("Migrating plans...");
    if (data.plans && data.plans.length > 0) {
        for (const p of data.plans) {
            await db.insert(plans).values({
                id: p.id,
                name: p.name,
                durationDays: p.durationDays,
                price: p.price,
                description: p.description || null,
            }).onConflictDoNothing();
        }
    }

    console.log("Migrating settings...");
    if (data.settings) {
        if (data.settings.cardNumber) {
            await db.insert(settings).values({ key: 'cardNumber', value: data.settings.cardNumber }).onConflictDoUpdate({ target: settings.key, set: { value: data.settings.cardNumber } });
        }
        if (data.settings.adminChatId) {
            await db.insert(settings).values({ key: 'adminChatId', value: String(data.settings.adminChatId) }).onConflictDoUpdate({ target: settings.key, set: { value: String(data.settings.adminChatId) } });
        }
    }
    console.log("Migration complete.");
    process.exit(0);
}

migrate().catch(console.error);

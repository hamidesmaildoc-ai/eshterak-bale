import { db } from './src/db/index.js';
import { users } from './src/db/schema.js';
console.log(await db.select().from(users));

const fs = require('fs');
const dbPath = './db.json';

let db = { users: [], plans: [], transactions: [], settings: {} };
if (fs.existsSync(dbPath)) {
    try {
        db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    } catch(e) {}
}

const firstNames = ['علی', 'محمد', 'زهرا', 'فاطمه', 'رضا', 'حسین', 'مریم', 'سارا', 'مهدی', 'امیر'];
const lastNames = ['رضایی', 'محمدی', 'احمدی', 'حسینی', 'کریمی', 'موسوی', 'جعفری', 'هاشمی', 'صادقی'];

// Create 389 users
for (let i = 0; i < 389; i++) {
    const userId = '1000' + Math.floor(10000 + Math.random() * 90000) + i;
    const user = {
        id: String(userId),
        firstName: firstNames[Math.floor(Math.random() * firstNames.length)],
        lastName: lastNames[Math.floor(Math.random() * lastNames.length)],
        username: 'test_user_' + i,
        botState: 'IDLE',
        subscriptions: []
    };
    
    // Create 3 subscriptions for each user
    for (let j = 0; j < 3; j++) {
        const isExpired = Math.random() > 0.6; // 40% chance to be expired
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + (isExpired ? -Math.floor(Math.random() * 30) : Math.floor(Math.random() * 60) + 1));
        
        user.subscriptions.push({
            id: 'SUB_' + Math.floor(10000 + Math.random() * 90000),
            planId: 'test_plan_' + j,
            planName: `اشتراک تستی ${j + 1}`,
            endDate: endDate.toISOString(),
            joinLink: `https://ble.ir/join/TEST_LINK_${i}_${j}`
        });
    }
    db.users.push(user);
}

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log('Seeded 389 users with 3 subscriptions each.');

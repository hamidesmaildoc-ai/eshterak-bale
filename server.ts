import fs from "fs";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { db } from "./src/db/index.js";
import { users, subscriptions, plans, settings, transactions } from "./src/db/schema.js";
import { eq } from "drizzle-orm";

// Initialize simple JSON database
const DB_FILE = path.join(process.cwd(), "db.json");

interface Plan {
  id: string;
  name: string;
  price: number;
  durationDays: number;
  description: string;
}

interface User {
  id: string; // Bale User ID
  username?: string;
  firstName?: string;
  lastName?: string;
  subscriptionEnd?: string; // ISO Date String
}

interface DB {
  plans: Plan[];
  users: User[];
  transactions: any[];
  settings: {
    cardNumber: string;
    adminChatId: string;
  };
}

const defaultDB: DB = {
  plans: [
    {
      id: "plan_1",
      name: "اشتراک ۱ ماهه",
      price: 50000,
      durationDays: 30,
      description: "دسترسی کامل به مدت یک ماه",
    },
    {
      id: "plan_2",
      name: "اشتراک ۳ ماهه",
      price: 130000,
      durationDays: 90,
      description: "دسترسی کامل به مدت سه ماه با تخفیف",
    },
  ],
  users: [],
  transactions: [],
  settings: {
    cardNumber: "1234-5678-9012-3456",
    adminChatId: "",
  },
};

async function readDB(): Promise<DB> {
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
}

async function writeDB(data: DB) {
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
}

// Initial DB write if not exists
if (false) {
  // await writeDB(defaultDB);
}

function getBaleBaseUrl() {
  return `https://tapi.bale.ai/bot${process.env.BALE_BOT_TOKEN}`;
}

async function sendBaleMessage(chatId: string, text: string, replyMarkup?: any) {
  if (!process.env.BALE_BOT_TOKEN) {
    console.error("BALE_BOT_TOKEN is not set.");
    return;
  }
  
  const payload: any = {
    chat_id: chatId,
    text: text,
  };
  
  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }

  try {
    const res = await fetch(`${getBaleBaseUrl()}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    console.log("sendBaleMessage response:", data);
    if (!res.ok) {
      console.error("Error sending Bale message:", data);
    }
  } catch (error) {
    console.error("Failed to send message:", error);
  }
}

async function forwardBaleMessage(chatId: string, fromChatId: string, messageId: number) {
  if (!process.env.BALE_BOT_TOKEN) return;
  try {
    const res = await fetch(`${getBaleBaseUrl()}/forwardMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, from_chat_id: fromChatId, message_id: messageId }),
    });
    return await res.json();
  } catch (error) {
    console.error("Failed to forward message:", error);
  }
}

async function setBaleWebhook(url: string) {
  if (!process.env.BALE_BOT_TOKEN) return { ok: false, description: "Token not set" };
  try {
    const res = await fetch(`${getBaleBaseUrl()}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    return await res.json();
  } catch (e) {
    return { ok: false, description: String(e) };
  }
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());

  // === ADMIN API ROUTES ===

  app.get("/api/stats", async (req, res) => {
    const db = await readDB();
    const now = new Date();
    
    let activeSubsCount = 0;
    
    db.users.forEach(user => {
      const subs = user.subscriptions || [];
      const activeSubs = subs.filter(s => new Date(s.endDate) > now).length;
      
      if (activeSubs > 0) {
        activeSubsCount += activeSubs;
      } else if (user.subscriptionEnd && new Date(user.subscriptionEnd) > now) {
        // Legacy fallback
        activeSubsCount += 1;
      }
    });

    res.json({
      totalUsers: db.users.length,
      activeSubscriptions: activeSubsCount,
      totalPlans: db.plans.length,
    });
  });

  app.get("/api/plans", async (req, res) => {
    const db = await readDB();
    res.json(db.plans);
  });

  app.post("/api/plans", async (req, res) => {
    const db = await readDB();
    const newPlan = { id: `plan_${Date.now()}`, ...req.body };
    db.plans.push(newPlan);
    await writeDB(db);
    res.json(newPlan);
  });

  app.delete("/api/plans/:id", async (req, res) => {
    const db = await readDB();
    db.plans = db.plans.filter((p) => p.id !== req.params.id);
    await writeDB(db);
    res.json({ success: true });
  });

  app.get("/api/users", async (req, res) => {
    const db = await readDB();
    res.json(db.users);
  });
  
  app.post("/api/users/cleanup-subscriptions", async (req, res) => {
    const db = await readDB();
    const now = new Date();
    let removedCount = 0;
    
    db.users.forEach(user => {
      if (user.subscriptions) {
        const initialLen = user.subscriptions.length;
        user.subscriptions = user.subscriptions.filter(sub => new Date(sub.endDate) > now);
        removedCount += (initialLen - user.subscriptions.length);
      }
      
      // Clear legacy active state if expired
      if (user.subscriptionEnd && new Date(user.subscriptionEnd) <= now) {
        user.subscriptionEnd = undefined;
      }
    });
    
    await writeDB(db);
    res.json({ success: true, removedCount });
  });

  app.put("/api/users/:userId/subscriptions/:subId", async (req, res) => {
    const db = await readDB();
    const { addDays } = req.body;
    const user = db.users.find((u: any) => u.id === req.params.userId);
    
    if (user && user.subscriptions && addDays) {
        const subIndex = user.subscriptions.findIndex((s: any) => s.id === req.params.subId);
        if (subIndex > -1) {
            const sub = user.subscriptions[subIndex];
            const currentDate = new Date(sub.endDate);
            currentDate.setDate(currentDate.getDate() + addDays);
            sub.endDate = currentDate.toISOString();
            
            // Also update legacy if it's the only one or something? It's fine to just update the specific sub.
            if (user.subscriptions.length === 1) {
                user.subscriptionEnd = currentDate.toISOString();
            }
            
            await writeDB(db);
            
            sendBaleMessage(
                user.id, 
                `⏳ اشتراک "${sub.planName}" شما به مدت ${addDays} روز تمدید شد!\nتاریخ پایان جدید: ${currentDate.toLocaleDateString('fa-IR')}`
            );
            
            return res.json({ success: true, user });
        }
    }
    res.status(404).json({ error: "User or subscription not found" });
  });

  app.post("/api/users/:id/subscription", async (req, res) => {
    const db = await readDB();
    const { days } = req.body;
    const userIndex = db.users.findIndex(u => u.id === req.params.id);
    if (userIndex > -1 && days) {
        const user = db.users[userIndex];
        
        if (!user.subscriptions) {
            user.subscriptions = [];
        }
        
        const subId = `GIFT_${Math.floor(1000 + Math.random() * 9000)}`;
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + days);
        
        user.subscriptions.push({
            id: subId,
            planId: 'gift',
            planName: 'هدیه مدیریت',
            endDate: endDate.toISOString(),
            joinLink: ''
        });
        
        user.subscriptionEnd = endDate.toISOString(); // For legacy fallback
        await writeDB(db);
        
        // Notify user
        sendBaleMessage(
            user.id, 
            `🎁 یک هدیه اشتراک ${days} روزه از طرف مدیریت برای شما فعال شد!\nتاریخ پایان: ${endDate.toLocaleDateString('fa-IR')}`
        );
        
        res.json({ success: true, user: db.users[userIndex] });
    } else {
        res.status(404).json({ error: "User not found or invalid days" });
    }
  });

  app.get("/api/settings", async (req, res) => {
    res.json((await readDB()).settings);
  });
  
  app.post("/api/settings", async (req, res) => {
    const db = await readDB();
    db.settings = { ...db.settings, ...req.body };
    await writeDB(db);
    res.json({ success: true, settings: db.settings });
  });

  app.get("/api/debug/webhook", async (req, res) => {
    try {
      const r = await fetch(`${getBaleBaseUrl()}/getWebhookInfo`);
      const data = await r.json();
      res.json({ appUrl: process.env.APP_URL, webhookInfo: data, tokenSet: !!process.env.BALE_BOT_TOKEN });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/settings/webhook", async (req, res) => {
    let appUrl = process.env.APP_URL;
    if (!appUrl) {
      return res.status(400).json({ error: "APP_URL is not set in environment." });
    }
    // Fix for AI Studio: Ensure the webhook uses the public 'ais-pre' URL instead of the protected 'ais-dev' URL
    appUrl = appUrl.replace("ais-dev", "ais-pre");
    
    const webhookUrl = `${appUrl}/api/webhook/bale`;
    const result = await setBaleWebhook(webhookUrl);
    res.json(result);
  });

async function processUpdate(update: any) {
  if (!update) return;

  try {
    if (update.message) {
      const message = update.message;
      const chatId = message.chat.id.toString();
      const text = message.text || "";
      const from = message.from;

      const db = await readDB();
      let user = db.users.find((u) => u.id === chatId);

      // Create or update user
      if (!user) {
        user = {
          id: chatId,
          username: from?.username,
          firstName: from?.first_name,
          lastName: from?.last_name,
        };
        db.users.push(user);
        await writeDB(db);
      } else {
        let updated = false;
        if (user.username !== from?.username) { user.username = from?.username; updated = true; }
        if (user.firstName !== from?.first_name) { user.firstName = from?.first_name; updated = true; }
        if (user.lastName !== from?.last_name) { user.lastName = from?.last_name; updated = true; }
        if (updated) await writeDB(db);
      }

      if (text === "/start") {
        user.botState = 'IDLE';
        await writeDB(db);
        await sendBaleMessage(
          chatId,
          `سلام ${from?.first_name || ""}! 👋\nبه ربات فروش اشتراک خوش آمدید.\nبرای مشاهده پلن‌ها از منوی زیر استفاده کنید.`,
          {
            inline_keyboard: [
              [{ text: "🛒 مشاهده پلن‌های اشتراک", callback_data: "show_plans" }],
              [{ text: "👤 وضعیت اشتراک من", callback_data: "my_sub" }],
              [{ text: "🎧 پشتیبانی", callback_data: "support" }],
            ],
          }
        );
        return;
      }
      
      if (text === "/setadmin") {
          db.settings.adminChatId = chatId;
          await writeDB(db);
          await sendBaleMessage(chatId, "👑 شما به عنوان مدیر ربات تنظیم شدید!\n\nبرای ورود به پنل مدیریت داخل ربات، دستور /admin را ارسال کنید.");
          return;
      }
      
      if (text === "/admin") {
          if (db.settings.adminChatId === chatId) {
              user.botState = 'IDLE';
              await writeDB(db);
              await sendBaleMessage(chatId, "🔐 **پنل مدیریت ربات**\n\nلطفاً یکی از گزینه‌های زیر را انتخاب کنید:", {
                  inline_keyboard: [
                      [{ text: "📊 آمار ربات", callback_data: "admin_stats" }],
                      [{ text: "💳 تنظیم شماره کارت", callback_data: "admin_set_card" }],
                      [{ text: "➕ افزودن پلن جدید", callback_data: "admin_add_plan" }],
                      [{ text: "❌ حذف پلن‌ها", callback_data: "admin_delete_plan" }]
                  ]
              });
          } else {
              await sendBaleMessage(chatId, "⛔ شما به این بخش دسترسی ندارید.");
          }
          return;
      }
      
      // Handle User states
      if (user.botState === 'ADMIN_SET_CARD') {
          db.settings.cardNumber = text;
          user.botState = 'IDLE';
          await writeDB(db);
          await sendBaleMessage(chatId, "✅ شماره کارت با موفقیت تغییر کرد.");
          return;
      }
      
      if (user.botState === 'ADMIN_ADD_PLAN_NAME') {
          user.stateData = text;
          user.botState = 'ADMIN_ADD_PLAN_PRICE';
          await writeDB(db);
          await sendBaleMessage(chatId, "💵 حالا قیمت این پلن را به تومان (فقط عدد) وارد کنید:");
          return;
      }
      
      if (user.botState === 'ADMIN_ADD_PLAN_PRICE') {
          const price = parseInt(text);
          if (isNaN(price)) {
              await sendBaleMessage(chatId, "❌ قیمت باید فقط عدد باشد. دوباره وارد کنید:");
              return;
          }
          user.stateData = JSON.stringify({ name: user.stateData, price: price });
          user.botState = 'ADMIN_ADD_PLAN_DAYS';
          await writeDB(db);
          await sendBaleMessage(chatId, "⏳ حالا مدت زمان این پلن را به روز (فقط عدد) وارد کنید (مثلاً 30):");
          return;
      }
      
      if (user.botState === 'ADMIN_ADD_PLAN_DAYS') {
          const days = parseInt(text);
          if (isNaN(days)) {
              await sendBaleMessage(chatId, "❌ مدت زمان باید فقط عدد باشد. دوباره وارد کنید:");
              return;
          }
          try {
              const partialPlan = JSON.parse(user.stateData);
              const newPlan = {
                  id: `plan_${Date.now()}`,
                  name: partialPlan.name,
                  price: partialPlan.price,
                  durationDays: days,
                  description: partialPlan.name
              };
              db.plans.push(newPlan);
              user.botState = 'IDLE';
              user.stateData = "";
              await writeDB(db);
              await sendBaleMessage(chatId, `✅ پلن جدید "${newPlan.name}" با موفقیت اضافه شد!`);
          } catch (e) {
              user.botState = 'IDLE';
              await writeDB(db);
              await sendBaleMessage(chatId, "❌ خطایی رخ داد. عملیات لغو شد.");
          }
          return;
      }

      if (user.botState === 'AWAITING_RECEIPT') {
          const planId = user.stateData;
          if (update.message.photo && update.message.photo.length > 0) {
              const tx = { id: `tx_${Date.now()}`, userId: chatId, planId, status: 'PENDING', date: new Date().toISOString() };
              db.transactions.push(tx);
              user.botState = 'IDLE';
              await writeDB(db);
              
              await sendBaleMessage(chatId, "✅ فیش شما دریافت شد و در انتظار تایید مدیریت است.");
              
              const adminChatId = db.settings.adminChatId;
              if (adminChatId) {
                  await forwardBaleMessage(adminChatId, chatId, message.message_id);
                  const plan = db.plans.find(p => p.id === planId);
                  await sendBaleMessage(
                      adminChatId, 
                      `🔔 **درخواست تایید پرداخت جدید**\nکاربر: ${user.firstName} ${user.lastName || ''} (@${user.username || 'ندارد'})\nپلن: ${plan?.name}\nوضعیت: در انتظار بررسی`,
                      {
                          inline_keyboard: [
                              [{ text: "✅ تایید پرداخت و ارسال لینک", callback_data: `approve_tx_${tx.id}` }],
                              [{ text: "❌ رد پرداخت", callback_data: `reject_tx_${tx.id}` }]
                          ]
                      }
                  );
              }
          } else {
              await sendBaleMessage(chatId, "⚠️ لطفاً عکس فیش واریزی خود را ارسال کنید.");
          }
          return;
      }
      
      if (user.botState === 'AWAITING_SUPPORT') {
          user.botState = 'IDLE';
          await writeDB(db);
          await sendBaleMessage(chatId, "✅ پیام شما با موفقیت برای تیم پشتیبانی ارسال شد. در اسرع وقت پاسخ شما داده خواهد شد.");
          
          const adminChatId = db.settings.adminChatId;
          if (adminChatId) {
              await sendBaleMessage(
                  adminChatId, 
                  `📩 **پیام پشتیبانی جدید**\nاز طرف: ${user.firstName} ${user.lastName || ''} (@${user.username || 'ندارد'})\nشناسه کاربر: ${user.id}\n\nمتن پیام:\n${text}`,
                  {
                      inline_keyboard: [
                          [{ text: "پاسخ به این کاربر", callback_data: `reply_support_${user.id}` }]
                      ]
                  }
              );
          }
          return;
      }
      
      if (user.botState === 'AWAITING_SUPPORT_REPLY') {
          const targetUserId = user.stateData;
          user.botState = 'IDLE';
          await writeDB(db);
          
          if (targetUserId) {
              await sendBaleMessage(targetUserId, `👨‍💻 **پاسخ پشتیبانی:**\n\n${text}`);
              await sendBaleMessage(chatId, "✅ پاسخ شما با موفقیت برای کاربر ارسال شد.");
          }
          return;
      }
      
      if (user.botState === 'AWAITING_LINK') {
          const txId = user.stateData;
          const txIndex = db.transactions.findIndex((t: any) => t.id === txId);
          if (txIndex > -1) {
              const tx = db.transactions[txIndex];
              tx.status = 'APPROVED';
              user.botState = 'IDLE';
              
              const plan = db.plans.find(p => p.id === tx.planId);
              const targetUser = db.users.find(u => u.id === tx.userId);
              
              if (plan && targetUser) {
                  if (!targetUser.subscriptions) {
                      targetUser.subscriptions = [];
                  }
                  
                  const subId = `SUB_${Math.floor(1000 + Math.random() * 9000)}`;
                  const endDate = new Date();
                  endDate.setDate(endDate.getDate() + plan.durationDays);
                  
                  targetUser.subscriptions.push({
                      id: subId,
                      planId: plan.id,
                      planName: plan.name,
                      endDate: endDate.toISOString(),
                      joinLink: text
                  });
                  
                  targetUser.subscriptionEnd = endDate.toISOString(); // For legacy fallback
              }
              await writeDB(db);
              
              await sendBaleMessage(tx.userId, `🎉 **پرداخت شما تایید شد!**\n\nاشتراک: ${plan?.name}\nلینک اختصاصی شما:\n${text}\n\nاز خرید شما متشکریم.`);
              await sendBaleMessage(chatId, "✅ لینک با موفقیت برای کاربر ارسال شد و وضعیت تراکنش به تایید شده تغییر یافت.");
          }
          return;
      }
      
      // Handle manual commands
      if (text === "/plans") {
          await handleShowPlans(chatId, db);
      }
      
      if (text === "/status") {
          await handleMySub(chatId, user);
      }
    } else if (update.callback_query) {
      const cb = update.callback_query;
      const chatId = cb.message?.chat?.id?.toString();
      const data = cb.data;
      
      if (!chatId) return;
      
      const db = await readDB();
      const user = db.users.find(u => u.id === chatId);
      
      if (data === "show_plans") {
          await handleShowPlans(chatId, db);
      } else if (data === "my_sub") {
          if (user) await handleMySub(chatId, user);
      } else if (data === "support") {
          if (user) {
              user.botState = 'AWAITING_SUPPORT';
              await writeDB(db);
              await sendBaleMessage(chatId, "📝 لطفاً پیام، انتقاد یا سوال خود را در یک پیام متنی ارسال کنید:");
          }
      } else if (data.startsWith("reply_support_")) {
          const targetUserId = data.replace("reply_support_", "");
          if (user) {
              user.botState = 'AWAITING_SUPPORT_REPLY';
              user.stateData = targetUserId;
              await writeDB(db);
              await sendBaleMessage(chatId, "✍️ لطفاً پاسخ خود را تایپ کنید (این پیام مستقیماً برای کاربر ارسال خواهد شد):");
          }
      } else if (data.startsWith("buy_")) {
          const planId = data.replace("buy_", "");
          const plan = db.plans.find(p => p.id === planId);
          if (plan) {
              await sendBaleMessage(
                  chatId, 
                  `شما **${plan.name}** را انتخاب کردید.\n\n💳 مبلغ قابل پرداخت: ${plan.price.toLocaleString('fa-IR')} تومان\nشماره کارت جهت واریز:\n\`${db.settings.cardNumber}\`\n\nپس از پرداخت، برای ارسال رسید روی دکمه زیر کلیک کنید:`,
                  {
                      inline_keyboard: [
                          [{ text: "📤 ارسال رسید پرداختی", callback_data: `pay_${plan.id}` }]
                      ]
                  }
              );
          }
      } else if (data.startsWith("pay_")) {
          const planId = data.replace("pay_", "");
          if (user) {
              user.botState = 'AWAITING_RECEIPT';
              user.stateData = planId;
              await writeDB(db);
              await sendBaleMessage(chatId, "📸 لطفاً عکس فیش واریزی خود را ارسال کنید.");
          }
      } else if (data.startsWith("approve_tx_")) {
          const txId = data.replace("approve_tx_", "");
          if (user) {
              user.botState = 'AWAITING_LINK';
              user.stateData = txId;
              await writeDB(db);
              await sendBaleMessage(chatId, "🔗 لطفاً لینک اشتراک اختصاصی را برای این کاربر ارسال کنید. (به محض ارسال این پیام برای کاربر فروارد می‌شود)");
          }
      } else if (data.startsWith("reject_tx_")) {
          const txId = data.replace("reject_tx_", "");
          const txIndex = db.transactions.findIndex((t: any) => t.id === txId);
          if (txIndex > -1) {
              const tx = db.transactions[txIndex];
              tx.status = 'REJECTED';
              await writeDB(db);
              await sendBaleMessage(tx.userId, "❌ متاسفانه پرداخت شما تایید نشد. اگر مشکلی پیش آمده روی دکمه پشتیبانی کلیک کنید.", {
                  inline_keyboard: [
                      [{ text: "🎧 ارتباط با پشتیبانی", callback_data: "support" }]
                  ]
              });
              await sendBaleMessage(chatId, "❌ تراکنش با موفقیت رد شد.");
          }
      } else if (data === "admin_stats") {
          if (chatId === db.settings.adminChatId) {
              const activeSubsCount = db.users.reduce((acc, u) => acc + (u.subscriptions ? u.subscriptions.filter((s: any) => new Date(s.endDate) > new Date()).length : 0), 0);
              await sendBaleMessage(chatId, `📊 **آمار ربات:**\n\n👥 تعداد کل کاربران: ${db.users.length}\n✅ اشتراک‌های فعال: ${activeSubsCount}\n🎁 تعداد پلن‌ها: ${db.plans.length}`);
          }
      } else if (data === "admin_set_card") {
          if (chatId === db.settings.adminChatId) {
              user.botState = 'ADMIN_SET_CARD';
              await writeDB(db);
              await sendBaleMessage(chatId, `💳 شماره کارت فعلی:\n\`${db.settings.cardNumber}\`\n\nلطفاً شماره کارت جدید را تایپ کرده و ارسال کنید (یا برای انصراف /start را بزنید):`);
          }
      } else if (data === "admin_add_plan") {
          if (chatId === db.settings.adminChatId) {
              user.botState = 'ADMIN_ADD_PLAN_NAME';
              await writeDB(db);
              await sendBaleMessage(chatId, "➕ **افزودن پلن جدید**\n\nلطفاً نام پلن را وارد کنید (مثلاً: اشتراک ۱ ماهه):");
          }
      } else if (data === "admin_delete_plan") {
          if (chatId === db.settings.adminChatId) {
              const buttons = db.plans.map(p => [{ text: `❌ حذف: ${p.name}`, callback_data: `admin_del_plan_${p.id}` }]);
              await sendBaleMessage(chatId, "🗑 **کدام پلن را می‌خواهید حذف کنید؟**", { inline_keyboard: buttons });
          }
      } else if (data.startsWith("admin_del_plan_")) {
          if (chatId === db.settings.adminChatId) {
              const pId = data.replace("admin_del_plan_", "");
              db.plans = db.plans.filter(p => p.id !== pId);
              await writeDB(db);
              await sendBaleMessage(chatId, "✅ پلن با موفقیت حذف شد.");
          }
      }
    }
  } catch (err) {
    console.error("Webhook processing error:", err);
  }
}

// Background Poller
async function startPolling() {
  if (!process.env.BALE_BOT_TOKEN) {
    console.log("No token, skipping polling.");
    return;
  }
  
  // Ensure webhook is removed before polling
  try {
    await fetch(`${getBaleBaseUrl()}/deleteWebhook`);
  } catch (e) {}

  let offset = 0;
  console.log("Started long polling for Bale updates...");
  
  while (true) {
    try {
      const res = await fetch(`${getBaleBaseUrl()}/getUpdates?offset=${offset}&timeout=30`);
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.result && data.result.length > 0) {
          for (const update of data.result) {
            console.log("Polled update:", update.update_id);
            await processUpdate(update);
            offset = update.update_id + 1;
          }
        }
      }
    } catch (e) {
      console.error("Polling error:", e);
      // Wait a bit before retrying on error
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// Start polling in background without awaiting
startPolling();

  // === BALE BOT WEBHOOK ===
  app.post("/api/webhook/bale", async (req, res) => {
    // Respond immediately to avoid timeouts
    res.sendStatus(200);

    const update = req.body;
    console.log("Received webhook update:", JSON.stringify(update, null, 2));
    
    // Log to file for debugging
    fs.appendFileSync("webhook.log", JSON.stringify(update) + "\n");

    if (!update) return;

    await processUpdate(update);
  });

  async function handleShowPlans(chatId: string, db: DB) {
      if (db.plans.length === 0) {
          await sendBaleMessage(chatId, "در حال حاضر هیچ پلن اشتراکی موجود نیست.");
          return;
      }
      
      const buttons = db.plans.map(p => {
          return [{ text: `${p.name} - ${p.price.toLocaleString('fa-IR')} تومان`, callback_data: `buy_${p.id}` }];
      });
      
      await sendBaleMessage(chatId, "🎁 پلن‌های موجود:\nلطفاً یکی را انتخاب کنید:", {
          inline_keyboard: buttons
      });
  }
  
  async function handleMySub(chatId: string, user: User) {
      if (!user.subscriptions || user.subscriptions.length === 0) {
          // Fallback for legacy database records without subscriptions array
          if (user.subscriptionEnd && new Date(user.subscriptionEnd) > new Date()) {
              const date = new Date(user.subscriptionEnd).toLocaleDateString('fa-IR');
              await sendBaleMessage(chatId, `✅ اشتراک قدیمی شما فعال است.\nتاریخ پایان: ${date}`);
          } else {
              await sendBaleMessage(chatId, "❌ شما در حال حاضر هیچ اشتراکی ندارید.");
          }
          return;
      }
      
      const activeSubs = user.subscriptions.filter(s => new Date(s.endDate) > new Date());
      
      if (activeSubs.length === 0) {
          await sendBaleMessage(chatId, "❌ شما در حال حاضر اشتراک فعالی ندارید.");
          return;
      }
      
      let msg = "✅ **اشتراک‌های فعال شما:**\n\n";
      activeSubs.forEach((sub, index) => {
          const date = new Date(sub.endDate).toLocaleDateString('fa-IR');
          msg += `${index + 1}. **${sub.planName}** (شناسه: \`${sub.id}\`)\n⏳ پایان: ${date}\n🔗 لینک: ${sub.joinLink}\n\n`;
      });
      
      await sendBaleMessage(chatId, msg);
  }
  
  // Mock Payment Endpoint (for demo purposes)
  app.get("/mock-pay", async (req, res) => {
      const { user, plan } = req.query;
      res.send(`
          <html lang="fa" dir="rtl">
          <head>
            <meta charset="utf-8">
            <title>درگاه پرداخت آزمایشی</title>
            <style>
              body { font-family: Tahoma, sans-serif; text-align: center; margin-top: 50px; background: #f0f2f5; }
              .card { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); display: inline-block; }
              button { background: #16a34a; color: white; border: none; padding: 10px 20px; font-size: 16px; border-radius: 5px; cursor: pointer; }
            </style>
          </head>
          <body>
            <div class="card">
                <h2>پرداخت آزمایشی</h2>
                <p>در حال پرداخت برای کاربر ${user} و پلن ${plan}</p>
                <form action="/api/mock-pay-verify" method="POST">
                    <input type="hidden" name="user" value="${user}" />
                    <input type="hidden" name="plan" value="${plan}" />
                    <button type="submit">تکمیل پرداخت و بازگشت به ربات</button>
                </form>
            </div>
          </body>
          </html>
      `);
  });
  
  app.post("/api/mock-pay-verify", express.urlencoded({ extended: true }), async (req, res) => {
      const { user, plan } = req.body;
      const db = await readDB();
      const p = db.plans.find(x => x.id === plan);
      const uIndex = db.users.findIndex(x => x.id === user);
      
      if (p && uIndex > -1) {
          const u = db.users[uIndex];
          const currentDate = u.subscriptionEnd && new Date(u.subscriptionEnd) > new Date() 
              ? new Date(u.subscriptionEnd) 
              : new Date();
          currentDate.setDate(currentDate.getDate() + p.durationDays);
          db.users[uIndex].subscriptionEnd = currentDate.toISOString();
          await writeDB(db);
          
          sendBaleMessage(u.id, `🎉 پرداخت شما موفقیت‌آمیز بود!\nاشتراک **${p.name}** فعال شد.\nتاریخ پایان: ${currentDate.toLocaleDateString('fa-IR')}`);
      }
      
      res.send(`
        <html lang="fa" dir="rtl">
        <head><meta charset="utf-8"></head>
        <body style="text-align: center; margin-top: 50px; font-family: Tahoma;">
            <h2>پرداخت با موفقیت انجام شد!</h2>
            <p>می‌توانید به ربات بازگردید.</p>
        </body>
        </html>
      `);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", async (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

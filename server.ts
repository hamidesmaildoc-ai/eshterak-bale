import "dotenv/config";
import fs from "fs";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
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
  try {
    const data = await fs.promises.readFile(DB_FILE, "utf-8");
    return JSON.parse(data) as DB;
  } catch (e) {
    return defaultDB;
  }
}

async function writeDB(data: DB) {
  await fs.promises.writeFile(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
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

async function processUpdate(update: any) {
  try {
    let chatId = "";
    if (update.message) chatId = update.message.chat?.id?.toString() || "";
    if (update.callback_query) chatId = update.callback_query.message?.chat?.id?.toString() || "";

    const db = await readDB();
    const isAdmin = chatId === db.settings.adminChatId || (process.env.ADMIN_CHAT_ID && chatId === process.env.ADMIN_CHAT_ID);

    if (update.message) {
      const message = update.message;
      const text = message.text || "";
      const from = message.from;

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
      
      const isAdmin = chatId === db.settings.adminChatId || (process.env.ADMIN_CHAT_ID && chatId === process.env.ADMIN_CHAT_ID);

      if (text === "/admin") {
          if (isAdmin) {
              user.botState = 'IDLE';
              await writeDB(db);
              await sendBaleMessage(chatId, "🔐 **پنل مدیریت ربات**\n\nلطفاً یکی از گزینه‌های زیر را انتخاب کنید:", {
                  inline_keyboard: [
                      [{ text: "📊 آمار ربات", callback_data: "admin_stats" }, { text: "💳 شماره کارت", callback_data: "admin_set_card" }],
                      [{ text: "➕ افزودن پلن", callback_data: "admin_add_plan" }, { text: "❌ حذف پلن", callback_data: "admin_delete_plan" }],
                      [{ text: "📣 ارسال پیام همگانی", callback_data: "admin_broadcast" }],
                      [{ text: "🎁 تخصیص اشتراک دستی", callback_data: "admin_manual_sub" }],
                      [{ text: "🔍 جستجوی کاربر", callback_data: "admin_search_user" }]
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

      if (user.botState === 'ADMIN_BROADCAST') {
          if (!text) {
              await sendBaleMessage(chatId, "❌ لطفاً پیام متنی ارسال کنید.");
              return;
          }
          user.botState = 'IDLE';
          await writeDB(db);
          let success = 0;
          for (const u of db.users) {
              try {
                  await sendBaleMessage(u.id, `📣 **پیام مدیریت:**\n\n${text}`);
                  success++;
              } catch (e) {
                  // Ignore errors for blocked users
              }
          }
          await sendBaleMessage(chatId, `✅ پیام همگانی شما با موفقیت برای ${success} کاربر ارسال شد.`);
          return;
      }
      
      if (user.botState === 'ADMIN_SEARCH_USER') {
          const targetId = text.replace("@", "").trim();
          const target = db.users.find(u => u.id === targetId || u.username?.toLowerCase() === targetId.toLowerCase());
          user.botState = 'IDLE';
          await writeDB(db);
          if (target) {
              const activeSubs = target.subscriptions ? target.subscriptions.filter((s: any) => new Date(s.endDate) > new Date()) : [];
              let msg = `👤 **اطلاعات کاربر:**\n\n`;
              msg += `شناسه: \`${target.id}\`\nنام: ${target.firstName} ${target.lastName || ''}\nیوزرنیم: @${target.username || 'ندارد'}\n`;
              msg += `تعداد اشتراک‌های فعال: ${activeSubs.length}\n`;
              activeSubs.forEach((s: any) => {
                  msg += `- ${s.planName} (تا ${new Date(s.endDate).toLocaleDateString('fa-IR')})\n`;
              });
              await sendBaleMessage(chatId, msg);
          } else {
              await sendBaleMessage(chatId, "❌ کاربری با این مشخصات یافت نشد.");
          }
          return;
      }
      
      if (user.botState === 'ADMIN_MANUAL_SUB_USER') {
          const target = db.users.find(u => u.id === text);
          if (target) {
              user.botState = 'IDLE';
              await writeDB(db);
              const buttons = db.plans.map(p => [{ text: p.name, callback_data: `admin_giveplan_${target.id}_${p.id}` }]);
              await sendBaleMessage(chatId, `کاربر یافت شد: ${target.firstName} ${target.lastName || ''}\n\n🎁 لطفاً پلن مورد نظر برای تخصیص را انتخاب کنید:`, { inline_keyboard: buttons });
          } else {
              user.botState = 'IDLE';
              await writeDB(db);
              await sendBaleMessage(chatId, "❌ کاربری با این شناسه عددی یافت نشد. لطفاً شناسه دقیق وارد کنید.");
          }
          return;
      }

      if (user.botState === 'ADMIN_MANUAL_SUB_LINK') {
          try {
              const data = JSON.parse(user.stateData);
              const targetUserIndex = db.users.findIndex(u => u.id === data.userId);
              const plan = db.plans.find(p => p.id === data.planId);
              
              if (targetUserIndex > -1 && plan) {
                  const targetUser = db.users[targetUserIndex];
                  if (!targetUser.subscriptions) targetUser.subscriptions = [];
                  
                  const endDate = new Date();
                  endDate.setDate(endDate.getDate() + plan.durationDays);
                  
                  targetUser.subscriptions.push({
                      id: `sub_${Date.now()}`,
                      planId: plan.id,
                      planName: plan.name,
                      startDate: new Date().toISOString(),
                      endDate: endDate.toISOString(),
                      joinLink: text
                  });
                  targetUser.subscriptionEnd = endDate.toISOString(); // For legacy fallback
                  
                  user.botState = 'IDLE';
                  user.stateData = "";
                  await writeDB(db);
                  
                  await sendBaleMessage(targetUser.id, `🎉 **هدیه مدیریت!**\n\nاشتراک: ${plan.name}\nلینک اختصاصی شما:\n${text}\n\nیک اشتراک جدید از طرف مدیریت برای شما فعال شد!`);
                  await sendBaleMessage(chatId, "✅ اشتراک دستی با موفقیت برای کاربر فعال و پیام ارسال شد.");
              }
          } catch (e) {
              console.error(e);
              user.botState = 'IDLE';
              await writeDB(db);
              await sendBaleMessage(chatId, "❌ خطایی رخ داد.");
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
              
              const adminChatId = db.settings.adminChatId || process.env.ADMIN_CHAT_ID;
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
          
          const adminChatId = db.settings.adminChatId || process.env.ADMIN_CHAT_ID;
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
          if (isAdmin) {
              const activeSubsCount = db.users.reduce((acc, u) => acc + (u.subscriptions ? u.subscriptions.filter((s: any) => new Date(s.endDate) > new Date()).length : 0), 0);
              await sendBaleMessage(chatId, `📊 **آمار ربات:**\n\n👥 تعداد کل کاربران: ${db.users.length}\n✅ اشتراک‌های فعال: ${activeSubsCount}\n🎁 تعداد پلن‌ها: ${db.plans.length}`);
          }
      } else if (data === "admin_set_card") {
          if (isAdmin) {
              user.botState = 'ADMIN_SET_CARD';
              await writeDB(db);
              await sendBaleMessage(chatId, `💳 شماره کارت فعلی:\n\`${db.settings.cardNumber}\`\n\nلطفاً شماره کارت جدید را تایپ کرده و ارسال کنید (یا برای انصراف /start را بزنید):`);
          }
      } else if (data === "admin_add_plan") {
          if (isAdmin) {
              user.botState = 'ADMIN_ADD_PLAN_NAME';
              await writeDB(db);
              await sendBaleMessage(chatId, "➕ **افزودن پلن جدید**\n\nلطفاً نام پلن را وارد کنید (مثلاً: اشتراک ۱ ماهه):");
          }
      } else if (data === "admin_delete_plan") {
          if (isAdmin) {
              const buttons = db.plans.map(p => [{ text: `❌ حذف: ${p.name}`, callback_data: `admin_del_plan_${p.id}` }]);
              await sendBaleMessage(chatId, "🗑 **کدام پلن را می‌خواهید حذف کنید؟**", { inline_keyboard: buttons });
          }
      } else if (data.startsWith("admin_del_plan_")) {
          if (isAdmin) {
              const pId = data.replace("admin_del_plan_", "");
              db.plans = db.plans.filter(p => p.id !== pId);
              await writeDB(db);
              await sendBaleMessage(chatId, "✅ پلن با موفقیت حذف شد.");
          }
      } else if (data === "admin_broadcast") {
          if (isAdmin) {
              user.botState = 'ADMIN_BROADCAST';
              await writeDB(db);
              await sendBaleMessage(chatId, "📣 **ارسال پیام همگانی**\n\nلطفاً پیام متنی خود را بفرستید تا برای همه کاربران ربات ارسال شود:\n(برای انصراف /start را بزنید)");
          }
      } else if (data === "admin_search_user") {
          if (isAdmin) {
              user.botState = 'ADMIN_SEARCH_USER';
              await writeDB(db);
              await sendBaleMessage(chatId, "🔍 **جستجوی کاربر**\n\nلطفاً شناسه عددی (ID) یا یوزرنیم کاربر را با @ بفرستید:");
          }
      } else if (data === "admin_manual_sub") {
          if (isAdmin) {
              user.botState = 'ADMIN_MANUAL_SUB_USER';
              await writeDB(db);
              await sendBaleMessage(chatId, "🎁 **تخصیص اشتراک دستی**\n\nلطفاً شناسه عددی (ID) کاربری که می‌خواهید به او اشتراک هدیه دهید را بفرستید:");
          }
      } else if (data.startsWith("admin_giveplan_")) {
          if (isAdmin) {
              const parts = data.replace("admin_giveplan_", "").split("_");
              const targetId = parts[0];
              const planId = parts.slice(1).join("_");
              
              user.botState = 'ADMIN_MANUAL_SUB_LINK';
              user.stateData = JSON.stringify({ userId: targetId, planId: planId });
              await writeDB(db);
              
              await sendBaleMessage(chatId, "🔗 لطفاً لینک اختصاصی (لینک اتصال VPN) را برای این کاربر بفرستید تا به همراه اشتراک برایش ارسال شود:");
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"; // v2
import { Telegraf, Context } from "https://esm.sh/telegraf@4.12.2";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

// ============================================================
//  1. SOZLAMALAR — faqat env dan olinadi, hech qanday hardcode yo'q
// ============================================================
const BOT_TOKEN    = Deno.env.get("BOT_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SECRET_KEYS") 
  ? JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")!).service_role 
  : Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_ID_STR = Deno.env.get("ADMIN_TELEGRAM_ID");
const MINI_APP_URL = Deno.env.get("MINI_APP_URL") ?? "https://smart-greenhouse-opal.vercel.app/";

if (!BOT_TOKEN)    throw new Error("❌ BOT_TOKEN topilmadi!");
if (!SUPABASE_URL) throw new Error("❌ SUPABASE_URL topilmadi!");
if (!SUPABASE_KEY) throw new Error("❌ SUPABASE_SERVICE_ROLE_KEY topilmadi!");
if (!ADMIN_ID_STR) throw new Error("❌ ADMIN_TELEGRAM_ID topilmadi!");

const ADMIN_ID = parseInt(ADMIN_ID_STR, 10);
if (isNaN(ADMIN_ID)) throw new Error("❌ ADMIN_TELEGRAM_ID raqam bo'lishi kerak!");

// ============================================================
//  2. SUPABASE VA BOT
// ============================================================
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});
const bot = new Telegraf(BOT_TOKEN);

// ============================================================
//  3. TURLAR — jadval tuzilmasiga mos (web sayt bilan bir xil)
// ============================================================
interface SensorLog {
  id: number;
  created_at: string;
  temperature: number | null;
  humidity: number | null;
  soil_moisture: number | null;
  light_level: number | null;
  gas_level: number | null;
}

// device_settings — bot yozadi, web sayt o'qiydi
interface DeviceSettings {
  id: number;
  updated_at: string;
  max_temp: number;          // web: settings.max_temp
  min_soil_moisture: number; // web: settings.min_soil_moisture
  max_gas: number;           // web: settings.max_gas
  cooler_status: boolean;    // web: deviceState.cooler_status
  pump_status: boolean;      // web: deviceState.pump_status
}

interface AllowedUser {
  id: number;
  telegram_id: number;
  full_name: string | null;
  role: "creator" | "admin" | "viewer";
  created_at: string;
}

// ============================================================
//  4. YORDAMCHI FUNKSIYALAR
// ============================================================

/** device_settings id=1 qatorini o'qiydi, yo'q bo'lsa default yaratadi */
async function getOrCreateSettings(): Promise<DeviceSettings> {
  const { data, error } = await supabase
    .from("device_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw new Error("Sozlamalarni o'qishda xatolik: " + error.message);

  if (!data) {
    const { data: created, error: insertErr } = await supabase
      .from("device_settings")
      .insert([{ id: 1, max_temp: 30.0, min_soil_moisture: 40.0, max_gas: 300.0, cooler_status: false, pump_status: false }])
      .select()
      .single();
    if (insertErr) throw new Error("Default sozlamalar yaratishda xatolik: " + insertErr.message);
    return created as DeviceSettings;
  }
  return data as DeviceSettings;
}

/** sensor_logs dan oxirgi yozuvni o'qiydi */
async function getLatestSensorLog(): Promise<SensorLog | null> {
  const { data, error } = await supabase
    .from("sensor_logs")
    .select("*")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error("Sensor loglarini o'qishda xatolik: " + error.message);
  return data as SensorLog | null;
}

/** Sozlamalar xabari matni va inline klaviaturasi */
async function buildSettingsMessage() {
  const s = await getOrCreateSettings();

  const coolerLabel  = s.cooler_status ? "🟢 YOQILGAN" : "🔴 O'CHIRILGAN";
  const pumpLabel    = s.pump_status   ? "🟢 YOQILGAN" : "🔴 O'CHIRILGAN";
  const coolerToggle = s.cooler_status ? "💨 Kullerni O'chirish" : "💨 Kullerni Yoqish";
  const pumpToggle   = s.pump_status   ? "🚰 Nasosni O'chirish"  : "🚰 Nasosni Yoqish";

  const text =
    `⚙️ <b>Smart Parnik — Sozlamalar va Boshqaruv</b>\n\n` +
    `🌡 Maks. harorat:      <code>${s.max_temp.toFixed(1)}°C</code>\n` +
    `💧 Min. tuproq namligi: <code>${s.min_soil_moisture}%</code>\n` +
    `💨 Maks. gaz (CO₂):    <code>${s.max_gas} ppm</code>\n\n` +
    `🔌 <b>Aktuatorlar holati:</b>\n` +
    `   💨 Kuller (Fan): <b>${coolerLabel}</b>\n` +
    `   🚰 Suv Nasosi:   <b>${pumpLabel}</b>\n\n` +
    `<i>Web sayt va bot bir xil ma'lumotni ko'rsatadi (device_settings).</i>`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: "🌡 Harorat −0.5°C", callback_data: "temp_down" },
        { text: "🌡 Harorat +0.5°C", callback_data: "temp_up"   },
      ],
      [
        { text: "💧 Tuproq −5%", callback_data: "soil_down" },
        { text: "💧 Tuproq +5%", callback_data: "soil_up"   },
      ],
      [
        { text: "💨 Gaz −50 ppm", callback_data: "gas_down" },
        { text: "💨 Gaz +50 ppm", callback_data: "gas_up"   },
      ],
      [
        { text: coolerToggle, callback_data: "toggle_cooler" },
        { text: pumpToggle,   callback_data: "toggle_pump"   },
      ],
      [{ text: "🔄 Yangilash", callback_data: "refresh_settings" }],
    ],
  };

  return { text, keyboard };
}

/** Asosiy reply klaviatura */
function buildMainMenu(tgId: number) {
  const rows = [
    [{ text: "🖥 Panelni Ochish" }, { text: "⚙️ Sozlamalar" }],
    [{ text: "📊 Tezkor Status" }],
  ];
  if (tgId === ADMIN_ID) {
    rows.push([{ text: "➕ Foydalanuvchi Qo'shish" }]);
    rows.push([{ text: "👥 Foydalanuvchilar Ro'yxati" }]);
  }
  return { keyboard: rows, resize_keyboard: true };
}

/** Foydalanuvchi ruxsatini tekshiradi */
async function isAllowed(tgId: number): Promise<boolean> {
  if (tgId === ADMIN_ID) return true;
  const { data } = await supabase
    .from("allowed_users")
    .select("telegram_id")
    .eq("telegram_id", tgId)
    .maybeSingle();
  return data !== null;
}

/** Telegram kontekstdan to'liq ism oladi */
function getFullName(ctx: Context): string {
  const f = ctx.from;
  if (!f) return "Foydalanuvchi";
  return `${f.first_name ?? ""} ${f.last_name ?? ""}`.trim() || "Foydalanuvchi";
}

/** Foydalanuvchiga xabar yuborish (bot bilan suhbat boshlamagan bo'lsa jimgina o'tadi) */
async function notifyUser(tgId: number, text: string) {
  try {
    await bot.telegram.sendMessage(tgId, text, { parse_mode: "HTML" });
  } catch {
    // Foydalanuvchi botni bloklagan yoki /start bosmagan
  }
}

// ============================================================
//  5. GLOBAL XAVFSIZLIK MIDDLEWARE
// ============================================================
bot.use(async (ctx, next) => {
  const tgId = ctx.from?.id;
  if (!tgId) return;
  if (await isAllowed(tgId)) return next();

  await ctx.reply(
    `⛔️ <b>Kirish taqiqlangan.</b>\n` +
    `Tizimdan foydalanish uchun Admin ruxsati kerak.\n\n` +
    `Telegram ID: <code>${tgId}</code>`,
    { parse_mode: "HTML", reply_markup: { remove_keyboard: true } }
  );
});

// ============================================================
//  6. /start
// ============================================================
bot.start(async (ctx) => {
  const tgId     = ctx.from.id;
  const fullName = getFullName(ctx);

  if (tgId === ADMIN_ID) {
    await supabase
      .from("allowed_users")
      .upsert([{ telegram_id: tgId, full_name: fullName, role: "creator" }], { onConflict: "telegram_id" });

    return ctx.reply(
      `👑 <b>Tizim Administratori paneliga xush kelibsiz!</b>\nSalom, <b>${fullName}</b>!`,
      { parse_mode: "HTML", reply_markup: buildMainMenu(tgId) }
    );
  }

  await supabase
    .from("allowed_users")
    .update({ full_name: fullName })
    .eq("telegram_id", tgId);

  return ctx.reply(
    `🟢 Tizimga xush kelibsiz, <b>${fullName}</b>!\nParnik nazorati faol.`,
    { parse_mode: "HTML", reply_markup: buildMainMenu(tgId) }
  );
});

// ============================================================
//  7. PANELNI OCHISH
// ============================================================
bot.hears("🖥 Panelni Ochish", (ctx) => {
  return ctx.reply("Smart Greenhouse boshqaruv paneli:", {
    reply_markup: {
      inline_keyboard: [[{ text: "🖥 Panelni Ochish", web_app: { url: MINI_APP_URL } }]],
    },
  });
});

// ============================================================
//  8. TEZKOR STATUS — sensor_logs + device_settings
//     Web sayt bilan bir xil manba
// ============================================================
bot.hears("📊 Tezkor Status", async (ctx) => {
  let text: string;

  try {
    const [log, settings] = await Promise.all([
      getLatestSensorLog(),
      getOrCreateSettings(),
    ]);

    if (!log) {
      return ctx.reply("⚠️ Hozircha sensor ma'lumotlari mavjud emas.\nESP32 ulanganmi?");
    }

    // Harorat holati (web sayt max_temp bilan taqqoslaydi, bot ham shunday qiladi)
    const tempStatus  = log.temperature  !== null && log.temperature  > settings.max_temp         ? "🔴" : "🟢";
    const soilStatus  = log.soil_moisture !== null && log.soil_moisture < settings.min_soil_moisture ? "🔴" : "🟢";
    const gasStatus   = log.gas_level     !== null && log.gas_level    > settings.max_gas            ? "🔴" : "🟢";
    const coolerIcon  = settings.cooler_status ? "🟢 YOQILGAN" : "🔴 O'CHIRILGAN";
    const pumpIcon    = settings.pump_status   ? "🟢 YOQILGAN" : "🔴 O'CHIRILGAN";

    const lastSync = new Date(log.created_at).toLocaleString("uz-UZ", {
      day: "2-digit", month: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });

    text =
      `📊 <b>Parnik joriy holati</b>\n\n` +
      `${tempStatus} 🌡 Harorat:        <code>${log.temperature ?? "--"}°C</code>  <i>(limit: ${settings.max_temp}°C)</i>\n` +
      `🌊 💧 Havo namligi:    <code>${log.humidity ?? "--"}%</code>\n` +
      `${soilStatus} 🌱 Tuproq namligi: <code>${log.soil_moisture ?? "--"}%</code>  <i>(min: ${settings.min_soil_moisture}%)</i>\n` +
      `☀️ Yorug'lik:         <code>${log.light_level ?? "--"}%</code>\n` +
      `${gasStatus} 💨 Gaz (CO₂):      <code>${log.gas_level ?? "--"} ppm</code>  <i>(limit: ${settings.max_gas} ppm)</i>\n\n` +
      `🔌 <b>Aktuatorlar:</b>\n` +
      `   💨 Kuller: <b>${coolerIcon}</b>\n` +
      `   🚰 Nasos:  <b>${pumpIcon}</b>\n\n` +
      `🕒 <i>Oxirgi yangilanish: ${lastSync}</i>`;
  } catch (err) {
    text = "❌ Ma'lumotlarni o'qishda xatolik: " + (err as Error).message;
  }

  return ctx.reply(text, { parse_mode: "HTML" });
});

// ============================================================
//  9. SOZLAMALAR MENYUSI
// ============================================================
bot.hears("⚙️ Sozlamalar", async (ctx) => {
  const { text, keyboard } = await buildSettingsMessage();
  return ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
});

// ============================================================
//  10. FOYDALANUVCHI QO'SHISH (faqat admin)
// ============================================================
bot.hears("➕ Foydalanuvchi Qo'shish", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  return ctx.reply(
    "Yangi foydalanuvchi qo'shish uchun:\n• <b>Telegram ID</b> raqamini yozing\n• Yoki kontaktini ulashing 👇",
    {
      parse_mode: "HTML",
      reply_markup: {
        keyboard: [
          [{ text: "📱 Kontaktni ulashish", request_contact: true }],
          [{ text: "❌ Bekor qilish" }],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    }
  );
});

bot.on("contact", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const contact = ctx.message.contact;

  if (!contact.user_id) {
    return ctx.reply("⚠️ Kontakt egasining Telegram ID aniqlanmadi.\nID raqamini matn ko'rinishida yozing:", {
      reply_markup: buildMainMenu(ADMIN_ID),
    });
  }

  const newId   = contact.user_id;
  const newName = `${contact.first_name} ${contact.last_name ?? ""}`.trim();

  const { error } = await supabase
    .from("allowed_users")
    .insert([{ telegram_id: newId, full_name: newName, role: "admin" }]);

  if (error?.code === "23505") {
    return ctx.reply("⚠️ Bu foydalanuvchi allaqachon tizimda mavjud.", { reply_markup: buildMainMenu(ADMIN_ID) });
  }
  if (error) {
    return ctx.reply("❌ Xatolik: " + error.message, { reply_markup: buildMainMenu(ADMIN_ID) });
  }

  await notifyUser(newId, `✅ Sizga <b>Smart Parnik</b> tizimiga kirish ruxsati berildi!\nBotni ishlatish uchun /start bosing.`);

  return ctx.reply(
    `✅ <b>${newName}</b> muvaffaqiyatli qo'shildi!\nID: <code>${newId}</code>`,
    { parse_mode: "HTML", reply_markup: buildMainMenu(ADMIN_ID) }
  );
});

// ============================================================
//  11. FOYDALANUVCHILAR RO'YXATI (faqat admin)
// ============================================================
bot.hears("👥 Foydalanuvchilar Ro'yxati", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  const { data: users, error } = await supabase
    .from("allowed_users")
    .select("telegram_id, full_name, role")
    .order("id", { ascending: true });

  if (error || !users?.length) {
    return ctx.reply("⚠️ Foydalanuvchilar ro'yxati bo'sh.");
  }

  const roleEmoji: Record<string, string> = { creator: "👑", admin: "🛡", viewer: "👁" };
  const lines = (users as AllowedUser[]).map(
    (u) => `${roleEmoji[u.role] ?? "👤"} <b>${u.full_name ?? "Noma'lum"}</b> — <code>${u.telegram_id}</code>`
  );

  return ctx.reply(
    `👥 <b>Tizim foydalanuvchilari (${users.length} ta):</b>\n\n` + lines.join("\n"),
    { parse_mode: "HTML", reply_markup: buildMainMenu(ADMIN_ID) }
  );
});

// ============================================================
//  12. BEKOR QILISH
// ============================================================
bot.hears("❌ Bekor qilish", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  return ctx.reply("Jarayon bekor qilindi.", { reply_markup: buildMainMenu(ADMIN_ID) });
});

// ============================================================
//  13. MATN ORQALI ID QABUL QILISH (admin uchun)
// ============================================================
bot.on("message", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  if (!("text" in ctx.message)) return;

  const text = ctx.message.text.trim();

  // 6–12 xonali son → yangi foydalanuvchi ID si
  if (/^\d{6,12}$/.test(text)) {
    const newId = parseInt(text, 10);

    const { error } = await supabase
      .from("allowed_users")
      .insert([{ telegram_id: newId, full_name: "Foydalanuvchi", role: "admin" }]);

    if (error?.code === "23505") {
      return ctx.reply("⚠️ Bu ID allaqachon tizimda mavjud.", { reply_markup: buildMainMenu(ADMIN_ID) });
    }
    if (error) {
      return ctx.reply("❌ Xatolik: " + error.message, { reply_markup: buildMainMenu(ADMIN_ID) });
    }

    await notifyUser(newId, `✅ Sizga <b>Smart Parnik</b> tizimiga kirish ruxsati berildi!\nBotni ishlatish uchun /start bosing.`);

    return ctx.reply(
      `✅ ID <code>${newId}</code> tizimga qo'shildi.\n<i>Foydalanuvchi /start bosganda ismi yangilanadi.</i>`,
      { parse_mode: "HTML", reply_markup: buildMainMenu(ADMIN_ID) }
    );
  }

  // Noma'lum matn
  return ctx.reply("Amalni tanlang:", { reply_markup: buildMainMenu(ADMIN_ID) });
});

// ============================================================
//  14. INLINE CALLBACK TUGMALARI — device_settings ga yozadi
//      Web sayt realtime channel orqali o'zgarishni avtomatik oladi
// ============================================================
bot.on("callback_query", async (ctx) => {
  if (!("data" in ctx.callbackQuery)) return;
  const action = ctx.callbackQuery.data;

  try {
    const s = await getOrCreateSettings();
    let patch: Partial<DeviceSettings> | null = null;

    switch (action) {
      // Harorat chegarasi (±0.5°C)
      case "temp_up":   patch = { max_temp: +(s.max_temp + 0.5).toFixed(1) }; break;
      case "temp_down": patch = { max_temp: +(s.max_temp - 0.5).toFixed(1) }; break;

      // Tuproq namligi chegarasi (±5%, 0–100 oralig'ida)
      case "soil_up":   patch = { min_soil_moisture: Math.min(s.min_soil_moisture + 5, 100) }; break;
      case "soil_down": patch = { min_soil_moisture: Math.max(s.min_soil_moisture - 5, 0)   }; break;

      // Gaz chegarasi (±50 ppm, 0 dan past bo'lmaydi)
      case "gas_up":   patch = { max_gas: s.max_gas + 50 };                      break;
      case "gas_down": patch = { max_gas: Math.max(s.max_gas - 50, 0) };         break;

      // Rele qo'lda boshqarish
      case "toggle_cooler": patch = { cooler_status: !s.cooler_status }; break;
      case "toggle_pump":   patch = { pump_status:   !s.pump_status   }; break;

      // Faqat qayta o'qish
      case "refresh_settings": patch = null; break;
    }

    if (patch) {
      const { error } = await supabase
        .from("device_settings")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", 1);

      if (error) {
        await ctx.answerCbQuery("❌ Saqlashda xatolik: " + error.message);
        return;
      }
    }

    // Xaberni yangilash (web sayt Realtime orqali o'zgarishni avtomatik oladi)
    const { text, keyboard } = await buildSettingsMessage();
    await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard }).catch(() => {});
    await ctx.answerCbQuery("✅ Yangilandi");

  } catch (err) {
    await ctx.answerCbQuery("❌ Xatolik yuz berdi");
    console.error("callback_query xatolik:", err);
  }
});

// ============================================================
//  15. WEBHOOK HTTP SERVER
// ============================================================
serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Smart Greenhouse Bot ✅ ishlamoqda", { status: 200 });
  }
  try {
    const body = await req.json();
    await bot.handleUpdate(body);
    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("handleUpdate xatolik:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
});
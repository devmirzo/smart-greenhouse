# 🌿 Smart Greenhouse Monitor

Aqlli issiqxona monitoring va boshqaruv tizimi — ESP32, Telegram Bot va React web panel.

## 🏗 Loyiha tarkibi

| Komponent | Texnologiya | Vazifa |
|---|---|---|
| **Web Panel** | React + Vite + Tailwind | Real-vaqt monitoring dashboard |
| **Telegram Bot** | TypeScript + Telegraf (Deno) | Bildirishnomalar va boshqaruv |
| **Mikrokontroller** | ESP32 (C++) | Sensorlar o'qish va relay boshqaruv |
| **Ma'lumotlar bazasi** | Supabase (PostgreSQL) | Sensor loglari va sozlamalar |

## 📡 Sensorlar

- 🌡 **DHT11** — Havo harorati va namligi (pin 4)
- 💧 **Tuproq namligi sensori** — Analog (pin 34)
- ☀️ **LDR foto-rezistor** — Yorug'lik darajasi (pin 32)
- 💨 **Gaz sensori (MQ)** — CO₂ / gaz darajasi (pin 35)

## ⚙️ Aktuatorlar

- 💨 **Havo kuller (Fan)** — pin 12
- 🚰 **Suv nasosi (Pump)** — pin 14

## 🗄 Supabase jadvallar

- `sensor_logs` — ESP32 dan 15 soniyada bir keladigan o'lchovlar
- `device_settings` — Chegaralar va relay holatlari (id=1)
- `allowed_users` — Bot foydalanuvchilari

## 🚀 Ishga tushirish

```bash
npm install
npm run dev
```

## 🌍 Deploy

Vercel orqali avtomatik deploy. `vercel.json` SPA routing sozlamasi mavjud.

## 🔐 Environment variables

`.env` faylida:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
```

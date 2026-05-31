#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>
#include <DHT.h>
#include <ArduinoJson.h>  // Kutubxona: Sketch -> Include Library -> Manage Libraries -> "ArduinoJson"

// ── Wi-Fi sozlamalari ──────────────────────────────────────────
#define WIFI_SSID     "Tp-link"
#define WIFI_PASSWORD "12345677"

// ── Supabase sozlamalari ───────────────────────────────────────
#define SUPABASE_URL "https://xjspqmayhmcnvbysnwii.supabase.co/rest/v1/"
#define SUPABASE_KEY "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhqc3BxbWF5aG1jbnZieXNud2lpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzOTQwNzQsImV4cCI6MjA3OTk3MDA3NH0.Tn_M09sNt0MHgRATUVxsDNxyEvmZ2mKumBrs-uDEC9c"

// ── Sensor ma'lumotlari ────────────────────────────────────────
#define SENSOR_ID   "DHT11_ROOM_01"
#define SENSOR_NAME "Xona iqlim sensori"

#define DHTPIN  4
#define DHTTYPE DHT11

DHT dht(DHTPIN, DHTTYPE);

// Global client (har safar yangi yaratmaslik uchun)
WiFiClientSecure client;

// ── WiFi ulanish / qayta ulanish ───────────────────────────────
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.print("Wi-Fi ga ulanmoqda: ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("
✅ Wi-Fi ulandi! IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("
❌ Wi-Fi ulanmadi. 30 soniyadan so'ng qayta uriniladi.");
  }
}

// ── Supabase ga yuborish ───────────────────────────────────────
bool sendToSupabase(const String& jsonPayload) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("❌ Wi-Fi yo'q, yuborib bo'lmadi.");
    return false;
  }

  HTTPClient http;
  http.begin(client, String(SUPABASE_URL) + "sensors");

  http.addHeader("Content-Type",  "application/json");
  http.addHeader("apikey",        SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  http.addHeader("Prefer",        "resolution=merge-duplicates");

  Serial.print("📤 Yuborilmoqda: ");
  Serial.println(jsonPayload);

  int httpCode = http.POST(jsonPayload);

  if (httpCode == 200 || httpCode == 201) {
    Serial.println("✅ Supabase qabul qildi. Kod: " + String(httpCode));
    http.end();
    return true;
  } else {
    String response = http.getString();
    Serial.println("❌ Xato kod: " + String(httpCode));
    Serial.println("❌ Javob: " + response);
    http.end();
    return false;
  }
}

// ── JSON yasash (ArduinoJson bilan) ───────────────────────────
String buildJson(float temp, float hum, bool includeClimate) {
  StaticJsonDocument<256> doc;
  doc["snr_id"]     = SENSOR_ID;
  doc["name"]       = SENSOR_NAME;
  doc["connection"] = "Online";

  if (includeClimate) {
    doc["temperature"] = round(temp * 10.0) / 10.0;
    doc["humidity"]    = round(hum  * 10.0) / 10.0;
  }

  String output;
  serializeJson(doc, output);
  return output;
}

// Xato sanagich
int errorCount = 0;

void setup() {
  Serial.begin(115200);
  delay(10);

  // SSL sertifikat tekshiruvi (ishlab chiqishda setInsecure OK)
  // Production da: client.setFingerprint(SUPABASE_FINGERPRINT) ishlatish tavsiya etiladi
  client.setInsecure();

  connectWiFi();
  dht.begin();
  delay(2000); // DHT11 stabilizatsiya uchun minimum 2 soniya

  Serial.println("🚀 Qurilma ishga tushdi. Online xabar yuborilmoqda...");
  sendToSupabase(buildJson(0, 0, false));
}

void loop() {
  // Har loop da WiFi tekshiriladi va kerak bo'lsa reconnect qilinadi
  connectWiFi();

  float t = dht.readTemperature();
  float h = dht.readHumidity();

  if (isnan(t) || isnan(h)) {
    errorCount++;
    Serial.printf("❌ DHT11 o'qib bo'lmadi! Xato soni: %d
", errorCount);

    // 5 marta ketma-ket xato bo'lsa ESP qayta ishga tushadi
    if (errorCount >= 5) {
      Serial.println("🔁 Juda ko'p xato — ESP qayta ishga tushmoqda...");
      delay(1000);
      ESP.restart();
    }

    delay(3000);
    return;
  }

  // Muvaffaqiyatli o'qishda xato sanagich sifirlanadi
  errorCount = 0;

  Serial.printf("🌡 Harorat: %.1f°C | 💧 Namlik: %.1f%%
", t, h);

  bool ok = sendToSupabase(buildJson(t, h, true));
  if (!ok) {
    Serial.println("⚠️ Yuborishda xatolik. Keyingi urinish 10 soniyadan so'ng.");
  }

  delay(10000);
}

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

// ============================================================
// 1. WiFi VA SUPABASE SOZLAMALARI
// ============================================================
const char* ssid     = "Hamidullo";
const char* password = "11223344";

const String SUPABASE_URL = "https://litohgphfmkomdhjiaop.supabase.co/rest/v1";
const String SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpdG9oZ3BoZm1rb21kaGppYW9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNTk2NDAsImV4cCI6MjA5NDkzNTY0MH0.yssxa2TNLHOlF08tiDCj3aV_iHiYBLh8NobKV-gMJXA";

// ============================================================
// 2. PIN KONFIGURATSIYASI
// ============================================================
#define DHTPIN      4
#define DHTTYPE     DHT11
#define SOIL_PIN    34
#define LIGHT_PIN   32
#define GAS_PIN     35
#define FAN_PIN     12
#define PUMP_PIN    14

DHT dht(DHTPIN, DHTTYPE);

// ============================================================
// 3. GLOBAL O'ZGARUVCHILAR
//    Hammasi device_settings jadvalidan olinadi
// ============================================================
float max_temp         = 30.0;
int   min_soil_moisture = 40;
float max_gas          = 300.0;
bool  cooler_status    = false;
bool  pump_status      = false;
bool  is_automated     = true;   // device_settings.is_automated yo'q —
                                  // shu sababli default true qoldirildi,
                                  // botdan qo'lda o'zgartirish imkoni bor

unsigned long lastTime   = 0;
const unsigned long DELAY = 15000;  // 15 soniya

// ============================================================
// 4. YORDAMCHI: umumiy HTTP headerlarni qo'shish
// ============================================================
void addHeaders(HTTPClient &http, bool withContentType = false) {
  http.addHeader("apikey",        SUPABASE_KEY);
  http.addHeader("Authorization", "Bearer " + SUPABASE_KEY);
  if (withContentType)
    http.addHeader("Content-Type", "application/json");
}

// ============================================================
// 5. SETUP
// ============================================================
void setup() {
  Serial.begin(115200);
  dht.begin();

  pinMode(FAN_PIN,  OUTPUT);
  pinMode(PUMP_PIN, OUTPUT);
  digitalWrite(FAN_PIN,  LOW);
  digitalWrite(PUMP_PIN, LOW);

  WiFi.begin(ssid, password);
  Serial.print("WiFi-ga ulanmoqda");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n🟢 WiFi ulandi: " + WiFi.localIP().toString());
}

// ============================================================
// 6. ASOSIY SIKL
// ============================================================
void loop() {
  if ((millis() - lastTime < DELAY) || WiFi.status() != WL_CONNECTED) return;
  lastTime = millis();

  // ==========================================================
  // 6.1 — device_settings dan me'yorlar VA relay statuslarini o'qish
  //       (device_status jadvali o'chirilgan — hamma narsa bu yerda)
  // ==========================================================
  {
    HTTPClient http;
    String url = SUPABASE_URL +
      "/device_settings?id=eq.1"
      "&select=max_temp,min_soil_moisture,max_gas,cooler_status,pump_status";

    http.begin(url);
    addHeaders(http);

    int code = http.GET();
    if (code == 200) {
      DynamicJsonDocument doc(512);
      deserializeJson(doc, http.getString());

      max_temp          = doc[0]["max_temp"].as<float>();
      min_soil_moisture = doc[0]["min_soil_moisture"].as<int>();
      max_gas           = doc[0]["max_gas"].as<float>();

      // Qo'lda boshqarish rejimida bot o'rnatgan statuslarni olamiz
      if (!is_automated) {
        cooler_status = doc[0]["cooler_status"].as<bool>();
        pump_status   = doc[0]["pump_status"].as<bool>();
      }

      Serial.printf("✅ Settings: max_temp=%.1f°C | min_soil=%d%% | max_gas=%.0fppm\n",
                    max_temp, min_soil_moisture, max_gas);
    } else {
      Serial.printf("❌ device_settings GET xato: %d\n", code);
    }
    http.end();
  }

  // ==========================================================
  // 6.2 — Datchiklar o'qish
  // ==========================================================
  float t = dht.readTemperature();
  float h = dht.readHumidity();

  if (isnan(t) || isnan(h)) {
    Serial.println("❌ DHT11 o'qib bo'lmadi! Qayta uriniladi...");
    return;
  }

  // Tuproq namligi: 4095 = quruq (0%), 1500 = ho'l (100%)
  int soil_raw      = analogRead(SOIL_PIN);
  int soil_moisture = constrain(map(soil_raw, 4095, 1500, 0, 100), 0, 100);

  // Yorug'lik: 0 = qorong'i, 4095 = yorug'
  int light_raw   = analogRead(LIGHT_PIN);
  int light_level = constrain(map(light_raw, 0, 4095, 0, 100), 0, 100);

  // Gaz sensori: analog qiymat (0–4095), ppm ga taxminiy
  int gas_raw   = analogRead(GAS_PIN);
  int gas_level = map(gas_raw, 0, 4095, 0, 1000);  // taxminiy ppm

  Serial.printf("🌡 T=%.1f°C | H=%.0f%% | Soil=%d%% | Light=%d%% | Gas=%dppm\n",
                t, h, soil_moisture, light_level, gas_level);

  // ==========================================================
  // 6.3 — Relay mantiqiy boshqaruv (faqat avtomatik rejimda)
  // ==========================================================
  if (is_automated) {
    cooler_status = (t > max_temp) || (gas_level > max_gas);
    pump_status   = (soil_moisture < min_soil_moisture);
  }

  digitalWrite(FAN_PIN,  cooler_status ? HIGH : LOW);
  digitalWrite(PUMP_PIN, pump_status   ? HIGH : LOW);

  Serial.printf("🔌 Fan=%s | Pump=%s\n",
                cooler_status ? "ON" : "OFF",
                pump_status   ? "ON" : "OFF");

  // ==========================================================
  // 6.4 — sensor_logs ga yangi qator qo'shish (INSERT)
  // ==========================================================
  {
    HTTPClient http;
    http.begin(SUPABASE_URL + "/sensor_logs");
    addHeaders(http, true);
    http.addHeader("Prefer", "return=minimal");  // javob tanasini qaytarmasin

    StaticJsonDocument<256> doc;
    doc["temperature"]   = t;
    doc["humidity"]      = h;
    doc["soil_moisture"] = soil_moisture;
    doc["light_level"]   = light_level;
    doc["gas_level"]     = gas_level;

    String body;
    serializeJson(doc, body);

    int code = http.POST(body);
    if (code >= 200 && code < 300) {
      Serial.println("📤 sensor_logs ga saqlandi.");
    } else {
      Serial.printf("❌ sensor_logs POST xato: %d\n", code);
    }
    http.end();
  }

  // ==========================================================
  // 6.5 — device_settings dagi relay statuslarini yangilash (PATCH)
  //        Faqat avtomatik rejimda — bot bilsin deb
  // ==========================================================
  if (is_automated) {
    HTTPClient http;
    http.begin(SUPABASE_URL + "/device_settings?id=eq.1");
    addHeaders(http, true);
    http.addHeader("Prefer", "return=minimal");

    StaticJsonDocument<128> doc;
    doc["cooler_status"] = cooler_status;
    doc["pump_status"]   = pump_status;

    String body;
    serializeJson(doc, body);

    int code = http.PATCH(body);
    if (code >= 200 && code < 300) {
      Serial.println("🔄 device_settings relay holati yangilandi.");
    } else {
      Serial.printf("❌ device_settings PATCH xato: %d\n", code);
    }
    http.end();
  }
}

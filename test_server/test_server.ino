#include <PZEM004Tv30.h>
#include <HardwareSerial.h>
#include <WiFiManager.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

#define API_SERVER "https://chetrika-rayz.onrender.com"
#define API_DATA_PATH "/api/data?api_key=cms-device-key-default"
#define FW_VERSION "1.0.0"

String deviceID;

#define CT_RATIO 40

LiquidCrystal_I2C lcd(0x27, 20, 4);

HardwareSerial SerialPZEM1(1);
HardwareSerial SerialPZEM2(2);

PZEM004Tv30 pzem1(SerialPZEM1, 16, 17);
PZEM004Tv30 pzem2(SerialPZEM2, 18, 19);

float v1, i1, p1, e1, f1, pf1;
float v2, i2, p2, e2, f2, pf2;

float v3, i3, p3, e3, f3, pf3;
float v4, i4, p4, e4, f4, pf4;

String slaveBuffer = "";

unsigned long lastPageChange = 0;
int page = 0;
unsigned long lastLCD = 0;

void readMeter(PZEM004Tv30 &pzem,
               float &V,
               float &I,
               float &P,
               float &E,
               float &F,
               float &PF)
{
  V = pzem.voltage();

  if (isnan(V) || V <= 0)
  {
    V = I = P = E = F = PF = 0;
    return;
  }

  I  = pzem.current();
  P  = pzem.power();
  E  = pzem.energy();
  F  = pzem.frequency();
  PF = pzem.pf();

  if (isnan(I)) I = 0;
  if (isnan(P)) P = 0;
  if (isnan(E)) E = 0;
  if (isnan(F)) F = 0;
  if (isnan(PF)) PF = 0;
}

String fmt(float val, int prec)
{
  if (isnan(val)) return "null";
  return String(val, prec);
}

void sendData()
{
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;

  String payload = "{";

  payload += "\"device_id\":\"" + deviceID + "\",";
  payload += "\"fw_version\":\"" FW_VERSION "\",";

  payload += "\"v1\":"  + fmt(v1, 2)  + ",";
  payload += "\"i1\":"  + fmt(i1 * CT_RATIO, 3)  + ",";
  payload += "\"p1\":"  + fmt(p1, 2)  + ",";
  payload += "\"e1\":"  + fmt(e1, 4)  + ",";
  payload += "\"f1\":"  + fmt(f1, 2)  + ",";
  payload += "\"pf1\":" + fmt(pf1, 3) + ",";

  payload += "\"v2\":"  + fmt(v2, 2)  + ",";
  payload += "\"i2\":"  + fmt(i2 * CT_RATIO, 3)  + ",";
  payload += "\"p2\":"  + fmt(p2, 2)  + ",";
  payload += "\"e2\":"  + fmt(e2, 4)  + ",";
  payload += "\"f2\":"  + fmt(f2, 2)  + ",";
  payload += "\"pf2\":" + fmt(pf2, 3) + ",";

  payload += "\"v3\":"  + fmt(v3, 2)  + ",";
  payload += "\"i3\":"  + fmt(i3 * CT_RATIO, 3) + ",";
  payload += "\"p3\":"  + fmt(p3, 2)  + ",";
  payload += "\"e3\":"  + fmt(e3, 4)  + ",";
  payload += "\"f3\":"  + fmt(f3, 2)  + ",";
  payload += "\"pf3\":" + fmt(pf3, 3) + ",";

  payload += "\"i_n\":" + fmt(i4 * CT_RATIO, 3);

  payload += "}";

  http.begin(String(API_SERVER) + API_DATA_PATH);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(payload);
  http.end();
}

void receiveSlaveData()
{
  while (Serial.available())
  {
    char c = Serial.read();

    if (c == '\n')
    {
      sscanf(
        slaveBuffer.c_str(),
        "%f,%f,%f,%f,%f,%f,%f,%f,%f,%f,%f,%f",
        &v3, &i3, &p3, &e3, &f3, &pf3,
        &v4, &i4, &p4, &e4, &f4, &pf4
      );

      slaveBuffer = "";
    }
    else
    {
      slaveBuffer += c;
    }
  }
}

void updateLCD()
{
  if (millis() - lastLCD < 200) return;
  lastLCD = millis();

  if (millis() - lastPageChange > 3000)
  {
    page++;
    if (page > 3) page = 0;
    lastPageChange = millis();
  }

  lcd.clear();

  float disp_i1 = i1 * CT_RATIO;
  float disp_i3 = i3 * CT_RATIO;
  float disp_i4 = i4 * CT_RATIO;

  String status = "OK";
  if (disp_i4 > 120.0)
    status = "UNBAL";
  else if (disp_i4 > 80.0)
    status = "WARN";

  switch (page)
  {
    case 0:
      lcd.setCursor(0, 0);
      lcd.print("R:");
      lcd.print(v1, 0);
      lcd.print("V ");
      lcd.print(disp_i1, 1);
      lcd.print("A");

      lcd.setCursor(0, 1);
      lcd.print("Y:");
      lcd.print(v2, 0);
      lcd.print("V ");
      lcd.print(i2 * CT_RATIO, 1);
      lcd.print("A");

      lcd.setCursor(0, 2);
      lcd.print("B:");
      lcd.print(v3, 0);
      lcd.print("V ");
      lcd.print(disp_i3, 1);
      lcd.print("A");

      lcd.setCursor(0, 3);
      lcd.print("N:");
      lcd.print(disp_i4, 1);
      lcd.print("A ");
      lcd.print(status);
      break;

    case 1:
      lcd.setCursor(0, 0);
      lcd.print("R P:");
      lcd.print(p1, 0);

      lcd.setCursor(0, 1);
      lcd.print("Y P:");
      lcd.print(p2, 0);

      lcd.setCursor(0, 2);
      lcd.print("B P:");
      lcd.print(p3, 0);

      lcd.setCursor(0, 3);
      lcd.print("Tot:");
      lcd.print(p1 + p2 + p3, 0);
      lcd.print("W");
      break;

    case 2:
      lcd.setCursor(0, 0);
      lcd.print("R E:");
      lcd.print(e1, 1);

      lcd.setCursor(0, 1);
      lcd.print("Y E:");
      lcd.print(e2, 1);

      lcd.setCursor(0, 2);
      lcd.print("B E:");
      lcd.print(e3, 1);

      lcd.setCursor(0, 3);
      lcd.print("Tot:");
      lcd.print(e1 + e2 + e3, 1);
      break;

    case 3:
      lcd.setCursor(0, 0);
      lcd.print("R PF:");
      lcd.print(pf1, 2);

      lcd.setCursor(0, 1);
      lcd.print("Y PF:");
      lcd.print(pf2, 2);

      lcd.setCursor(0, 2);
      lcd.print("B PF:");
      lcd.print(pf3, 2);

      lcd.setCursor(0, 3);
      lcd.print("N ");
      lcd.print(status);
      break;
  }
}

void setup()
{
  Serial.begin(115200);

  uint64_t mac = ESP.getEfuseMac();
  uint8_t* b = (uint8_t*)&mac;
  char id[13];
  snprintf(id, sizeof(id), "%02X%02X%02X%02X%02X%02X",
    b[5], b[4], b[3], b[2], b[1], b[0]);
  deviceID = String(id);

  SerialPZEM1.begin(9600, SERIAL_8N1, 16, 17);
  SerialPZEM2.begin(9600, SERIAL_8N1, 18, 19);

  lcd.init();
  lcd.backlight();

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Chetrika Rayz");

  WiFiManager wm;
  wm.setConfigPortalTimeout(180);
  wm.autoConnect("Chetrika-Rayz-CMS");
}

void loop()
{
  readMeter(pzem1, v1, i1, p1, e1, f1, pf1);
  readMeter(pzem2, v2, i2, p2, e2, f2, pf2);

  receiveSlaveData();

  sendData();

  updateLCD();

  delay(500);
}
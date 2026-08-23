#pragma once

#include <LiquidCrystal_I2C.h>
#include "data_types.h"
#include "firmware.h"

extern PZEMData dataR;
extern PZEMData dataY;
extern PZEMData dataB;
extern PZEMData dataN;

extern LiquidCrystal_I2C lcd;

extern bool gsmReady;
extern String deviceID;
extern unsigned long lastSend;

#define LCD_INTERVAL_MS 500
#define LCD_PAGE_INTERVAL_MS 5000

inline void initLCD()
{
  lcd.init();
  lcd.backlight();
  lcd.clear();
}

inline void updateLCD()
{
  static unsigned long lastLCD = 0;
  static unsigned long lastLCDPage = 0;
  static int lcdPage = 0;

  unsigned long now = millis();
  if (now - lastLCD < LCD_INTERVAL_MS) return;
  lastLCD = now;

  if (now - lastLCDPage >= LCD_PAGE_INTERVAL_MS)
  {
    lcdPage = (lcdPage + 1) % 2;
    lastLCDPage = now;
    lcd.clear();
  }

  if (lcdPage == 0)
  {
    float pTot = dataR.power + dataY.power + dataB.power;

    lcd.setCursor(0, 0);
    lcd.print("R:");
    lcd.print(dataR.voltage, 0);
    lcd.print("V ");
    lcd.print(dataR.current, 2);
    lcd.print("A ");
    lcd.print(dataR.power, 0);
    lcd.print("W");

    lcd.setCursor(0, 1);
    lcd.print("Y:");
    lcd.print(dataY.voltage, 0);
    lcd.print("V ");
    lcd.print(dataY.current, 2);
    lcd.print("A ");
    lcd.print(dataY.power, 0);
    lcd.print("W");

    lcd.setCursor(0, 2);
    lcd.print("B:");
    lcd.print(dataB.voltage, 0);
    lcd.print("V ");
    lcd.print(dataB.current, 2);
    lcd.print("A ");
    lcd.print(dataB.power, 0);
    lcd.print("W");

    lcd.setCursor(0, 3);
    lcd.print("N:");
    lcd.print(dataN.current, 2);
    lcd.print("A Tot:");
    lcd.print(pTot, 0);
    lcd.print("W");
  }
  else
  {
    lcd.setCursor(0, 0);
    lcd.print("ID:");
    lcd.print(deviceID.substring(0, 12));

    lcd.setCursor(0, 1);
    lcd.print("GSM:");
    lcd.print(gsmReady ? "OK " : "FAIL");
    lcd.print(" API:");
    lcd.print(lastSend > 0 && now - lastSend < 15000 ? "OK" : "...");

    lcd.setCursor(0, 2);
    lcd.print("FW:");
    lcd.print(FW_VERSION);
    lcd.print(" ");
    lcd.print(FW_CHANNEL);

    lcd.setCursor(0, 3);
    lcd.print(lastSend > 0 && now - lastSend < 15000 ? "Sending data..." : "Waiting...    ");
  }
}

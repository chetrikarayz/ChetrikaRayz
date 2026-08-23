#pragma once

#include "../include/data_types.h"
#include "../include/pzem_slave.h"
#include "../include/i2c_slave.h"
#include "../include/serial_print.h"

const char *const meterNames[4] = { "R Phase (0x01)", "Y Phase (0x02)", "B Phase (0x03)", "Neutral (0x04)" };

// ==================== Address Commissioning ====================

void setMeterAddress(uint8_t newAddr)
{
  Serial.printf("[ADDR] Programming connected PZEM to 0x%02X...\n", newAddr);
  Serial.println("[ADDR] Make sure ONLY ONE meter is connected to the bus!");

  // Default-constructed PZEM004Tv30 uses address 0xF8 (Modbus broadcast):
  // whichever single meter is on the bus will answer.
  static PZEM004Tv30 anyMeter(PZEMSerial, 16, 17);

  if (anyMeter.setAddress(newAddr))
    Serial.println("[ADDR] Success! Label the meter, then connect the next one.");
  else
    Serial.println("[ADDR] Failed -- check wiring (single meter, RX/TX, mains power).");
}

// ==================== Serial Commands ====================

void handleSerial()
{
  if (!Serial.available())
    return;

  char cmd = toupper(Serial.read());

  while (Serial.available())
    Serial.read();

  switch (cmd)
  {
  case 'A':
  {
    delay(50);
    char d = Serial.available() ? Serial.read() : 0;
    if (d >= '1' && d <= '4')
      setMeterAddress(d - '0');
    else
      Serial.println("Usage: A1..A4 (program the single connected meter)");
    break;
  }
  case 'S':
    Serial.println();
    Serial.println("========== SLAVE STATUS ==========");
    for (uint8_t i = 0; i < 4; i++)
      printData(meterNames[i], pzemCache[i]);
    Serial.println("==================================");
    break;
  case 'H':
    Serial.println();
    Serial.println("===== SLAVE COMMANDS =====");
    Serial.println("S  = Full status dump");
    Serial.println("A1 = Set meter address 0x01 (R phase)");
    Serial.println("A2 = Set meter address 0x02 (Y phase)");
    Serial.println("A3 = Set meter address 0x03 (B phase)");
    Serial.println("A4 = Set meter address 0x04 (Neutral)");
    Serial.println("     (connect ONE meter at a time!)");
    Serial.println("H  = Help");
    Serial.println("==========================");
    break;
  }
}

// ==================== Setup / Loop ====================

void setup()
{
  Serial.begin(115200);

  Serial.println();
  Serial.println("================================");
  Serial.println("CHETRIKA RAYZ SLAVE");
  Serial.println("Single UART bus, 4 addressed PZEMs");
  Serial.println("================================");

  initSlavePZEMs();

  Wire.begin(SLAVE_ADDR);
  currentMeter = 0;
  slaveLastReadTime = millis();
  Wire.onReceive(receiveEvent);
  Wire.onRequest(requestEvent);

  Serial.println("SLAVE READY");
  Serial.println("Type H for serial commands");
}

void loop()
{
  handleSerial();
  loopSlaveRead();
}

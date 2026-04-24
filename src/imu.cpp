#include "imu.h"

#include <SPI.h>

namespace {

const uint8_t kCsPin = PIN_PA4;
const uint8_t kReadBit = 0x80;

const uint8_t kRegWhoAmI = 0x0F;
const uint8_t kRegCtrl1 = 0x10;
const uint8_t kRegCtrl2 = 0x11;
const uint8_t kRegCtrl6 = 0x15;
const uint8_t kRegCtrl8 = 0x17;
const uint8_t kRegOutXG = 0x22;
const uint8_t kRegOutXL = 0x28;

const uint8_t kWhoAmI = 0x73;
const uint8_t kCtrl1Accel480Hz = 0x08;
const uint8_t kCtrl2Gyro480Hz = 0x08;
const uint8_t kCtrl6Gyro2000dps = 0x08;
const uint8_t kCtrl8Accel16g = 0x03;

bool ready = false;

SPISettings spiSettings(1000000, MSBFIRST, SPI_MODE3);

uint8_t readRegister(uint8_t reg) {
  SPI.beginTransaction(spiSettings);
  digitalWrite(kCsPin, LOW);
  SPI.transfer(reg | kReadBit);
  const uint8_t value = SPI.transfer(0x00);
  digitalWrite(kCsPin, HIGH);
  SPI.endTransaction();
  return value;
}

void writeRegister(uint8_t reg, uint8_t value) {
  SPI.beginTransaction(spiSettings);
  digitalWrite(kCsPin, LOW);
  SPI.transfer(reg);
  SPI.transfer(value);
  digitalWrite(kCsPin, HIGH);
  SPI.endTransaction();
}

int16_t readInt16(uint8_t lowReg) {
  const uint8_t lo = readRegister(lowReg);
  const uint8_t hi = readRegister(lowReg + 1);
  return static_cast<int16_t>((static_cast<uint16_t>(hi) << 8) | lo);
}

uint16_t isqrt(uint32_t value) {
  uint32_t bit = 1UL << 30;
  uint32_t result = 0;

  while (bit > value) {
    bit >>= 2;
  }

  while (bit != 0) {
    if (value >= result + bit) {
      value -= result + bit;
      result = (result >> 1) + bit;
    } else {
      result >>= 1;
    }
    bit >>= 2;
  }

  return static_cast<uint16_t>(result);
}

int32_t rawToMg(int16_t raw) {
  // Low-g accelerometer at +/-16 g is 0.488 mg/LSB.
  return (static_cast<int32_t>(raw) * 488L) / 1000L;
}

}  // namespace

namespace Imu {

void begin() {
  pinMode(kCsPin, OUTPUT);
  digitalWrite(kCsPin, HIGH);

  SPI.begin();
  delay(10);

  ready = readRegister(kRegWhoAmI) == kWhoAmI;
  if (!ready) {
    return;
  }

  writeRegister(kRegCtrl8, kCtrl8Accel16g);
  writeRegister(kRegCtrl1, kCtrl1Accel480Hz);
  writeRegister(kRegCtrl6, kCtrl6Gyro2000dps);
  writeRegister(kRegCtrl2, kCtrl2Gyro480Hz);
  delay(5);
}

bool isReady() {
  return ready;
}

void readAccelAxesMg(int16_t& x, int16_t& y, int16_t& z) {
  if (!ready) {
    x = 0;
    y = 0;
    z = 1000;
    return;
  }

  x = static_cast<int16_t>(rawToMg(readInt16(kRegOutXL)));
  y = static_cast<int16_t>(rawToMg(readInt16(kRegOutXL + 2)));
  z = static_cast<int16_t>(rawToMg(readInt16(kRegOutXL + 4)));
}

uint16_t readAccelMagnitudeMg() {
  int16_t x = 0;
  int16_t y = 0;
  int16_t z = 0;
  readAccelAxesMg(x, y, z);

  const uint32_t sumSquares =
      static_cast<uint32_t>(x * x) +
      static_cast<uint32_t>(y * y) +
      static_cast<uint32_t>(z * z);
  return isqrt(sumSquares);
}

void readGyroAxesRaw(int16_t& x, int16_t& y, int16_t& z) {
  if (!ready) {
    x = 0;
    y = 0;
    z = 0;
    return;
  }

  x = readInt16(kRegOutXG);
  y = readInt16(kRegOutXG + 2);
  z = readInt16(kRegOutXG + 4);
}

uint16_t readGyroMagnitudeRaw() {
  int16_t x = 0;
  int16_t y = 0;
  int16_t z = 0;
  readGyroAxesRaw(x, y, z);

  const uint32_t sumSquares =
      static_cast<uint32_t>(x * x) +
      static_cast<uint32_t>(y * y) +
      static_cast<uint32_t>(z * z);
  return isqrt(sumSquares);
}

}  // namespace Imu

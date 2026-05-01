#include "imu.h"

#include <SPI.h>

namespace {

const uint8_t kCsPin = PIN_PA4;
const uint8_t kReadBit = 0x80;

const uint8_t kRegWhoAmI = 0x0F;
const uint8_t kRegCtrl1 = 0x10;
const uint8_t kRegCtrl2 = 0x11;
const uint8_t kRegCtrl3 = 0x12;
const uint8_t kRegCtrl6 = 0x15;
const uint8_t kRegCtrl8 = 0x17;
const uint8_t kRegTapSrc = 0x46;
const uint8_t kRegOutXG = 0x22;
const uint8_t kRegOutXL = 0x28;
const uint8_t kRegOutXHg = 0x34;
const uint8_t kRegCtrl1Hg = 0x4E;
const uint8_t kRegFunctionsEnable = 0x50;
const uint8_t kRegTapCfg0 = 0x56;
const uint8_t kRegTapCfg1 = 0x57;
const uint8_t kRegTapCfg2 = 0x58;
const uint8_t kRegTapThs6d = 0x59;
const uint8_t kRegTapDur = 0x5A;
const uint8_t kRegWakeUpThs = 0x5B;
const uint8_t kRegWakeUpDur = 0x5C;
const uint8_t kRegMd1Cfg = 0x5E;

const uint8_t kWhoAmI = 0x73;
const uint8_t kCtrl1Accel480Hz = 0x08;
const uint8_t kCtrl1AccelPowerDown = 0x00;
const uint8_t kCtrl2Gyro480Hz = 0x08;
const uint8_t kCtrl2GyroPowerDown = 0x00;
const uint8_t kCtrl3BduIfInc = 0x44;
const uint8_t kCtrl6Gyro4000dps = 0x0D;
const uint8_t kCtrl8Accel8g = 0x02;
const uint8_t kCtrl1HighGAccel480Hz64g = 0x66;
const uint8_t kCtrl1HighGAccelPowerDown = 0x00;

const uint8_t kInt1Pin = PIN_PA5;
const uint8_t kTapCfg0EnableZLatched = 0x03;
const uint8_t kTapThreshold = 0x01;
const uint8_t kTapDurDoubleTap = 0x46;
const uint8_t kWakeUpThsSingleDoubleTap = 0x80;
const uint8_t kWakeUpDurNoDuration = 0x00;
const uint8_t kFunctionsEnableEmbeddedFunctions = 0x80;
const uint8_t kMd1CfgTapOnInt1 = 0x48;
const uint8_t kTapSrcSingleTap = 0x20;
const uint8_t kTapSrcDoubleTap = 0x10;

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

void readRegisters(uint8_t startReg, uint8_t* buffer, uint8_t count) {
  SPI.beginTransaction(spiSettings);
  digitalWrite(kCsPin, LOW);
  SPI.transfer(startReg | kReadBit);
  for (uint8_t i = 0; i < count; ++i) {
    buffer[i] = SPI.transfer(0x00);
  }
  digitalWrite(kCsPin, HIGH);
  SPI.endTransaction();
}

void readAxesRaw(uint8_t startReg, int16_t& x, int16_t& y, int16_t& z) {
  uint8_t bytes[6] = {};
  readRegisters(startReg, bytes, sizeof(bytes));
  x = static_cast<int16_t>((static_cast<uint16_t>(bytes[1]) << 8) | bytes[0]);
  y = static_cast<int16_t>((static_cast<uint16_t>(bytes[3]) << 8) | bytes[2]);
  z = static_cast<int16_t>((static_cast<uint16_t>(bytes[5]) << 8) | bytes[4]);
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

int32_t highGRawToMg(int16_t raw) {
  // High-g accelerometer at +/-64 g is 1.953 mg/LSB.
  return (static_cast<int32_t>(raw) * 1953L) / 1000L;
}

uint32_t squareInt16(int16_t value) {
  const int32_t wideValue = value;
  return static_cast<uint32_t>(wideValue * wideValue);
}

void configureTapDetection() {
  writeRegister(kRegTapCfg0, kTapCfg0EnableZLatched);
  writeRegister(kRegTapCfg1, 0x00);
  writeRegister(kRegTapCfg2, 0x00);
  writeRegister(kRegTapThs6d, kTapThreshold);
  writeRegister(kRegTapDur, kTapDurDoubleTap);
  writeRegister(kRegWakeUpThs, kWakeUpThsSingleDoubleTap);
  writeRegister(kRegWakeUpDur, kWakeUpDurNoDuration);
  writeRegister(kRegFunctionsEnable, kFunctionsEnableEmbeddedFunctions);
  writeRegister(kRegMd1Cfg, kMd1CfgTapOnInt1);
  readRegister(kRegTapSrc);
}

void configureFullRateSensors() {
  writeRegister(kRegCtrl8, kCtrl8Accel8g);
  writeRegister(kRegCtrl1, kCtrl1Accel480Hz);
  writeRegister(kRegCtrl1Hg, kCtrl1HighGAccel480Hz64g);
  writeRegister(kRegCtrl6, kCtrl6Gyro4000dps);
  writeRegister(kRegCtrl2, kCtrl2Gyro480Hz);
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

  writeRegister(kRegCtrl3, kCtrl3BduIfInc);
  configureFullRateSensors();
  configureTapDetection();
  delay(5);
}

bool isReady() {
  return ready;
}

TapEvent readTapEvent() {
  if (!ready) {
    return TapEvent::None;
  }

  const uint8_t tapSrc = readRegister(kRegTapSrc);
  if ((tapSrc & kTapSrcDoubleTap) != 0) {
    return TapEvent::Double;
  }
  if ((tapSrc & kTapSrcSingleTap) != 0) {
    return TapEvent::Single;
  }
  return TapEvent::None;
}

void enterSleepMode() {
  if (!ready) {
    return;
  }

  writeRegister(kRegCtrl2, kCtrl2GyroPowerDown);
  writeRegister(kRegCtrl1Hg, kCtrl1HighGAccelPowerDown);
  writeRegister(kRegCtrl1, kCtrl1AccelPowerDown);
  writeRegister(kRegMd1Cfg, 0x00);
  readRegister(kRegTapSrc);
}

void readAccelAxesMg(int16_t& x, int16_t& y, int16_t& z) {
  if (!ready) {
    x = 0;
    y = 0;
    z = 1000;
    return;
  }

  int16_t rawX = 0;
  int16_t rawY = 0;
  int16_t rawZ = 0;
  readAxesRaw(kRegOutXHg, rawX, rawY, rawZ);

  x = static_cast<int16_t>(highGRawToMg(rawX));
  y = static_cast<int16_t>(highGRawToMg(rawY));
  z = static_cast<int16_t>(highGRawToMg(rawZ));
}

uint16_t readAccelMagnitudeMg() {
  int16_t x = 0;
  int16_t y = 0;
  int16_t z = 0;
  readAccelAxesMg(x, y, z);

  const uint32_t sumSquares =
      squareInt16(x) +
      squareInt16(y) +
      squareInt16(z);
  return isqrt(sumSquares);
}

void readGyroAxesRaw(int16_t& x, int16_t& y, int16_t& z) {
  if (!ready) {
    x = 0;
    y = 0;
    z = 0;
    return;
  }

  readAxesRaw(kRegOutXG, x, y, z);
}

uint16_t readGyroMagnitudeRaw() {
  int16_t x = 0;
  int16_t y = 0;
  int16_t z = 0;
  readGyroAxesRaw(x, y, z);

  const uint32_t sumSquares =
      squareInt16(x) +
      squareInt16(y) +
      squareInt16(z);
  return isqrt(sumSquares);
}

}  // namespace Imu

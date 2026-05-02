#include "imu.h"

#include <SPI.h>

namespace {

const uint8_t kCsPin = PIN_PA4;
const uint8_t kReadBit = 0x80;

const uint8_t kRegWhoAmI = 0x0F;
const uint8_t kRegFifoCtrl1 = 0x07;
const uint8_t kRegFifoCtrl2 = 0x08;
const uint8_t kRegFifoCtrl3 = 0x09;
const uint8_t kRegFifoCtrl4 = 0x0A;
const uint8_t kRegCounterBdr1 = 0x0B;
const uint8_t kRegInt1Ctrl = 0x0D;
const uint8_t kRegCtrl1 = 0x10;
const uint8_t kRegCtrl2 = 0x11;
const uint8_t kRegCtrl3 = 0x12;
const uint8_t kRegCtrl6 = 0x15;
const uint8_t kRegCtrl8 = 0x17;
const uint8_t kRegFifoStatus1 = 0x1B;
const uint8_t kRegFifoStatus2 = 0x1C;
const uint8_t kRegTapSrc = 0x46;
const uint8_t kRegOutXG = 0x22;
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
const uint8_t kRegFifoDataOutTag = 0x78;

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
const uint8_t kInt1CtrlFifoWatermark = 0x08;
const uint8_t kTapSrcSingleTap = 0x20;
const uint8_t kTapSrcDoubleTap = 0x10;
const uint8_t kFifoWatermarkEntries = 8;
const uint8_t kFifoBdrGyro480Hz = 0x80;
const uint8_t kCounterBdrHighGAccelBatch = 0x08;
const uint8_t kFifoModeBypass = 0x00;
const uint8_t kFifoModeContinuous = 0x06;
const uint8_t kFifoEntrySizeBytes = 7;
const uint8_t kFifoStatus2DiffFifoHighMask = 0x03;
const uint16_t kFifoDrainMaxEntries = 96;
const uint8_t kFifoTagSensorShift = 3;
const uint8_t kFifoTagGyro = 0x01;
const uint8_t kFifoTagHighGAccel = 0x1D;

bool ready = false;
volatile uint8_t int1Count = 0;

SPISettings spiSettings(1000000, MSBFIRST, SPI_MODE3);

void onInt1() {
  if (int1Count < 255) {
    ++int1Count;
  }
}

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

uint16_t fifoEntryCount() {
  const uint8_t status1 = readRegister(kRegFifoStatus1);
  const uint8_t status2 = readRegister(kRegFifoStatus2);
  return static_cast<uint16_t>(
      status1 |
      ((static_cast<uint16_t>(status2 & kFifoStatus2DiffFifoHighMask)) << 8));
}

void configureFifo() {
  writeRegister(kRegFifoCtrl4, kFifoModeBypass);
  writeRegister(kRegCounterBdr1, kCounterBdrHighGAccelBatch);
  writeRegister(kRegFifoCtrl1, kFifoWatermarkEntries);
  writeRegister(kRegFifoCtrl2, 0x00);
  writeRegister(kRegFifoCtrl3, kFifoBdrGyro480Hz);
  writeRegister(kRegFifoCtrl4, kFifoModeContinuous);
}

void configureFifoInterrupt() {
  writeRegister(kRegInt1Ctrl, kInt1CtrlFifoWatermark);
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

  pinMode(kInt1Pin, INPUT);
  const int interruptNumber = digitalPinToInterrupt(kInt1Pin);
  if (interruptNumber != NOT_AN_INTERRUPT) {
    attachInterrupt(interruptNumber, onInt1, RISING);
  }

  writeRegister(kRegCtrl3, kCtrl3BduIfInc);
  configureFullRateSensors();
  configureFifo();
  configureTapDetection();
  configureFifoInterrupt();
  delay(5);
}

bool isReady() {
  return ready;
}

uint8_t consumeInterruptCount() {
  noInterrupts();
  const uint8_t count = int1Count;
  int1Count = 0;
  interrupts();
  return count;
}

void drainFifo() {
  if (!ready) {
    return;
  }

  uint8_t entry[kFifoEntrySizeBytes] = {};
  uint16_t entries = fifoEntryCount();
  if (entries > kFifoDrainMaxEntries) {
    entries = kFifoDrainMaxEntries;
  }

  while (entries-- > 0) {
    readRegisters(kRegFifoDataOutTag, entry, sizeof(entry));
  }
}

uint16_t highGAccelMagnitudeMgFromFifo(int16_t rawX, int16_t rawY, int16_t rawZ) {
  const uint32_t rawSumSquares =
      squareInt16(rawX) +
      squareInt16(rawY) +
      squareInt16(rawZ);
  const uint16_t rawMagnitude = isqrt(rawSumSquares);
  return static_cast<uint16_t>(
      (static_cast<uint32_t>(rawMagnitude) * 1953UL) / 1000UL);
}

void readMotionSample(
    uint16_t& accelMagnitudeMg,
    int16_t& gyroXRaw,
    int16_t& gyroYRaw,
    int16_t& gyroZRaw) {
  bool hasAccel = false;
  uint16_t fifoAccelMagnitudeMg = 1000;
  gyroXRaw = 0;
  gyroYRaw = 0;
  gyroZRaw = 0;

  if (ready) {
    uint8_t entry[kFifoEntrySizeBytes] = {};
    uint16_t entries = fifoEntryCount();
    if (entries > kFifoDrainMaxEntries) {
      entries = kFifoDrainMaxEntries;
    }

    while (entries-- > 0) {
      readRegisters(kRegFifoDataOutTag, entry, sizeof(entry));
      const uint8_t tag = entry[0] >> kFifoTagSensorShift;
      const int16_t x =
          static_cast<int16_t>((static_cast<uint16_t>(entry[2]) << 8) | entry[1]);
      const int16_t y =
          static_cast<int16_t>((static_cast<uint16_t>(entry[4]) << 8) | entry[3]);
      const int16_t z =
          static_cast<int16_t>((static_cast<uint16_t>(entry[6]) << 8) | entry[5]);

      if (tag == kFifoTagGyro) {
        gyroXRaw = x;
        gyroYRaw = y;
        gyroZRaw = z;
      } else if (tag == kFifoTagHighGAccel) {
        fifoAccelMagnitudeMg = highGAccelMagnitudeMgFromFifo(x, y, z);
        hasAccel = true;
      }
    }
  }

  accelMagnitudeMg = hasAccel ? fifoAccelMagnitudeMg : 1000;
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

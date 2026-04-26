# Project Context: Dream-1

## Overview
Dream-1 is a compact bat swing motivation device.

It is not a scientific instrument and does not measure true bat head speed.
Its purpose is:
- motivate repeated swing practice
- give a simple numeric score
- provide relative comparison for the same user / same bat / same setup

Main UX goals:
- valid swing -> short beep
- new best score -> double beep
- score is shown only when user taps the device
- display is normally off to save battery and reduce score obsession

---

## Current Hardware

### MCU
- ATtiny3226
- Arduino framework
- PlatformIO development environment

### IMU
- LSM6DSV80X
- Interface: SPI

SPI / IMU pins:
- IMU CS = PA4

### Buzzer
- Piezo buzzer
- Differential drive

Buzzer pins:
- BUZZER_P = PA6
- BUZZER_N = PA7

Important:
- Serial TX can interfere with buzzer operation if shared or misconfigured
- Do not assume Serial is available in production firmware

### 7-Segment LED
3-digit 7-segment LED, common cathode

Segment pins:
- SEG_A = PB0
- SEG_B = PB2
- SEG_C = PB4
- SEG_D = PB3
- SEG_E = PB1
- SEG_F = PB5
- SEG_G = PC0

Digit select pins:
- DIGIT_1 = PC1
- DIGIT_2 = PC2
- DIGIT_3 = PC3

Display notes:
- multiplexed drive
- brightness and readability depend on multiplex timing
- previous issue existed when buzzer / serial / segment usage conflicted
- keep display logic simple and deterministic

### Power
- CR2450 coin cell
- low power is important
- display should remain off except when needed
- avoid unnecessary active time and blocking waits

---

## Product Behavior

### Normal behavior
- device monitors motion continuously
- swing is detected from IMU motion
- valid swing triggers sound feedback
- score is stored internally
- score is shown only when user performs tap gesture

### Sound behavior
- valid swing: short single beep
- new best score: short double beep

### Display behavior
- default state: off
- tap gesture: show latest score for a short time
- optional future behavior: double tap to show best score
- display time should be limited to save battery

---

## Core Design Philosophy

### What the score means
The score is not true impact speed and not true bat head speed.
It is only a practical training score derived from motion patterns.

The score should be useful for:
- repeated practice
- self-comparison
- motivation

The score should NOT be presented as:
- a scientific value
- a direct comparison across different bats
- an absolute measure of hitting power

### Measurement idea
Use both gyro and accel.

Concept:
- gyro peak represents earlier rotational movement near the body
- accel peak represents later translational / release-like movement

Good swing tendency:
- rotation rises first
- acceleration grows later
- the timing relationship between peaks matters

Possible low-quality swing tendency:
- gyro peak and accel peak occur too close together -> hand-only swing
- accel is weak -> low score
- motion is too small -> ignore
- random handling / shake / repositioning -> ignore

### Device placement assumption
- attached near the taper / grip-side area, not at the bat head
- score is meaningful only when mounting position is reasonably consistent

---

## IMU Algorithm Guidance

### General approach
Use a lightweight algorithm suitable for ATtiny3226.
Prefer integer math.

Suggested signal inputs:
- gyro magnitude or selected axis magnitude
- accel magnitude or filtered dynamic accel magnitude

Suggested processing flow:
1. continuously sample IMU
2. detect start of meaningful motion
3. track gyro peak during swing window
4. track accel peak during swing window
5. estimate timing difference between peaks
6. compute score from:
   - gyro peak contribution
   - accel peak contribution
   - timing relationship
7. validate swing
8. trigger beep
9. store latest score
10. if score > best score, update best and use double beep

### Swing detection guidance
Do not trigger on:
- slow hand movement
- small repositioning
- gentle pickup
- vibration only

Use thresholds and time windows.
A swing should require a minimum motion level and a minimum motion pattern.

### Tap detection guidance
Tap gesture is used for display, not scoring.

Requirements:
- detect short sharp tap
- should not accidentally trigger from normal swing follow-through
- should work while device is idle after swing

Use a separate tap detection condition from swing detection.

### Score output guidance
- score range target: 0 to 999
- clamp final score to 999
- if motion is below valid threshold, do not score
- stable repeatability is more important than physical accuracy

---

## Firmware Architecture

### Main requirements
- non-blocking main loop
- avoid delay() in normal logic
- keep behavior deterministic
- keep modules simple

### Recommended module split
Suggested structure:

- `main.cpp`
  - setup
  - main loop
  - top-level state updates

- `imu.cpp / imu.h`
  - IMU init
  - IMU read
  - raw sensor access

- `score.cpp / score.h`
  - swing detection
  - peak tracking
  - scoring logic
  - score validity

- `display.cpp / display.h`
  - 7seg segment encoding
  - multiplex update
  - display timeout
  - show number

- `buzzer.cpp / buzzer.h`
  - single beep
  - double beep
  - non-blocking tone timing if possible

- `tap.cpp / tap.h`
  - tap detection
  - debounce / timing logic

This split is recommended, but keep implementation lightweight.

### Main loop behavior
Main loop should ideally do:
1. read IMU
2. update swing state
3. update tap state
4. update display multiplex
5. update buzzer timing
6. manage low-power-friendly idle behavior where possible

---

## Coding Constraints

### Required
- use Arduino style (`setup()` / `loop()`)
- prefer integer math
- keep RAM usage small
- keep code size small
- keep functions short and readable
- avoid heavy libraries

### Avoid
- floating point unless clearly necessary
- long blocking delays
- unnecessary abstraction
- debug-only features in production path
- assumptions not stated in this document

### Debugging
- temporary debug code is acceptable
- Serial may be used only when explicitly enabled for debugging
- production code should not depend on Serial

---

## Known Pitfalls

### Buzzer / Serial conflict
- buzzer pins and serial/debug usage can conflict
- do not enable Serial in production unless confirmed safe

### Display confusion
- wrong segment mapping can produce wrong numbers
- multiplex timing errors can distort readability
- verify segment table carefully

### Motion false positives
- hand movement can look like a swing if thresholds are too low
- tap detection can be confused with general vibration
- swing detection and tap detection must use separate logic

### Power issues
- display on-time and buzzer usage affect battery life
- do not leave display on continuously

---

## Current Expectations for Codex

When writing or modifying code for this project:

1. Always follow the exact pin mapping in this file.
2. Do not invent hardware that is not listed here.
3. Do not assume Serial is always available.
4. Prefer simple, testable code over clever code.
5. Use non-blocking patterns where practical.
6. Keep the implementation suitable for ATtiny3226.
7. Respect the product UX:
   - swing -> beep
   - new best -> double beep
   - tap -> show score
8. Favor repeatability and robustness over theoretical precision.

---

## Preferred Output Style for Codex
When generating code:
- show complete files when changes are substantial
- otherwise show minimal diff-oriented edits
- explain assumptions briefly
- keep naming consistent
- do not rewrite unrelated parts

---

## Truth Source
If conversation history conflicts with this file, treat this file as the source of truth unless explicitly told otherwise.

## Upload
No need to run "pio run". Upload will be done manually.
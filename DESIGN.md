# PhotoReturns Design System

## 1. Visual Theme

PhotoReturns uses a vintage audio hardware aesthetic: brushed aluminum surfaces,
machined bevels, recessed dark panels, LED status lights, VU-meter progress bars,
and warm gold accent controls.

The UI should feel like professional studio equipment: Neve 1073 preamps, Akai
MPC panels, Technics SL-1200 controls, and compact mixing-console channel strips.

## 2. Color Palette

### Metal Surface

| Token | Hex | Usage |
|---|---|---|
| `metal-50` | `#f8f8f8` | Highlight |
| `metal-200` | `#e0e0e0` | Mid-light |
| `metal-400` | `#c0c0c0` | Mid-base |
| `metal-600` | `#909090` | Deep shadow |
| `metal-900` | `#333333` | Very dark edge |

### Console Panel

| Token | Hex | Usage |
|---|---|---|
| `panel-500` | `#181818` | Base panel |
| `panel-900` | `#0a0a0a` | Deep recessed panel |

### LED Indicators

| Color | Hex | Meaning |
|---|---|---|
| Green | `#44ff44` | Success |
| Amber | `#ffaa00` | Pending |
| Red | `#ff3333` | Error |
| Blue | `#44aaff` | Processing |

### Accent

- Warm gold: `#d4a843`
- Amber gold: `#c8901a`

## 3. Typography

- Primary family: `'Courier New', 'Lucida Console', monospace`
- Labels: uppercase, bold, compact tracking
- Nameplate: large, black weight, engraved shadow
- Status text: LED-colored glow when active

Avoid sans-serif typography in the main application chrome. This app should read
as hardware, not a generic dashboard.

## 4. Component Rules

### Hardware Buttons

- Use vertical metal or gold gradients.
- Use inset highlights plus lower shadows to create a physical edge.
- Pressed state should move by `translateY(1px)`.
- Transition duration should stay around `0.08s`.
- Border radius should stay at `3px` or below.

### Console Panels

- Main surfaces use brushed aluminum gradients.
- Content sections sit in recessed dark panels.
- Photo settings may use subtle blue tinting.
- Video settings may use subtle purple tinting.
- Edges should use inset shadows and bevels instead of flat borders.

### VU Meter Progress

- Track is a dark recessed strip.
- Fill uses LED color gradients:
  - pending: amber
  - processing: blue with pulse
  - completed: green
  - error: red
- Use glow sparingly and only where it communicates status.

### Thumbnail Slots

- Use a dark inset background.
- Border should feel recessed: darker top edge, lighter lower edge.
- Keep image windows compact and equipment-like.

## 5. Layout

PhotoReturns is primarily a desktop Tauri app.

Expected structure:

1. Header / nameplate
2. Settings panels
3. Media table
4. Processing flow display
5. Summary panel
6. Footer

Target window size is around `1400 x 900`. Mobile-first layouts are not required,
but text and controls should still avoid overlap when the window is resized.

## 6. Motion

| Animation | Duration | Usage |
|---|---:|---|
| `vu-pulse` | `0.8s` | Processing meter |
| `led-blink` | `1s` | Processing badge |
| Button press | `0.08s` | Hardware button feedback |

Motion should feel mechanical and precise, not playful.

## 7. Do

- Use gradients for metal and panel surfaces.
- Apply inset shadows for recessed controls.
- Use LED glow for status, not decoration.
- Keep labels uppercase and monospace.
- Keep corners sharp.
- Match photo/video panel tints to their content type.

## 8. Do Not

- Do not use flat solid fills for major surfaces.
- Do not use rounded card-heavy SaaS styling.
- Do not use decorative gradient blobs.
- Do not use large border radii.
- Do not dim LED indicators so far that state becomes unclear.
- Do not introduce unrelated color themes.

## 9. Quick Reference

```text
Aluminum:  #c0c0c0 to #e0e0e0
Console:   #0a0a0a to #1a1a1a
Gold:      #d4a843
LED Green: #44ff44
LED Amber: #ffaa00
LED Red:   #ff3333
LED Blue:  #44aaff
```

# DESIGN.md

photo-returns — Design System

## 1. Visual Theme & Atmosphere

Neve console / vintage audio hardware aesthetic. Brushed aluminum surfaces, machined edge bevels, LED indicator lights, and VU meter progress bars. The UI looks like a piece of professional studio equipment — channel strips, recessed dark panels, engraved uppercase labels, and warm gold accent buttons. Photos are displayed in recessed "peephole" windows.

Inspirations: Neve 1073 preamp, Akai MPC, Technics SL-1200, professional mixing consoles.

## 2. Color Palette & Roles

CSS custom properties + Tailwind extended palette.

### Metal Surface

| Token        | Hex       | Usage                |
| ------------ | --------- | -------------------- |
| `metal-50`   | `#f8f8f8` | Highlight            |
| `metal-200`  | `#e0e0e0` | Mid-light            |
| `metal-400`  | `#c0c0c0` | Mid-base             |
| `metal-600`  | `#909090` | Deep shadow          |
| `metal-900`  | `#333333` | Very dark             |

### Console Panel

| Token        | Hex       | Usage                |
| ------------ | --------- | -------------------- |
| `panel-500`  | `#181818` | Base panel           |
| `panel-900`  | `#0a0a0a` | Darkest console      |

### LED Indicators

| Color  | Hex       | Glow                            | Meaning    |
| ------ | --------- | ------------------------------- | ---------- |
| Green  | `#44ff44` | `rgba(68,255,68,0.5-0.8)`      | Success    |
| Amber  | `#ffaa00` | `rgba(255,170,0,0.5-0.6)`      | Pending    |
| Red    | `#ff3333` | `rgba(255,51,51,0.5-0.7)`      | Error      |
| Blue   | `#44aaff` | `rgba(68,170,255,0.5-0.6)`     | Processing |

### Warm Gold Accent

- `--accent-warm`: `#d4a843`
- `--accent-amber`: `#c8901a`

## 3. Typography Rules

### Font Family

```
'Courier New', 'Lucida Console', monospace
```

### Type Scale

| Element       | Size     | Weight | Notes                        |
| ------------- | -------- | ------ | ---------------------------- |
| H1 nameplate  | `text-4xl` | black | Tracking `0.12em`, engraved shadow |
| Tagline       | —        | —      | Tracking `0.2em`, uppercase  |
| Labels        | `0.55-0.65rem` | bold | Uppercase, engraved          |
| Badge text    | `0.6rem` | 700    | Uppercase                    |
| Input text    | `0.8rem` | —      |                              |
| Table headers | `0.65rem` | 700   | Uppercase, tracking `0.1em`  |

### Text Effects

- Engraved: `text-shadow: 0 1px 0 rgba(255,255,255,0.5), 0 -1px 0 rgba(0,0,0,0.3)` (3D embossed)
- LED glow: `text-shadow: 0 0 8px rgba(LED_COLOR,0.6)` per indicator color
- All labels: `text-transform: uppercase`

## 4. Component Stylings

### btn-hardware (Standard)

```css
background: linear-gradient(180deg, #d8d8d8, #c0c0c0, #b0b0b0, #c0c0c0);
border: 1px solid #888 (top:#c0c0c0, bottom:#707070);
box-shadow: inset highlights + 2 drop shadows;
transition: all 0.08s ease;
active: translateY(1px), inverted gradient;
```

### btn-hardware-primary (Gold)

```css
background: linear-gradient(180deg, #e0b850, #c89820, #b88010, #c89820);
border: 1px solid #906000;
box-shadow: golden glow 0 0 8px rgba(180,130,0,0.2);
```

### btn-hardware-scan (Steel Blue)

```css
background: linear-gradient(180deg, #7090c0, #4a70a8, #3a6098, #4a70a8);
```

### Console Panels

- **Brushed aluminum:** `repeating-linear-gradient(90deg, ...)` texture + gradient
- **Channel strip:** Silver gradient with inset bevel
- **Machined edge:** Multi-layer inset shadows for 3D beveled border
- **Recessed subpanel:** Dark gradient `#2a2a2a → #1e1e1e` with deep inset shadow
- **Photo settings:** Blue-tinted dark panel
- **Video settings:** Purple-tinted dark panel

### VU Meter Progress Bars

- Track: `linear-gradient(to right, #0a0a0a, #111, #0a0a0a)` with deep inset shadow
- Fill variants: pending (orange), processing (blue + pulse animation), completed (green), error (red)
- All fills: gradient with glow `box-shadow`

### LED Badges

- Font: Courier New, `0.6rem`, weight 700, tracking `0.1em`
- Padding: `2px 6px`, radius `2px`
- Processing state: `led-blink 1s infinite`

### Thumbnail Slot

- Dark inset: `bg: #0a0a0a`, `inset shadow: 0 2px 4px rgba(0,0,0,0.6)`
- Border: `1px solid #333` (top darker, bottom lighter)

### Custom Scrollbar

- Width: `10px`
- Track: dark gradient with `1px solid #111` borders
- Thumb: silver gradient `#909090 → #707070`, radius `2px`, inset bevel

## 5. Layout Principles

### Window

- Tauri: `1400 × 900px`
- Full-screen flex column
- Background: silver aluminum gradient

### Structure

1. Header (console nameplate)
2. Settings (2-column grid: photo + video panels)
3. Media table (expandable rows)
4. Flow display (2-column processing steps)
5. Summary panel
6. Footer

### Spacing

- `px-3 py-2` (tight), `px-4 py-3` (medium), `px-6 py-4` (spacious)
- Gaps: `gap-1` to `gap-8`
- Section margins: `mb-3` to `mb-6`

## 6. Depth & Elevation

### Shadow System (Custom Tailwind)

- `shadow-machined`: inset 3D bevel
- `shadow-channel`: audio console inset
- `shadow-inset-deep`: recessed depth
- `shadow-led-*`: color glow (green/amber/red/blue)

### Animations

| Animation  | Duration | Usage              |
| ---------- | -------- | ------------------ |
| `vu-pulse` | 0.8s     | Processing fill    |
| `led-blink` | 1s      | Processing badge   |
| Button press | 0.08s  | `translateY(1px)`  |

### Light/Dark Mode

- Light: brushed aluminum silver
- Dark: dark console surfaces
- LEDs remain bright in both modes

## 7. Do's and Don'ts

### Do

- Use linear gradients on all surfaces — flat colors look wrong
- Apply inset shadows for recessed/machined effects
- Use LED glow (`text-shadow` + `box-shadow`) for status indicators
- Keep all labels uppercase with Courier New
- Use `0.08s ease` transitions for mechanical button feedback
- Apply `translateY(1px)` on button press (physical push)
- Tint settings panels by content type (blue for photo, purple for video)

### Don't

- Use flat solid colors on surfaces — always gradient
- Apply rounded corners above `3px` (hardware has sharp edges)
- Use sans-serif fonts
- Remove the brushed aluminum texture on the main surface
- Make LED indicators dim in any theme

## 8. Responsive Behavior

Desktop-only Tauri app (`1400 × 900px`). No mobile breakpoints.

## 9. Agent Prompt Guide

### Color Quick Reference

```
Aluminum:  #c0c0c0 - #e0e0e0 (gradient)
Console:   #0a0a0a - #1a1a1a (gradient)
Gold:      #d4a843 (accent)
LED Green: #44ff44
LED Amber: #ffaa00
LED Red:   #ff3333
LED Blue:  #44aaff
```

### When generating UI for this project

- Studio hardware aesthetic. Every surface is a gradient, every edge is beveled
- Courier New monospace, all-uppercase labels, engraved text shadows
- LED status indicators with color-matched glow
- VU meter progress bars with gradient fills
- `0.08s` transitions for mechanical snappiness
- Brushed aluminum texture via `repeating-linear-gradient`
- Inset shadows for recessed panels, outset for raised surfaces
- No border-radius above 3px (hardware has sharp machined edges)
- Photo panels tinted blue, video panels tinted purple
- React + Tailwind 4 + TanStack Table

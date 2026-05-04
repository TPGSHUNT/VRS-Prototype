# VRS Design Language
## Reference for the prototype's UI taste, layout patterns, and interaction idioms
### TPG Partners · May 2026

This document captures the design taste established for the VRS prototype. Reference codebase: `pmo-management` (TPG, project portfolio dashboard). The three documents in this folder cover *what* the system does and *how the data is shaped*; this one covers *how it should feel*.

The guiding word is **frictionless**. Every screen exists to keep the user inside one work surface. Navigating away to a separate page is the wrong answer.

---

## 1. Three governing principles

### 1.1 The bubble field is the work surface
Login lands directly on the vendor bubble field. There is no separate dashboard. Every action a user takes either originates here or returns here.

- **Filters live in a left slider.** Opening filters does not navigate; it slides over the field.
- **The KPI strip at the top reflects the current filtered set.** Total visible vendors, total earnings in scope, period-close completion %, queue-pending count, anomaly count — all recalculate as filters change.
- **Click a bubble** → vendor record opens as a right slider with tabbed content.
- **Right-click a bubble** → context menu of actions (Open record / Run report / Ask Vera / Approve queue item if applicable).
- **Lasso/box-draw a region** → user draws a box with the mouse, then picks how to display the selection (separate temporary space / explode in place / filter to these only). Crucial at production scale (300+ vendors), useful even at 50.
- **Mode toggles in a floating bottom-bar** swap encoding axes (size by earnings vs. size by queue age, color by status vs. color by tier proximity, etc.).

### 1.2 Slider panels — left for actions, right for data
Both sides are addressable.

- **Left slider = discrete actions.** Filters, period-close checklist, agreement approval form, report submission, batch finalize, etc.
- **Right slider = data views.** Vendor record (tabbed), agreement detail, report viewer, calculation history.
- Slider widths are configurable per content type: 40 / 50 / 60 / 70 / 80%.
- Multiple sliders can be open at once (left + right). They overlay the field, which dims behind them.
- The vendor record (right slider) uses **internal tabs**: Overview · 1010 Intelligence · Programs · Calculations · Agreements · Invoices · Activity. The default active tab is **role-driven** (build plan §4.3): buyer → Agreements, AP analyst → Calculations, AP manager → Overview.

### 1.3 Notifications are actionable
The bell icon isn't a log. Each notification, when clicked, routes to its action surface:

| Notification type | Click target |
|---|---|
| `QUEUE_PENDING` | Agreement opens in a left-slider approval form with Approve / Reject |
| `REPORT_COMPLETE` | Triggers download or opens the report viewer in a right slider |
| `REPORT_FAILED` | Opens the failure detail with retry option |
| `AGREEMENT_APPROVED` / `AGREEMENT_REJECTED` | Opens the agreement detail in a right slider |
| `TIER_ALERT` | Opens vendor record on the 1010 Intelligence tab |
| `ANOMALY_FLAG` | Opens vendor record with the anomaly highlighted |
| `PERIOD_CLOSED` | Opens the period close summary |

Each notification's `payload` JSON encodes the navigation target (agreement ID, vendor ID, report ID, etc.) so the click handler can route correctly. The seed already populates this.

---

## 2. Visual tokens

Theme follows the shadcn/ui v2 convention with `oklch` color space and full dark-mode support, as seen in `pmo-management/app/globals.css`.

### 2.1 Surfaces and borders
| Token | Light | Use |
|---|---|---|
| `background` | `oklch(1 0 0)` (white) | Card / slider surface |
| `gray-50` | (Tailwind) | App background behind cards |
| `border-gray-200` | (Tailwind) | Card edges, inputs, dividers |
| `border-2 border-gray-300` | (Tailwind) | Primary container (the bubble field card) |

### 2.2 Shadow scale
- `shadow-sm` — login card, low-emphasis surfaces
- `shadow-md` — buttons (default state)
- `shadow-lg` — primary container, slider panels
- `shadow-xl` — hover state on lifted elements

### 2.3 Radius
- `rounded-lg` — default everywhere (buttons, inputs, panels)
- `rounded-xl` — cards
- `rounded-full` — bell icon, status dots, user avatar

### 2.4 Typography
- **Font:** Inter via `next/font/google`
- **Title:** `text-2xl font-bold text-gray-900` (header H1) or `text-3xl font-bold` (login)
- **Subtitle / section heading:** `font-semibold leading-none tracking-tight`
- **Description:** `text-sm text-muted-foreground` (gray-600 in light mode)
- **Label:** `text-sm font-medium text-gray-700`

### 2.5 Accent and status colors
- **Primary action:** `bg-blue-600` → `hover:bg-blue-700`, white text
- **Active toggle:** `bg-blue-600 text-white`
- **Notification dot:** `bg-red-500` (2px, top-right corner of bell icon)
- **Status mapping** (bubble color, badge color):
  - GREEN: `fill-green-500` / `bg-green-100 text-green-800`
  - AMBER: `fill-amber-500` / `bg-amber-100 text-amber-800`
  - RED: `fill-red-500` / `bg-red-100 text-red-800`
- **Halo for exceptions** (overdue invoice, anomaly, queue pending): diagonal hash pattern + animated pulse outline (PMO `ProjectBubble` over-budget halo). For VRS, queue-pending is the primary halo trigger.

---

## 3. Layout shell

```
┌──────────────────────────────────────────────────────┐
│  Header (73px)                                        │  ← bg-white border-b border-gray-200
│  Title + logo  ·············  Bell  User dropdown    │
├──────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────┐ │
│ │ KPI strip (12% height, scale-[0.75])             │ │  ← inside main container card
│ ├──────────────────────────────────────────────────┤ │
│ │                                                  │ │
│ │                                                  │ │
│ │           Bubble field viewport                  │ │
│ │                                                  │ │
│ │                                                  │ │
│ │                                                  │ │
│ │ ┌──────────────────────────────────────────────┐ │ │
│ │ │ Floating toolbar (bottom-4 left-4 right-4)   │ │ │  ← bg-white/50 backdrop-blur-sm
│ │ │ [Filters] [Layer] [Mode] [Pan] [Admin]       │ │ │
│ │ └──────────────────────────────────────────────┘ │ │
│ └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

- `body { margin: 0; overflow: hidden }` — single viewport, no body scroll, kiosk feel
- Main container: `rounded-lg shadow-lg border-2 border-gray-300 bg-white`, fills `calc(100vh - 73px)`
- Slider panels overlay this container, dimming the field behind them

---

## 4. Interaction idioms

### 4.1 Lift on hover (universal)
Every clickable element gets:
```
transition-all duration-200
hover:scale-105 hover:-translate-y-1 hover:shadow-xl
```
Active-state buttons skip the lift but get color invert.

### 4.2 Bubble hover
`opacity: 0.7 → 1.0`, `transform: scale(1.15)`, `drop-shadow: 0 6px 12px rgba(0,0,0,0.4)`. The bubble grows toward the cursor and casts a soft shadow.

### 4.3 Lasso / box-draw selection
- User mouse-drags on the field background to draw a selection box
- On release, a small floating menu appears near the cursor with display options:
  - **Show in side panel** — selected bubbles move to a right-slider scratch space
  - **Explode here** — selected bubbles separate within the field with collision applied
  - **Filter to these** — apply selection as a filter, KPI strip recalculates
  - **Run action** — context menu of bulk actions (Run report on these, Mark for review, etc.)
- Escape key clears selection

### 4.4 Slider open/close
- Slide in from the addressed side over 200ms
- Field behind dims to 40% opacity + slight blur
- Close button in slider header; Escape key also closes
- Tabs at the top of right-side data sliders; left-side action sliders do not use tabs (they're single-purpose)

### 4.5 Notification bell
- Persistent in header right side
- Red dot when unread count > 0
- Click opens a dropdown list of recent notifications; each row is clickable and routes per §1.3
- "Mark all read" link at the bottom

### 4.6 User menu
- Persistent in header right side (next to bell)
- Shows current user name + role badge
- Click opens dropdown with role badge, settings link, sign-out

---

## 5. Concrete VRS surface mappings

| Surface | Pattern |
|---|---|
| **Login** | Centered card on `bg-gray-50`, role-selector grid (7 role cards). Click to log in as the seeded user with that role. |
| **Bubble field landing** | The work surface. KPI strip + floating toolbar + force-sim bubbles. |
| **Vendor record** | Right slider with tabs. Default tab role-driven. |
| **Filter panel** | Left slider. Always-available via toolbar button. |
| **Period close checklist** | Left slider (it's an action sequence). Triggered from KPI strip "Period Close: 73% complete" widget. |
| **Agreement wizard** | Left slider. Multi-step form. |
| **Approval queue inline** | Left slider opened from notification or from right-click on a queue-pending vendor. |
| **My Reports panel** | Right slider with sortable list. Submit-new-report form is a left slider. |
| **Report viewer** | Right slider. |
| **Ask Vera** | Right drawer (separate from the right slider — Vera is persistent and overlays everything). Toggleable from a Vera button in the bottom toolbar. |

---

## 6. What NOT to do

- **No top-level nav links.** No "Vendors / Reports / Period Close" tabs in the header. Everything is reachable from the bubble field.
- **No multi-page wizards.** All wizards are slider-internal step flows.
- **No modals for routine work.** Use sliders. Modals are reserved for destructive confirmations (e.g., "Reject agreement?").
- **No body scroll.** The viewport is the surface. Internal scrolling is fine inside sliders and lists.
- **No saturated brand colors as backgrounds.** Neutral gray base; blue accent reserved for primary action and active state.
- **No abrupt transitions.** Every state change uses 200ms ease.

---

## 7. Open questions

- **Vera button placement:** floating toolbar with the other mode controls, or persistent right-edge tab? PMO doesn't have an analog.
- **Dark mode:** the theme tokens support it. Worth lighting up for the demo, or skip until production?
- **Keyboard navigation:** baseline (Tab, Esc, Enter) vs. power-user shortcuts (e.g., `/` to open Vera, `f` to open filters)?

These do not block Sprint 1. Park.

---

*Reference codebase: `C:\Users\david\development\pmo-management`. Specifically: `app/(dashboard)/layout.tsx`, `components/layout/Header.tsx`, `components/features/dashboard/DashboardClient.tsx`, `components/features/dashboard/ProjectBubble.tsx`, `components/ui/SliderPanel.tsx`.*

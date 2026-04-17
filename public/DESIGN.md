# Design System Strategy: The Curated Void

## 1. Overview & Creative North Star
The North Star for this design system is **"The Digital Monolith."** It is an exercise in restraint, drawing inspiration from high-end editorial archives and architectural blueprints. We are not building a standard interface; we are composing a digital gallery where the "void" (whitespace) is as functional as the content itself.

By prioritizing intentional asymmetry and "vanishing" UI boundaries, we create a sense of focused quietude. This system rejects the cluttered "box-model" of the traditional web, opting instead for a fluid, tonal experience that feels like ink resting on premium vellum.

---

## 2. Colors & Surface Philosophy
The palette is rooted in the tactile world: the warmth of raw paper and the precision of a lead pencil.

### The "No-Line" Rule
**Explicit Instruction:** 1px solid borders are strictly prohibited for structural sectioning. 
Boundaries must be defined through:
1.  **Whitespace:** Increasing margins to create natural groupings.
2.  **Tonal Shifts:** Moving from `surface` (#faf9f8) to `surface-container-low` (#f4f3f2).
3.  **The Ghost Border:** If a container absolutely requires definition for accessibility, use the `outline-variant` token at 15% opacity. Never use 100% opaque lines.

### Surface Hierarchy & Nesting
Treat the UI as stacked sheets of physical vellum.
- **Base Layer:** `surface` (#faf9f8) for the global canvas.
- **Content Blocks:** Use `surface-container-lowest` (#ffffff) to make high-priority content appear slightly "illuminated" from beneath.
- **Interactive Layers:** Use `surface-container-high` (#e9e8e7) for temporary elements like menus, creating a subtle physical lift without the need for aggressive shadows.

### Signature Texture & Gradients
To avoid a "flat" digital feel, apply a global, barely-perceptible noise texture (2% opacity) to the background. For the primary action (`primary`), use a subtle linear gradient from `primary` (#a6331d) to `primary_container` (#c74b32) at a 45-degree angle. This provides a "glow" that feels intentional and high-end.

---

## 3. Typography: Editorial Authority
We utilize a high-contrast scale where the display type is grand and the secondary info is microscopic yet legible.

- **Display & Headlines (Newsreader):** These are our "Lead" elements. Use `display-lg` with generous tracking (-0.02em) to create an authoritative, literary feel. 
- **Body & Labels (Inter/IBM Plex Sans):** These are our "Vellum." Use `body-md` for standard reading. For secondary metadata, drop to `label-sm` using `on_surface_variant` (#58413d) to reduce visual noise.
- **Hierarchy through Weight:** Use *Light (300)* or *Regular (400)* weights for almost everything. Boldness is achieved through size and color (`primary`), not stroke weight.

---

## 4. Elevation & Depth
In this system, "Elevation" is a state of mind, not a drop shadow.

### The Layering Principle
Depth is achieved by stacking tonal tiers. Place a `surface-container-lowest` card on top of a `surface-container-low` background. The 1% difference in luminosity provides all the "lift" required for a premium experience.

### Ambient Shadows
If an element must float (e.g., a critical modal), use a "Hairline Shadow":
- **Y-Offset:** 4px
- **Blur:** 20px
- **Color:** `on_surface` (#1a1c1c) at 4% opacity. 
It should be felt, not seen.

### Glassmorphism
For navigation bars or floating action buttons, use a `surface` color at 80% opacity with a `backdrop-filter: blur(12px)`. This allows the "ink" of the content to bleed through the "vellum" of the UI as the user scrolls.

---

## 5. Components

### Buttons
- **Primary:** `primary` background with `on_primary` text. Sharp `sm` (2px) corners. No border.
- **Secondary:** Transparent background, `on_surface` text. A `Ghost Border` (15% opacity `outline`) appears only on hover.
- **Tertiary:** Pure text with 1.5pt underline using `primary_fixed` color.

### Input Fields
- **Style:** No bounding box. Use a single bottom-weighted `surface-variant` line (2px). 
- **State:** On focus, the line transitions to `primary` (#a6331d).

### Cards & Lists
- **Rule:** Forbid divider lines. 
- **Implementation:** Separate list items with `1.5rem` of vertical whitespace. If separation is needed, use alternating background rows between `surface` and `surface-container-low`.

### Chips
- **Style:** `surface-container-highest` background, `on_surface` text. Shape: `sm` (2px) corner. 
- **Interaction:** On selection, background shifts to `primary` and text to `on_primary`.

---

## 6. Do’s and Don’ts

### Do:
- **Embrace Asymmetry:** Align a headline to the left but push the body text to a 60% width column to create an editorial layout.
- **Use "Terracotta" Sparingly:** The `primary` color is a surgical tool. Use it only for the one thing you want the user to do on the page.
- **Check Contrast:** Ensure that even with "subtle tonal changes," your `on_surface` text maintains AA readability against `surface-container` tiers.

### Don’t:
- **Don’t use 1px borders:** It breaks the "Vellum" illusion and makes the UI look like a standard web template.
- **Don’t use Rounded Corners:** Stick strictly to the `sm` (2px) or `none` (0px) settings. Large radii (md, lg, xl) feel too "software-like" and lose the architectural edge.
- **Don’t crowd the edges:** If a component feels tight, double the padding. This system thrives on the "air" between elements.
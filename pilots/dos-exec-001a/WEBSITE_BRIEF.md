# Starwhisk Bakehouse — Fictional Website Brief

> **Fictional and synthetic:** This brief describes a made-up bakery and
> a local prototype. Every product, price, schedule, quote, address,
> contact detail, and business assumption is synthetic. It is not a
> production brief for a real business.

## Website strategy

### Primary job

Help a visitor answer three questions quickly:

1. What is Starwhisk known for?
2. What should I choose for my occasion?
3. What would a pickup path feel like?

### Experience principle

**Warm first, clear always.** The page can feel handmade and distinctive
without making essential details decorative, hidden, or vague.

### Page hierarchy

1. Persistent fictional-concept disclosure.
2. Bakery promise and two same-page calls to action.
3. Three stable signature products with synthetic prices.
4. Simple fictional baking rhythm.
5. Local-only pickup estimator that stops before any transaction.
6. Fictional story and explicitly synthetic concept quote.
7. Native, keyboard-operable FAQ.
8. Clearly labeled fictional contact and schedule block.

### Calls to action

- **Plan a pickup box** — primary; jumps to the local estimator.
- **See the sample menu** — secondary; jumps to the product cards.
- **Try the local planning demo** — contextual; reinforces that the
  interaction is not an order.

No call to action sends, calls, purchases, books, subscribes, tracks, or
opens an external service.

### Conversion hypothesis

For the fictional scenario, a stable product set plus visible timing and
an explicit no-surprise pickup path should reduce uncertainty more than
a larger gallery or generic “contact us” message. This is a hypothesis
for later real validation, not a measured result.

## Website copy

### Voice

- sensory but concise;
- specific about the product, cautious about the business;
- neighborly rather than overly rustic;
- whimsical in naming, plain in instructions;
- no awards, provenance, sustainability, sellout, popularity, health,
  customer-satisfaction, or “best” claims.

### Core message system

| Role | Approved fictional copy |
|---|---|
| Eyebrow | “Small-batch comfort, imagined for the neighborhood” |
| Hero | “A brighter reason to take the long way home.” |
| Supporting line | “Starwhisk is a fictional corner bakehouse concept built around crackly hearth loaves, citrus-swirled morning buns, and celebration cakes with just enough sparkle.” |
| Menu section | “Fewer choices. Better reasons to return.” |
| Rhythm section | “Know what’s warm before you leave home.” |
| Estimator section | “Plan a pickup box—without placing an order.” |
| Story section | “Built around the moment after ‘I brought pastries.’” |
| Visit section | “Find the glow in Exampletown.” |

### Product-copy pattern

Each product uses:

1. a plain-language use case;
2. a distinctive fictional name;
3. one short sensory description;
4. a clearly labeled fictional price.

### Disclosure copy

The page-level bar reads:

> Fictional concept prototype • Synthetic details • No orders accepted

Contextual disclosures repeat where confusion would be costly:

- “Prototype only. Products, availability, prices, and pickup details
  are synthetic.”
- “Fictional price.”
- “Synthetic concept quote—not a customer testimonial.”
- “Fictional contact details.”
- “Nothing is sent, saved, reserved, or purchased.”

## Branding and imagery plan

### Brand idea

**Everyday warmth with a spark.** The identity combines familiar bakery
materials—cream paper, bread tones, handwritten-card geometry—with one
celestial motif that makes Starwhisk memorable without turning the site
into a theme park.

### Visual system

| Element | Direction | Purpose |
|---|---|---|
| Plum | Deep `#5B273D` | Premium warmth, readable contrast, strong calls to action |
| Cream | Soft `#FFF9ED` | Bakery paper and daylight warmth |
| Gold | `#F4B75E` | Crust, glow, focus visibility, small moments of delight |
| Burnt orange | `#C86D3E` accent / `#9A3E25` normal text | Appetite cue with AA-readable labels on cream/paper |
| Sage | `#6F7D5B` accent / `#4D5B39` normal text | Quiet accent with AA-readable product labels |
| Display type | System Georgia serif | Editorial warmth with zero font download |
| Body type | System UI sans serif | Clear instructions and resilient local rendering |
| Shape | Rounded cards + restrained star/loaf marks | Friendly recognition without stock imagery |

### Local imagery

The prototype uses one original local SVG mark and CSS illustration:

- `site/assets/logo.svg` combines a star and scored round loaf;
- the hero “display card” is constructed with HTML/CSS;
- product symbols are typographic and decorative;
- no stock photography, external font, tracking pixel, CDN, or remote
  asset is used.

### Real-adaptation photography plan

If separately authorized for a real bakery:

1. photograph hands finishing one signature pastry;
2. capture a full but orderly bake case at opening;
3. show the three signature products at consistent scale;
4. include one pickup-context image that clarifies packaging;
5. avoid staged crowds, fabricated scarcity, or images of products not
   normally available;
6. record creator, license, consent, and alternative-text notes for
   every selected image.

### Accessibility intent

- Persistent text, not color alone, distinguishes synthetic status.
- Semantic landmarks and one clear `h1` create a navigable outline.
- Form labels remain visible; status output uses `aria-live="polite"`.
- The skip link appears on focus.
- Focus styling uses a high-visibility gold outline.
- Navigation targets are measured at least 44 CSS pixels high across
  all 16 validated widths; calls to action retain equivalent compact
  sizing.
- Native `details`/`summary` preserves keyboard FAQ operation.
- Motion is removed when `prefers-reduced-motion` is active.
- Decorative images use empty alternative text; the meaningful concept
  is repeated as visible brand text.

### Responsive intent

- Desktop uses a two-column hero and editorial split sections.
- Tablet collapses content sections before text becomes cramped.
- Mobile changes navigation to a two-column pill grid, stacks every
  major layout, expands calls to action, and preserves readable padding.
- No essential information depends on hover.
- The design is measured at 320, 360, 375, 390, 414, 480, 540, 600,
  620, 640, 768, 800, 820, 900, 1024, and 1440 CSS pixels, plus
  representative 125% and 150% text-zoom cases. The 375×812 and
  1440×900 states are retained as full-page visual evidence while
  broader browser/device limitations remain acknowledged.

---
name: "AI 额度看板"
description: "A light metro diagram of remaining quota, one line per subscription."
colors:
  ground: "#f7f7f5"
  ink: "#141414"
  ink-soft: "#3f463f"
  ink-hover: "#2a2a2a"
  rule: "#d9d6cc"
  paper: "#fffdf8"
  ghost-wash: "#eceae3"
  terminus: "#c23b22"
  low: "#8a5a00"
  route-opencode: "#1d4ed8"
  route-grok: "#141414"
  route-claude: "#c2410c"
  route-zhipu: "#047857"
  route-deepseek: "#6d28d9"
  route-bailian: "#0f766e"
  route-codex: "#be185d"
typography:
  display:
    fontFamily: '"Quota Sans", "PingFang SC", "Noto Sans SC", sans-serif'
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.04em"
    fontFeature: "tabular-nums"
  headline:
    fontFamily: '"Quota Sans", "PingFang SC", "Noto Sans SC", sans-serif'
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  title:
    fontFamily: '"Quota Sans", "PingFang SC", "Noto Sans SC", sans-serif'
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  body:
    fontFamily: '"Quota Sans", "PingFang SC", "Noto Sans SC", sans-serif'
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
    fontFeature: "tabular-nums"
  label:
    fontFamily: '"Quota Sans", "PingFang SC", "Noto Sans SC", sans-serif'
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "normal"
rounded:
  action: "2px"
  track: "0px"
  disc: "50%"
spacing:
  tight: "8px"
  row: "16px"
  page: "28px"
  page-end: "48px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    rounded: "{rounded.action}"
    padding: "8px 14px"
  button-primary-hover:
    backgroundColor: "{colors.ink-hover}"
    textColor: "{colors.ground}"
    rounded: "{rounded.action}"
    padding: "8px 14px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.action}"
    padding: "8px 14px"
  button-ghost-hover:
    backgroundColor: "{colors.ghost-wash}"
    textColor: "{colors.ink}"
    rounded: "{rounded.action}"
    padding: "8px 14px"
  notice:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.track}"
    padding: "12px 14px"
  header:
    textColor: "{colors.ink}"
    padding: "0 0 16px"
  metro-line:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    padding: "18px 0 16px"
  metro-line-spent:
    textColor: "{colors.terminus}"
    padding: "18px 0 16px"
  metro-line-low:
    textColor: "{colors.low}"
    padding: "18px 0 16px"
  harness-chip:
    textColor: "{colors.ink}"
    height: "22px"
---

# Design System: AI 额度看板

## Overview

**Creative North Star: "The Light Metro Diagram"**

Each subscription is a line on a light platform. The ground is warm off-white, the type is near-black, and the only saturated color on a line is that source's route. A filled disc, the train, sits at the fraction already used. The right end of the page track is a diamond, the terminus. Lines stack down the page. They are not cards, and they do not share a brand accent.

The column is 1120px. Identity sits on the left, the track and its stations in the middle, and the default window's remaining amount on the right in large tabular figures. A station with a number sits at that window's used fraction and prints the amount still left. A window with no number stays empty: the train and the diamond are absent, and the station does not read as zero. Latin letters and digits use self-hosted Source Sans 3. Chinese uses the system gothic in the same stack.

The Harness strip is the same diagram compressed into the composer: the same route colors, a 2px track, and a smaller disc. Its buttons, corner radius, elevation, and label color belong to the host and are not material of this world.

**Key Characteristics:**

- One route color per source, on the swatch, the track, and the healthy train
- The train marks the used fraction; the page track ends in a ground-filled diamond
- Exhausted and low recolor the train and the remainder; the track keeps its route
- Flat platform: a 2px ink header rule, 1px joints, no shadow tokens
- Tabular Source Sans 3 for digits; system gothic for Chinese
- Ink actions with 2px corners, on a light platform only

## Colors

The platform is warm and nearly neutral. Saturation belongs to the route, and only to the route.

### Primary

There is no single brand hue. The primary color of a line is the route stored for that source. The same seven values paint the local page and the Harness strip.

- **OpenCode Blue** (#1d4ed8): OpenCode Go.
- **Grok Ink** (#141414): X Premium · Grok. This route is Rail Ink, not a separate hue.
- **Claude Orange** (#c2410c): Claude.
- **Zhipu Green** (#047857): 智谱 GLM Coding Plan.
- **DeepSeek Violet** (#6d28d9): DeepSeek.
- **Bailian Teal** (#0f766e): 阿里云百炼 Coding Plan.
- **Codex Rose** (#be185d): OpenAI Codex.

Two state colors replace the route on the train and the remainder. They do not replace the track.

- **Terminus Red** (#c23b22): the quota is exhausted, a source failed, or an error is on the line. On the page it also paints the spent train and the large remainder.
- **Low Amber** (#8a5a00): the remainder is low. It paints the low train and the large remainder, and the strip's low value.

### Neutral

- **Platform Ground** (#f7f7f5): the page background, the primary button's text, the selection text, and the diamond's fill. The page sets `color-scheme` to light.
- **Rail Ink** (#141414): text, the 2px header rule, the primary button, the focus ring, and the selection background. Also the Grok route.
- **Pressed Ink** (#2a2a2a): the primary button on hover.
- **Olive Quiet** (#3f463f): status, stations that are not the lead, the figure caption, the footer, and the refresh status.
- **Platform Joint** (#d9d6cc): the 1px rule under each line.
- **Notice Paper** (#fffdf8): the notice fill. It is not a card surface for lines.
- **Ghost Wash** (#eceae3): the ghost button on hover.

**The Route Rule.** Each source has one route color. It paints the identity swatch, the 2px track, and the train while that window is healthy. It is not a card fill, a page background, or another source's color.

**The State Override Rule.** On the page, a remainder at or below zero paints the train and the large figure Terminus Red. A remainder at or below one fifth of a known total paints them Low Amber. The track stays the route color. Failed status and error text also use Terminus Red. The strip recolors the remainder with those same two colors, and it treats a percent window as a total of 100 when choosing Low Amber.

## Typography

**Display Font:** Quota Sans (self-hosted Source Sans 3, Latin, weights 400 and 600), then PingFang SC, Noto Sans SC, sans-serif

**Body Font:** the same stack

**Chinese:** the system gothic in that stack. Quota Sans is limited to U+0000–00FF, so Han characters fall through.

**Character:** One gothic voice. Digits are tightened and tabular. There is no display serif. The data path in the footer is the only mono, set in ui-monospace, SFMono-Regular, Menlo, monospace at 11px.

### Hierarchy

- **Display** (600, 2rem, line-height 1, tracking −0.04em): the default window's remaining amount. Below 800px it is 1.75rem. An empty amount drops to 1rem in Olive Quiet.
- **Headline** (600, 1.75rem, line-height 1.1, tracking −0.03em): the page title, 「AI 额度看板」. Below 800px it is 1.4rem.
- **Title** (600, 16px, line-height 1.25, tracking −0.02em): the source name on a line.
- **Body** (400, 15px, line-height 1.45): the page. Amounts use tabular figures.
- **Label** (400, 12px, line-height 1.2): status, the figure caption, and the footer. Stations are 11px. Errors and the refresh status are 13px. The mode mark is 12px, uppercase, Olive Quiet, tracking 0.08em, and it inherits the title's weight because it sits inside the title. Below 800px its tracking returns to 0.

**The Split Face Rule.** Quota Sans is self-hosted Source Sans 3 at weights 400 and 600, limited to Latin (U+0000–00FF). Chinese falls through to PingFang SC, then Noto Sans SC, then sans-serif. Do not add a display face.

**The Two Weights Rule.** Emphasis is weight 600. The face does not ship 500 or 700, and new text does not ask for them.

## Layout

The page is one centered column, max-width 1120px, padded 28px on the sides and top and 48px at the bottom. Below 800px the padding is 18px 16px 36px.

The header is a two-column grid (1fr, auto) with a 12px row gap and a 16px column gap. It sits 28px above the lines and closes with 16px of padding under a 2px Rail Ink rule. The title and mode mark are on the left. The two actions are on the right. The refresh status spans the full width.

Each source is a three-column row: identity `minmax(148px, 190px)`, the track, and the remainder. The row gap is 8px, the column gap is 28px, and the padding is 18px 0 16px. A 1px Platform Joint closes the row. The identity is a 14px route disc plus the name and status, with 10px between them.

The track is 2px tall, with 18px above it and 36px below it so the station labels clear the next row, and 12px of side margin so the diamond can sit on the end. A window with a number is placed at its used fraction. The lead station is the default window. The large remainder repeats that window. Reset text sits under the track, in the track column, at 12px Olive Quiet.

Below 800px the header and each line become a single column. Actions align to the start. The remainder aligns left at 1.75rem.

The Harness strip is a 22px row in the composer, not a second page grid. Its popover is anchored to that row.

**The Horizontal Line Rule.** A source is one row: identity, track, remainder. Rows stack in a single column. They do not become a card grid.

**The Station Placement Rule.** A window with a number sits at its used fraction and prints the amount left. A window without a number is spaced evenly and stays unlabeled as zero. The default window is the lead station, in ink at weight 600, and its amount is repeated in the figure.

## Elevation & Depth

The platform is flat. Depth is a line weight, not a shadow. The header closes with a 2px Rail Ink rule. Each source closes with a 1px Platform Joint. The notice is an ink stroke on Notice Paper. Focus is a 2px Rail Ink outline, 3px outside the control. Selection is Rail Ink on Platform Ground.

The train slides along the track in 420ms with `cubic-bezier(0.16, 1, 0.3, 1)`. Reduced motion removes that transition. The page has no other motion.

**The Flat Platform Rule.** Surfaces do not lift. The header closes with a 2px ink rule, each line closes with a 1px Platform Joint, and focus is a 2px ink outline 3px outside the control. No shadow is a token.

## Shapes

The form language is the diagram's own marks. The train is a filled circle. The page terminus is a diamond: a 7px square, 1.5px Rail Ink stroke, Platform Ground fill, rotated 45 degrees, centered on the right end of the track. Tracks, the notice, and the diamond are square-edged. Actions are 2px rectangles. The route swatch is a 14px disc. An idle line, one with no usable fraction, hides both the train and the diamond and leaves the bare route track.

**The Disc and Diamond Rule.** The train is a filled disc: 12px on the page, 8px on the popover track, 6px in the strip. The page track ends in a 7px diamond with a 1.5px ink stroke and a Platform Ground fill, rotated 45 degrees. Tracks are square-ended. Actions are 2px rectangles. An idle line hides both the train and the diamond.

## Components

### Buttons

Ink controls with a 2px corner. The label is 14px, weight 600, line-height 1.

- **Shape:** 2px radius, 1px Rail Ink stroke, padding 8px 14px.
- **Primary:** Rail Ink fill, Platform Ground text. This is 「刷新额度」, the right-hand action. Hover fills Pressed Ink. Disabled drops to 45% opacity and the default cursor.
- **Ghost:** transparent fill, Rail Ink text. This is 「重新读取」. Hover fills Ghost Wash.
- **Focus:** 2px Rail Ink outline, 3px offset.

### Header

The title, the mode mark 「本地」, and the two actions. The mode mark is an inline 12px uppercase label in Olive Quiet, not a line above the title. A 2px Rail Ink rule closes the header. Below 800px the actions drop under the title and align left.

### Notice

A sharp ink border on Notice Paper, padding 12px 14px, no radius and no shadow. It carries a blocking local condition, such as a missing token. Lines do not use this surface.

### Metro line

The signature. Identity, track, stations, remainder.

- **Identity:** a 14px route disc, the source name at 16px weight 600, and a 12px status in Olive Quiet. A failed status turns Terminus Red.
- **Track:** 2px, square ends, in the route color. The page track's `::after` is the terminus diamond.
- **Train:** a 12px route disc at the used fraction (`left: calc(var(--at) * (100% - 12px))`). Spent uses Terminus Red. Low uses Low Amber. Idle renders no train.
- **Stations:** 11px, Olive Quiet, centered under their mark. The lead station is Rail Ink at weight 600. Each station prints the window name and the amount left.
- **Remainder:** the Display figure, aligned to the end of the row. Spent and low recolor it. The caption under it is 12px Olive Quiet and names the window. An empty figure says the line has no train, at 1rem Olive Quiet.

### Harness strip

The same routes, compressed. Each source is a 28×2px square track, a 6px disc when a fraction exists, a short name, and a tabular remainder. Low Amber and Terminus Red recolor the number. The name, the healthy number, the 22px row, and the 6px control radius inherit the host composer.

The popover repeats the diagram per source: a 2px route track, an 8px disc, and window labels placed by the same station rule. It does not draw the terminus diamond. Its radius, backdrop, and elevation are the host menu, not this platform.

## Do's and Don'ts

### Do:

- **Do** paint each source's swatch, 2px track, and healthy train with that source's route color.
- **Do** park the train at the used fraction, left for a full remainder and right for an empty one.
- **Do** end the page track with a 7px diamond: 1.5px ink stroke, Platform Ground fill, rotated 45 degrees.
- **Do** recolor the train and the large remainder with Terminus Red when the remainder is zero or below, and with Low Amber when it is at or below one fifth of a known total. Leave the track in the route color.
- **Do** set digits in Quota Sans (Source Sans 3, 400 and 600, Latin) and Chinese in PingFang SC, then Noto Sans SC, then sans-serif, with tabular figures.
- **Do** leave a missing window empty: no train, no diamond, and no zero in place of an unread amount.
- **Do** keep the Harness strip on the same route colors and a 2px track, with a 6px disc in the strip and an 8px disc on the popover track.

### Don't:

- **Don't** wrap a source in a card, a tinted well, or a second background.
- **Don't** invent a shared brand accent, or paint one source with another source's route.
- **Don't** draw a missing window as zero.
- **Don't** add drop shadows, gradients, or a dark theme. The page sets color-scheme to light.
- **Don't** add a display typeface, a weight other than 400 and 600, or a glyph icon system for this world.
- **Don't** round the track, fill it as a bar, or replace the page diamond with an arrow.
- **Don't** restyle the Harness controls with the page's ink buttons. Host radius, elevation, and focus stay with the host.

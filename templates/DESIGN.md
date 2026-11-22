---
version: alpha
name: {{PROJECT_NAME}}
description: "Design system for {{PROJECT_NAME}}: {{ONE_LINER}}"
colors:
  primary: "#1F2937"
  on-primary: "#FFFFFF"
  secondary: "#4B5563"
  accent: "#2563EB"
  background: "#FFFFFF"
  surface: "#F9FAFB"
  text: "#111827"
  muted: "#6B7280"
  danger: "#B91C1C"
typography:
  h1:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: 4px
  md: 8px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm}"
  page:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
  link:
    textColor: "{colors.accent}"
  hint:
    textColor: "{colors.muted}"
    typography: "{typography.label}"
---

# {{PROJECT_NAME}} design system

<!-- The one source of truth for how screens look (L113). Agents read it before building any screen and never
invent a color, font or spacing that is not here; a new value is added here first. Replace the neutral starter
values with the brand's. Lint: the "Lint DESIGN.md" step in .github/workflows/gates.yml (the @google/design.md CLI, pinned there). -->

## Overview

Who uses it and how it should feel: {{PRIMARY_USER}}. Describe the mood in two or three sentences.

## Colors

`primary` for the main action, `accent` for links and focus, `danger` only for destructive actions and errors.
Text on `background` and `surface` uses `text`; secondary text uses `muted`.

## Typography

One family, three roles: `h1` for page titles, `body` for content, `label` for buttons and form labels.

## Layout

Spacing comes from the `spacing` scale only. Phone first: one column under 640px.

## Shapes

`rounded.md` for buttons, inputs and cards; `rounded.full` for avatars and pills.

## Components

`button-primary` is the only filled button; every other action is an outline or a text button.

## Do's and Don'ts

- Do take every value from the tokens above.
- Don't add a color, font or spacing in code; add it here first, then use it.

# Splitbill Design System

## Direction

Warm paper / receipt atmosphere with a sharp ink accent for money. Quiet utility — readable outdoors, thumb-friendly, single column.

## Color

| Token | Value | Use |
|-------|-------|-----|
| `--color-paper` | `#F3EDE3` | App background |
| `--color-paper-raised` | `#FFFBF5` | Surfaces / inputs |
| `--color-ink` | `#1C1915` | Primary text |
| `--color-ink-muted` | `#5C554C` | Secondary text |
| `--color-ink-faint` | `#8A8175` | Hints, placeholders |
| `--color-rule` | `#D9D0C3` | Dividers |
| `--color-accent` | `#0F6B4C` | Primary actions, money emphasis |
| `--color-accent-pressed` | `#0A4F39` | Pressed primary |
| `--color-accent-soft` | `#D8EDE4` | Selected chips, soft fills |
| `--color-warn` | `#9A3412` | Unassigned / attention |
| `--color-warn-soft` | `#F5E0D4` | Warn backgrounds |
| `--color-danger` | `#8B1E1E` | Destructive |

Neutrals are warm-tinted — never pure gray or pure black.

## Typography

- **Display / brand:** Newsreader (serif) — app title, large totals
- **UI / body:** Source Sans 3 — labels, lists, forms
- **Money:** Source Sans 3 tabular nums, semibold

Scale (mobile): 12 / 14 / 16 / 20 / 28 / 36. Line height ~1.35–1.5. Min body 16px for inputs.

## Spacing & layout

- Base unit 4px; common gaps 8 / 12 / 16 / 24
- Content max-width 28rem, centered
- Safe-area padding for notches / home indicator
- Sticky bottom action bar for primary CTAs
- Min tap target 44×44px

## Components

- **List rows** for items (not nested cards)
- **Person chips** — circular initial + name; selected = accent soft fill + accent ring
- **Primary button** — full-width in bottom bar, accent fill, ink-on-accent text inverted to paper
- **Secondary button** — outline / ghost on paper
- **Inputs** — raised paper fill, rule border, 12px radius
- **Progress** — thin accent bar for OCR

## Motion

- OCR progress: linear fill
- Chip select: 120ms opacity/background
- No bounce / elastic easing

## Screen map

1. **Home** — recent bill or start; add people; Scan / Enter manually
2. **Scan** — camera/gallery, preview, OCR progress
3. **Review** — edit items, tax, tip
4. **Assign** — per-item person chips; flag unassigned
5. **Totals** — per-person amounts + copy summary

## Anti-patterns

No Inter/Roboto/Arial as brand fonts. No purple gradients. No card-in-card. No gray-on-color. No tiny tap targets.

---
title: Changelog
type: "page"
draft: false
---

## 0.9.2 - 6 April 2026

**Added**

- Nav link to a new tool - quickly diagnose your DayZ illnesses: [www.whyareyousick.com](https://www.whyareyousick.com)

**Changed**

- Improved the neglected mobile UI:
  - Full object viewer on object press.
  - Show / hide folder menu.
  - In-game name column added.
  - Show filters menu.

**Fixed**

- Mobile: Fixed nav menu / logo display in mobile view.
- Map: touch controls now work on mobile view (probably).
- Map: You can no longer fly the the plane backwards.
- Various UI issues.

## 0.9.1 - 30 March 2026

**Added**

- /changelog - removed Discord link.
- New Editor Builds based on vanilla locations.
- Added image paths to object.ingame.json
- Many more images.
- A plane mini-game on the map.

**Changed**

- Changed icons across site to unify the design and removed ugly emojis
- Massive, terrifying code refactoring . Pls no bugs.
- Many, many UI improvements, especially buttons.
- Now properly matching configs + p3ds, and config + colorbase variants instead of guessing.
- Map: Improved map performance, especially with many objects selected
- Editor Builds no longer part of API docs.
- Removed dze files from Editor Builds to reduce site payload - Copy to Editor or json options remain.
- 1.29 objects is now in table

**Fixed**

- Map: Clicking on ’37 on Chernarus’ in object viewer didn’t change map URL or button state.
- Map: When selecting an object on the map, pressing the x in the search bar would not clear it.
- Map: When reducing screen size, the object hover menu would go full width instead of staying top right.
- When closing or opening the help message, the object viewer and sidebar did not change position until scrolled
- When opening the object viewer by clicking 'path' on a pinned path, the menu
  would overlap the main table
- Long path menu was bad, simpler solutiona added.
- Other small things I've forgotten


### 0.9.0 - 20 March 2026

**Added**

- Object Maps - view the location and numbers of any object across Chernarus, Livonia and Sakhal. Use Select Area to copy anything from vanilla maps and paste into Editor or export.
- Sidebar view - total redesign meaning you can browse the entire DZ folder structures
- Types Explorer - browse the values and tags of objects across each map
- New Editor Builds in their own section
- Added more and better images.
- Randomised 'Copy to Editor' shape for paths

**Changed**

- Editor Presets is now Editor Builds.
- Dark mode button added to nav menu.

**Fixed**

- This was an 'add bugs' update

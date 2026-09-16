---
title: Changelog
type: "page"
draft: false
---

## 1.0.2 - 16 September 2026

- Added new 1.30 experimental objects (some images still to do) - only available in DayZ Experimental. See [here](http://127.0.0.1:1313/?version=v1.29-exp-badlands&version=v1.30-exp-badlands)
- Added 'Other projects' button, with a new ascii Chernarus map: `ssh ascii.samsobjectfinder.com` from your terminal.

## - 1.0.1 - 5 August 2026

- Rows per page is now persistent.
- Console sorting will also survive reload - pressing 'Reset view' will revert it to 'All'

## 1.0 - 3 August 2026

- 99% of objects now have images - close enough for a 1.0 release to me!
- Added a 'Last updated' display

Note: Badlands looks as if it will have many new objects (and many variants of the same object, considering all the rebuilding). I'll be updating this site as soon as I can with all the new additions once released. You can see what's been added so far [here](https://samsobjectfinder.com/?version=v1.29-exp-badlands).

## 0.9.8 - 15 July 2026

- Added 1.29 Road to Badlands types.xml entries to the [Types Explorer](https://samsobjectfinder.com/?types=1) for new objects and updated the types changelog.
- Added Download Latest Types buttons to the Export menu and Types Explorer.


## 0.9.7 - 1 July 2026

**Added**

- 1.29 Experimental Road to Badlands objects See [here](https://samsobjectfinder.com/?version=v1.29-exp-badlands).
- Version history for objects added in which update.
- Badlands objects added footer bar.

## 0.9.6 - 24 April 2026

**Added**

- Additional undocumented 1.29 objects. See [here](https://samsobjectfinder.com/?version=v1.29).


## 0.9.5 - 18 April 2026

- dz/rocks/snow_rocks were wrongly marked as not console friendly.


## 0.9.4 - 14 April 2026

**Added**

- Additional dimension data to API output, replacing many 2.5 x 2.5 placeholders.

**Fixed**

- Link handling error meant sometimes linking to an object would load the full table.
- Table column headings were wrong. 


## 0.9.3 - 9 April 2026

**Added**

- New 1.29 types.xml entries + changelog.

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

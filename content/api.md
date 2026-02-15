---
title: API
type: "page"
url: "/api/"
draft: false
---

This basic API allows you to pull the latest database for your own use. Each object has been given a unique immutable `id` (e.g. `dzobj_00fyisazn2`). While most objects names will not change, the id will ensure a stable reference.

- `GET /api/v1/meta.json`
- `GET /api/v1/objects.full.json`
- `GET /api/v1/object-names.json`
- `GET /api/v1/objects.ingame.json`

`meta.json` shows latest update metadata.  

`objects.full.json` is a single file with all object data.

`object-names.json` is a unique sorted list of all object class names and ids

`objects.ingame.json` contains player loot only, with id, object name and in-game.



---
title: API
type: "page"
url: "/api/"
draft: false
---

This basic API allows you to pull the latest database for your own use.

## Endpoints

- `GET /api/v1/meta.json`
- `GET /api/v1/objects.full.json`

`meta.json` shows latest update metadata.  
`objects.full.json` is a single file with all object data.

Use `id` as the stable key for every object as the database is regularly updated.

# Trader Table Proxy Spawn (CLE)

This converts Editor-placed table + loot objects into `mapgrouppos.xml` and
`mapgroupproto.xml` proxy entries.

Use script:

```bash
python3 scripts/build_trader_proxy_from_editor.py \
  --input docs/build-generator-refs/trader-table-bandage-editor-sample.json \
  --table-type StaticObj_Misc_Table_Market \
  --item-types BandageDressing \
  --group-prefix TraderTableBandage \
  --usage Town \
  --category medical \
  --out-pos docs/generated_trader_mapgrouppos.xml \
  --out-proto docs/generated_trader_mapgroupproto.xml
```

What it does:

- Finds each `StaticObj_Misc_Table_Market` in the Editor JSON.
- Attaches nearby `BandageDressing` objects to the nearest table.
- Converts world-space bandage position/orientation into table-local
  `proxy pos` and `proxy rpy`.
- Writes ready-to-paste XML snippets.

Notes:

- This uses **real placed data** from your editor JSON.
- If a bandage is too far from any table (default 3m), it is skipped.
- You can pass multiple item types via `--item-types TypeA,TypeB`.

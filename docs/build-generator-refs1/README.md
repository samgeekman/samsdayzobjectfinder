Build Generator Reference Files

These files are local reference pools used by the Build Generator work:

- `tree-ref.txt`
- `slum-ref.txt`
- `wrecks-ref.txt`

Source copies currently also exist in project root as:

- `tree ref.txt`
- `slum ref.txt`
- `wrecks ref.txt`

Bandage calibration (for Trader Table mode)

Reference sample used:

- Table type: `StaticObj_Misc_Table_Market`
- Item type: `BandageDressing`

Calibrated values:

- Offset: `[-0.8447265625, 0.4829559326171875, -0.150390625]`
- Orientation: `[0, 0, -89.38273620605469]`
- Scale: `0.9999993443489075`

Current intended behavior:

- Keep an even grid for XY placement.
- Apply calibration to bandage orientation/height/scale only.
- Do not apply calibration XY offset (prevents bottom-left drift).

Proxy/CLE conversion helper:

- Script: `scripts/build_trader_proxy_from_editor.py`
- Sample input: `docs/build-generator-refs/trader-table-bandage-editor-sample.json`
- Generated outputs:
  - `docs/generated_trader_mapgrouppos.xml`
  - `docs/generated_trader_mapgroupproto.xml`

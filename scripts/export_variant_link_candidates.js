#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const INPUT = path.join(ROOT, "data", "dayz_objects.json");
const OUT_CSV = path.join(ROOT, "reports", "config_variant_link_candidates.csv");
const OUT_JSON = path.join(ROOT, "reports", "config_variant_link_candidates.json");

const VARIANT_TOKENS = new Set([
  "black", "white", "blue", "green", "red", "yellow", "orange", "brown", "grey", "gray", "tan", "beige",
  "pink", "purple", "violet", "olive", "khaki", "camo", "camo1", "camouflaged", "woodland", "desert", "winter",
  "summer", "autumn", "fall", "dark", "light", "lightblue", "darkblue", "darkgreen", "darkgrey", "lightgrey",
  "navy", "maroon", "gold", "silver", "police", "medic", "mil", "military", "de", "chernarus", "livonia",
  "sakhal", "ttsko"
]);

function normalizeModelToken(value) {
  let token = String(value || "").trim().toLowerCase();
  token = token.replace(/\.[a-z0-9]+$/, "");
  token = token.replace(/^(land_|staticobj_|wreck_|misc_|house_)/, "");
  token = token.replace(/[^a-z0-9]+/g, " ");
  token = token.trim().replace(/\s+/g, " ");
  return token;
}

function splitTokens(value) {
  const n = normalizeModelToken(value);
  if (!n) return [];
  return n.split(" ").filter(Boolean);
}

function baseVariantKey(value) {
  const parts = splitTokens(value);
  const kept = parts.filter((t) => !VARIANT_TOKENS.has(t));
  return (kept.length ? kept : parts).join(" ");
}

function pathFamily(p) {
  const parts = String(p || "").toLowerCase().split("/").filter(Boolean);
  return parts.slice(0, 3).join("/");
}

function hasBBox(obj) {
  return (
    Array.isArray(obj.bboxMinVisual) &&
    obj.bboxMinVisual.length === 3 &&
    Array.isArray(obj.bboxMaxVisual) &&
    obj.bboxMaxVisual.length === 3
  );
}

function csvEscape(v) {
  const s = v == null ? "" : Array.isArray(v) ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, "\"\"")}"` : s;
}

function main() {
  const rows = JSON.parse(fs.readFileSync(INPUT, "utf8"));

  const donors = rows.filter((r) => String(r.modelType || "") === "Raw P3D" && hasBBox(r));
  const linkedConfigs = rows.filter((r) => String(r.modelType || "") === "Config" && String(r.dimensionsSource || "") === "bbox_linked_p3d");
  const unresolvedConfigs = rows.filter((r) => String(r.modelType || "") === "Config" && String(r.dimensionsSource || "") !== "bbox_linked_p3d");

  const donorsByBase = new Map();
  for (const d of donors) {
    const key = baseVariantKey(d.objectName);
    if (!key) continue;
    if (!donorsByBase.has(key)) donorsByBase.set(key, []);
    donorsByBase.get(key).push(d);
  }

  const linkedDonorByBase = new Map();
  for (const c of linkedConfigs) {
    const key = baseVariantKey(c.objectName);
    const donorId = String(c.bboxLinkedFromId || "").trim();
    if (!key || !donorId) continue;
    linkedDonorByBase.set(key, donorId);
  }

  const donorsById = new Map(donors.map((d) => [String(d.id || ""), d]));
  const out = [];

  for (const c of unresolvedConfigs) {
    const base = baseVariantKey(c.objectName);
    const fam = pathFamily(c.path);
    const sameBase = donorsByBase.get(base) || [];
    const sameBaseFam = sameBase.filter((d) => pathFamily(d.path) === fam);
    const siblingLinkedId = linkedDonorByBase.get(base) || "";
    const siblingLinkedDonor = siblingLinkedId ? donorsById.get(siblingLinkedId) : null;

    let status = "no_candidate";
    let method = "";
    let confidence = "";
    let donor = null;
    let candidateCount = 0;

    if (siblingLinkedDonor) {
      status = "candidate";
      method = "sibling_linked_base";
      confidence = "high";
      donor = siblingLinkedDonor;
      candidateCount = 1;
    } else if (sameBaseFam.length === 1) {
      status = "candidate";
      method = "base_key_path_family";
      confidence = "high";
      donor = sameBaseFam[0];
      candidateCount = 1;
    } else if (sameBase.length === 1) {
      status = "candidate";
      method = "base_key_unique";
      confidence = "medium";
      donor = sameBase[0];
      candidateCount = 1;
    } else if (sameBaseFam.length > 1 || sameBase.length > 1) {
      status = "ambiguous";
      method = sameBaseFam.length > 1 ? "base_key_path_family_ambiguous" : "base_key_ambiguous";
      confidence = "review";
      candidateCount = sameBaseFam.length > 1 ? sameBaseFam.length : sameBase.length;
    }

    out.push({
      id: c.id || "",
      objectName: c.objectName || "",
      modelType: c.modelType || "",
      path: c.path || "",
      image: c.image || "",
      category: c.category || "",
      searchTags: c.searchTags || "",
      dimensionsSource: c.dimensionsSource || "",
      baseVariantKey: base,
      pathFamily: fam,
      candidateStatus: status,
      candidateMethod: method,
      candidateConfidence: confidence,
      candidateCount,
      donorId: donor ? donor.id || "" : "",
      donorObjectName: donor ? donor.objectName || "" : "",
      donorPath: donor ? donor.path || "" : "",
      donorImage: donor ? donor.image || "" : "",
      donorDimensionsVisual: donor ? donor.dimensionsVisual || null : null,
      notes:
        status === "ambiguous"
          ? "Multiple donor candidates. Manual review needed."
          : status === "no_candidate"
            ? "No raw p3d donor found by variant-base heuristics."
            : "Candidate generated by variant-base linking heuristics."
    });
  }

  out.sort((a, b) => a.objectName.localeCompare(b.objectName) || a.id.localeCompare(b.id));

  fs.mkdirSync(path.dirname(OUT_CSV), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2) + "\n");

  const headers = Object.keys(out[0] || {
    id: "", objectName: "", candidateStatus: "", candidateMethod: "", donorId: ""
  });
  const csv = [
    headers.join(","),
    ...out.map((row) => headers.map((h) => csvEscape(row[h])).join(","))
  ].join("\n") + "\n";
  fs.writeFileSync(OUT_CSV, csv);

  const stats = out.reduce((acc, r) => {
    acc.total += 1;
    acc[r.candidateStatus] = (acc[r.candidateStatus] || 0) + 1;
    return acc;
  }, { total: 0 });

  console.log("wrote", OUT_CSV);
  console.log("wrote", OUT_JSON);
  console.log("stats", stats);
}

main();


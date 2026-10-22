"use strict";

/**
 * Minimal CSV helpers — no dependencies.
 * Fields with commas/quotes/newlines are quoted per RFC 4180-ish rules.
 */

function escapeField(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(rows, columns) {
  const header = columns.map(escapeField).join(",");
  const body = rows.map((row) =>
    columns.map((col) => escapeField(row[col])).join(",")
  );
  return [header, ...body].join("\n") + "\n";
}

/**
 * Parse a simple CSV string into objects.
 * Handles quoted fields and "" escapes.
 */
function parseCsv(text) {
  const lines = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    const row = [];
    while (i < len) {
      let field = "";
      if (text[i] === '"') {
        i += 1;
        while (i < len) {
          if (text[i] === '"') {
            if (text[i + 1] === '"') {
              field += '"';
              i += 2;
            } else {
              i += 1;
              break;
            }
          } else {
            field += text[i];
            i += 1;
          }
        }
      } else {
        while (i < len && text[i] !== "," && text[i] !== "\n" && text[i] !== "\r") {
          field += text[i];
          i += 1;
        }
      }
      row.push(field);
      if (text[i] === ",") {
        i += 1;
        continue;
      }
      if (text[i] === "\r") i += 1;
      if (text[i] === "\n") i += 1;
      break;
    }
    if (row.length === 1 && row[0] === "" && i >= len) break;
    lines.push(row);
  }

  if (lines.length === 0) return [];
  const headers = lines[0];
  return lines.slice(1).filter((r) => r.some((c) => c !== "")).map((cells) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] !== undefined ? cells[idx] : "";
    });
    return obj;
  });
}

module.exports = { toCsv, parseCsv, escapeField };

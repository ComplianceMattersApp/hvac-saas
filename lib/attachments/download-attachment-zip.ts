"use client";

import { zipSync } from "fflate";

export type DownloadableAttachment = {
  fileName: string;
  signedUrl: string;
};

function uniqueFileName(fileName: string, used: Set<string>) {
  const clean = String(fileName || "attachment").replace(/[\\/:*?"<>|]/g, "_");
  if (!used.has(clean)) {
    used.add(clean);
    return clean;
  }
  const dot = clean.lastIndexOf(".");
  const stem = dot > 0 ? clean.slice(0, dot) : clean;
  const extension = dot > 0 ? clean.slice(dot) : "";
  let index = 2;
  while (used.has(`${stem} (${index})${extension}`)) index += 1;
  const unique = `${stem} (${index})${extension}`;
  used.add(unique);
  return unique;
}

export async function downloadAttachmentZip(items: DownloadableAttachment[], zipName: string) {
  if (!items.length) throw new Error("Select at least one downloadable attachment.");

  const usedNames = new Set<string>();
  const files: Record<string, Uint8Array> = {};
  await Promise.all(items.map(async (item) => {
    const response = await fetch(item.signedUrl);
    if (!response.ok) throw new Error(`Could not download ${item.fileName}.`);
    files[uniqueFileName(item.fileName, usedNames)] = new Uint8Array(await response.arrayBuffer());
  }));

  const zipped = zipSync(files);
  const browserBytes = new Uint8Array(zipped.byteLength);
  browserBytes.set(zipped);
  const blob = new Blob([browserBytes.buffer], { type: "application/zip" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = zipName.endsWith(".zip") ? zipName : `${zipName}.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

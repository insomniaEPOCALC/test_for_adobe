import { readFile, writeFile, mkdtemp } from "fs/promises";
import { execFile } from "node:child_process";
import * as cheerio from "cheerio";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TARGET_URL = "https://www.adobe.com/jp/legal/terms.html";
const DOCS_URL =
  "https://docs.google.com/document/d/1RDNaPbDWSFQyS8kv01GlFHN518UtE_d-Uy-h6nSgA40/edit";

export async function main() {
  const fetchedHtml = await readFile("adobe.txt", "utf8");

  const prevHtml = await readFile("text/latestAdobePolicy.txt", "utf8");

  if (fetchedHtml === prevHtml) {
    console.log("No changes detected.");
    return;
  }

  const afterMap = extractH3Sections(fetchedHtml);

  let beforeMap = new Map<string, string>();
  try {
    beforeMap = extractH3Sections(prevHtml);
  } catch {
    beforeMap = new Map<string, string>();
  }

  const changedIds = getChangedIds(beforeMap, afterMap);
  console.log("changedIds:" + changedIds);
  let $links: string[] = [];

  for (const id of changedIds) {
    $links.push(TARGET_URL + `#${id}`);
  }

  console.log("$links:" + $links);
  const diff = await buildSectionDiffs(changedIds, beforeMap, afterMap);

  console.log("diffText:" + diff);
  await sendGAS(diff);

  console.log("diff length:", diff.length);
  console.log("diff preview:", diff.slice(0, 500));

  const slackText =
    `❗️Adobe規約が更新されました\n` +
    `対象URL: ${TARGET_URL}\n` +
    `変更箇所:\n` +
    $links.map((url) => `- ${url}`).join("\n") +
    `\n\n差分ファイル:\n` +
    DOCS_URL;

  console.log("slackText:" + slackText);

  //await sendSlack(slackText);

  await writeFile("text/latestAdobePolicy.txt", fetchedHtml, "utf8");
}

export function extractH3Sections(html: string): Map<string, string> {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();

  const SEP = "\n\n@@H3@@";
  const END = "@@\n";

  $("h3[id]").each((_, el) => {
    const h3 = $(el);
    const id = h3.attr("id");
    if (!id) return;

    const heading = h3.text().trim().replace(/\s+/g, " ");
    h3.replaceWith(`${SEP}${id}@@${heading}${END}`);
  });

  const text = $("main")
    .text()
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const map = new Map<string, string>();
  const chunks = text
    .split(SEP)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    const firstLineEnd = chunk.indexOf("\n");
    const headerPart = (
      firstLineEnd >= 0 ? chunk.slice(0, firstLineEnd) : chunk
    ).trim();
    const bodyPart = (
      firstLineEnd >= 0 ? chunk.slice(firstLineEnd + 1) : ""
    ).trim();

    const m = headerPart.match(/^(.+?)@@(.+?)@@$/);
    if (!m) continue;

    const id = m[1].trim();
    const heading = m[2].trim();

    const body = [`# ${heading}`, bodyPart].filter(Boolean).join("\n\n").trim();

    map.set(id, body);
  }

  return map;
}

export function getChangedIds(
  before: Map<string, string>,
  after: Map<string, string>
): string[] {
  const all = new Set([...before.keys(), ...after.keys()]);
  const changed: string[] = [];

  for (const id of all) {
    const b = before.get(id);
    const a = after.get(id);

    if (b === undefined && a !== undefined) changed.push(id);
    else if (b !== undefined && a === undefined) changed.push(id);
    else if (b !== undefined && a !== undefined && b !== a) changed.push(id);
  }
  return changed;
}

export async function buildSectionDiffs(
  changedIds: string[],
  beforeMap: Map<string, string>,
  afterMap: Map<string, string>
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "adobe-"));

  const blocks: string[] = [];
  for (const id of changedIds) {
    const before = beforeMap.get(id) ?? "";
    const after = afterMap.get(id) ?? "";

    const beforePath = join(dir, `${id}.before.txt`);
    const afterPath = join(dir, `${id}.after.txt`);

    await writeFile(beforePath, before, "utf8");
    await writeFile(afterPath, after, "utf8");

    const diff = await gitDiff(beforePath, afterPath);

    blocks.push(`===== ${id} =====\n${diff.trim()}\n`);
  }

  return blocks.join("\n");
}

export function gitDiff(
  beforePath: string,
  afterPath: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      [
        "-c",
        "core.quotepath=false",
        "diff",
        "--no-index",
        "--color=never",
        "-U0",
        "--",
        beforePath,
        afterPath,
      ],
      (err, stdout, stderr) => {
        const code = (err as any)?.code;
        if (err && code !== 1) reject(stderr || err);
        else resolve(stdout);
      }
    );
  });
}

export async function sendGAS(payload: string) {
  const endpoint = process.env.GAS_WEBHOOK_URL;
  const secret = process.env.GAS_SHARED_SECRET;
  if (!endpoint) throw new Error("GAS_WEBHOOK_URL is missing");
  if (!secret) throw new Error("GAS_SHARED_SECRET is missing");

  const body = JSON.stringify({ secret, payload });
  const headers = { "Content-Type": "application/json" };

  const res1 = await fetch(endpoint, {
    method: "POST",
    headers,
    body,
    redirect: "manual",
  });

  if ([302, 303, 307, 308].includes(res1.status)) {
    const loc = res1.headers.get("location");
    if (!loc)
      throw new Error(`GAS redirect without Location (status=${res1.status})`);

    const res2 = await fetch(loc, {
      method: "POST",
      headers,
      body,
      redirect: "follow",
    });
    console.log("[GAS] status:", res2.status);
    console.log("[GAS] location:", res2.headers.get("location"));

    if (!res2.ok) {
      throw new Error(
        `GAS error after redirect: ${res2.status} ${await res2.text().catch(() => "")}`
      );
    }
    return;
  }

  if (!res1.ok) {
    throw new Error(
      `GAS error: ${res1.status} ${await res1.text().catch(() => "")}`
    );
  }
}

export async function sendSlack(text: string) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) throw new Error("SLACK_WEBHOOK_URL is missing");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok)
    throw new Error(
      `Slack error: ${res.status} ${await res.text().catch(() => "")}`
    );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

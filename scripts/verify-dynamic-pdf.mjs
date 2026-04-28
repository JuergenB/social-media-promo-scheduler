import { loadCreds, loginPuppeteerCookies } from "./lib/puppeteer-auth.mjs";
import { writeFile } from "node:fs/promises";

// End-to-end verifier for the dynamic-inner-slides PDF flow.
// Renders an LI carousel for N stories (where N is uneven so we exercise the
// orphan + subscribe cell), then an IG carousel of the same stories.
//
//   node scripts/verify-dynamic-pdf.mjs <numStories>

const N = Number(process.argv[2] ?? 5);
const BASE = "http://localhost:3025";
const HERO =
  "https://njhagrdezivhku5m.public.blob.vercel-storage.com/cover-generator/issue-76-lead.jpg";
const COLORS = ["333", "0a4", "a04", "04a", "707", "0aa", "a70", "707", "555"];
const stories = Array.from({ length: N }, (_, i) => ({
  title: `Story ${i + 1}`,
  imageUrl: `https://placehold.co/800x800/${COLORS[i % COLORS.length]}/fff.png?text=Story+${i + 1}`,
}));
const innerCount = Math.max(1, Math.ceil(N / 2));
const innerSlides = Array.from({ length: innerCount }, () => ({
  numeral: { fontSize: 245, dx: -29, dy: -48 },
  bgColor: null,
  bgLightness: 0,
  taglineFs: 50,
  logoLeft: true,
}));

const creds = loadCreds();
const cookies = await loginPuppeteerCookies(BASE, creds);
const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

async function downloadPdf(format) {
  const innerKeys = Array.from({ length: innerCount }, (_, i) => `i${i}`);
  const slides =
    format === "li" ? ["A", ...innerKeys] : ["A", ...innerKeys, "C"];
  const sp = new URLSearchParams();
  sp.set("slides", slides.join(","));
  sp.set("fmt", format);
  sp.set("hero", HERO);
  sp.set("subs", "theintersect.art");
  sp.set("n", "75");
  sp.set("dt", "APRIL 28, 2026");
  sp.set("br", "THE INTERSECT");
  sp.set("bln", "The Intersect");
  sp.set("tg", "Wrenches, paper, waste — organic holds its ground.");
  sp.set("sp", JSON.stringify(stories));
  sp.set("is", JSON.stringify(innerSlides));
  sp.set("ax", "50");
  sp.set("ay", "50");
  sp.set("az", "1");
  sp.set("bl", "0");
  sp.set("bb", "0");
  sp.set("cx", "50");
  sp.set("cy", "50");
  sp.set("cz", "1");
  sp.set("tafs", "52");
  sp.set("tcfs", "56");
  sp.set("s1nl", "1");
  sp.set("s1no", "18");

  const url = `${BASE}/api/tools/download-pdf?${sp.toString()}`;
  console.log(`\n=== ${format.toUpperCase()} (${N} stories → ${slides.length} slides: ${slides.join(",")}) ===`);
  console.log(`fetching… (~${slides.length * 5}s)`);
  const start = Date.now();
  const resp = await fetch(url, { headers: { Cookie: cookieHeader } });
  console.log(`status: ${resp.status} in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  if (!resp.ok) {
    console.log(`error body: ${(await resp.text()).slice(0, 400)}`);
    return;
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  const out = `/tmp/dynamic-${format}-${N}story.pdf`;
  await writeFile(out, buf);
  console.log(`saved: ${out} (${(buf.length / 1024).toFixed(0)} KB)`);
}

await downloadPdf("li");
await downloadPdf("ig");

// Photograph the printed cards the table needs from the site's own /card
// page, so the render carries what gets printed: each mission card a player
// holds (by its place in the printed pile, state.json's `card`), both piles'
// backs and both faces of the player card. Writes cad/shots/table/cards/.
//
//   timeout 1800 yarn dev &        # the UI on :5173 (no server, no Redis)
//   cd cad && timeout 600 node scripts/table/cards.mjs [--url=http://localhost:5173] [--state=<file>]
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const OUT = join(import.meta.dirname, "../../shots/table");
const CARDS = join(OUT, "cards");
const url = process.argv.find((a) => a.startsWith("--url="))?.split("=")[1] ?? "http://localhost:5173";
const stateFile = process.argv.find((a) => a.startsWith("--state="))?.split("=")[1] ?? join(OUT, "state.json");
const state = JSON.parse(readFileSync(stateFile, "utf8"));
const wanted = [...new Set(state.players.flatMap((p) => p.missions.map((m) => m.card)))];
mkdirSync(CARDS, { recursive: true });

const browser = await chromium.launch();
try {
  // 5x: a 63 mm card is about 1190 px across, the 70 mm player card about 1320.
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 5 });
  page.on("pageerror", (e) => console.error("page:", e.message));
  await page.goto(`${url}/card`, { waitUntil: "networkidle" });
  // Every card at true size, without the screen's outline round a back.
  await page.addStyleTag({
    content: `.di-mc-row { --mc-zoom: 1 !important; } .di-cards { --card-zoom: 1 !important; }
      .di-mc-row .di-mc-back { outline: none !important; }`,
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  const shoot = async (selector, name) => {
    const el = page.locator(selector).first();
    await el.scrollIntoViewIfNeeded();
    await el.screenshot({ path: join(CARDS, `${name}.png`), animations: "disabled" });
    console.log(join(CARDS, `${name}.png`));
  };
  for (const id of wanted) await shoot(`.di-mc-row .di-mc-card[data-card="${id}"]`, id);
  // Each pile's row opens with its back.
  const rows = page.locator(".di-mc-row");
  for (const [i, pile] of [
    [0, "primary"],
    [1, "secondary"],
  ]) {
    const back = rows.nth(i).locator(".di-mc-back").first();
    await back.scrollIntoViewIfNeeded();
    await back.screenshot({ path: join(CARDS, `back-${pile}.png`) });
    console.log(join(CARDS, `back-${pile}.png`));
  }
  // The player card: "your turn", then "the fight".
  const faces = page.locator(".di-cards .di-card");
  for (const [i, name] of [
    [0, "turn-front"],
    [1, "turn-back"],
  ]) {
    await faces.nth(i).scrollIntoViewIfNeeded();
    await faces.nth(i).screenshot({ path: join(CARDS, `${name}.png`) });
    console.log(join(CARDS, `${name}.png`));
  }
} finally {
  await browser.close();
}

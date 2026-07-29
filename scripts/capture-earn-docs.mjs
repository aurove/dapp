/**
 * Capture Earn docs screenshots against a local dapp + Hardhat node.
 *
 * Prerequisites:
 *   - Hardhat on :8545 with seeded balances for Hardhat #0
 *   - Dapp with NEXT_PUBLIC_APP_ENV=local on E2E_BASE_URL (default :3001)
 *   - NEXT_PUBLIC_BURNER_PRIVATE_KEY = Hardhat #0
 *
 * Usage (from dapp/):
 *   node scripts/capture-earn-docs.mjs
 */
import { chromium } from "playwright";
import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dappRoot = path.resolve(__dirname, "..");
const monorepoRoot = path.resolve(dappRoot, "..");
const outDir = path.join(dappRoot, "public/docs/earn-flows");
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3001";
const VIEWPORT = { width: 1440, height: 900 };

async function ensureOut() {
  await mkdir(outDir, { recursive: true });
}

async function shot(page, name, clip) {
  const file = path.join(outDir, `${name}.png`);
  if (clip) {
    await page.screenshot({ path: file, clip });
  } else {
    await page.screenshot({ path: file, fullPage: false });
  }
  console.log("saved", name);
  return file;
}

async function connectBurner(page) {
  // Seed burner key before connect
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        "burnerWallet.pk",
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      );
    } catch {
      /* ignore */
    }
  });

  await page.goto(`${baseURL}/earn`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(1500);

  const connected = page.getByRole("button", { name: /0x|sign in|wrong network/i }).first();
  if (await connected.isVisible().catch(() => false)) {
    console.log("already connected-ish");
    return;
  }

  const connect = page.getByRole("button", { name: /connect wallet/i }).first();
  await connect.waitFor({ state: "visible", timeout: 30_000 });
  await connect.click();
  await page.getByText(/connect a wallet/i).waitFor({ state: "visible", timeout: 15_000 });

  const burner = page
    .getByRole("button", { name: /burner wallet/i })
    .or(page.getByText(/^Burner Wallet$/i))
    .first();
  await burner.waitFor({ state: "visible", timeout: 15_000 });
  await burner.click();
  await page.waitForTimeout(2500);
  console.log("burner connected");
}

function moveTime(args) {
  console.log("moveTime", args);
  // Pass flags directly to ops (no extra `--` — the CLI rejects it).
  execSync(`pnpm run ops localhost move-time ${args}`, {
    cwd: monorepoRoot,
    stdio: "inherit",
  });
}

async function cropBySelector(page, name, selector) {
  const loc = page.locator(selector).first();
  await loc.waitFor({ state: "visible", timeout: 20_000 });
  const box = await loc.boundingBox();
  if (!box) {
    await shot(page, name);
    return;
  }
  // pad a bit inside viewport
  const clip = {
    x: Math.max(0, box.x - 8),
    y: Math.max(0, box.y - 8),
    width: Math.min(VIEWPORT.width - box.x + 8, box.width + 16),
    height: Math.min(VIEWPORT.height - box.y + 8, box.height + 16),
  };
  await shot(page, name, clip);
}

async function main() {
  await ensureOut();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    await connectBurner(page);
    await page.goto(`${baseURL}/earn`, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForTimeout(3000);

    // 01 overview (full viewport)
    await shot(page, "01-earn-overview");

    // 02 Create Position — Deposit position (default)
    await cropBySelector(page, "02-create-deposit-position", "text=Create Position");
    // Prefer card containing Create Position heading
    const createCard = page.locator("text=Create Position").locator("xpath=ancestor::div[contains(@class,'rounded')][1]").first();
    if (await createCard.count()) {
      const box = await createCard.boundingBox();
      if (box) await shot(page, "02-create-deposit-position", box);
    }

    // 03 Lock tokens mode BTC
    const lockTab = page.getByRole("button", { name: /lock tokens/i }).first();
    if (await lockTab.isVisible().catch(() => false)) {
      await lockTab.click();
      await page.waitForTimeout(800);
      const amount = page.getByPlaceholder(/0\.0|amount/i).or(page.locator('input[type="text"], input[inputmode="decimal"]')).first();
      if (await amount.isVisible().catch(() => false)) {
        await amount.fill("0.01");
      }
      await page.waitForTimeout(500);
      // re-crop create card
      const card = page.locator("text=Create Position").locator("xpath=ancestor::*[contains(@class,'rounded')][1]").first();
      const box = await card.boundingBox().catch(() => null);
      if (box) await shot(page, "03-create-lock-tokens-btc", box);
      else await shot(page, "03-create-lock-tokens-btc");
    }

    // 04 MEZO variant
    const mezoBtn = page.getByRole("button", { name: /^MEZO$/i }).first();
    if (await mezoBtn.isVisible().catch(() => false)) {
      await mezoBtn.click();
      await page.waitForTimeout(800);
      const card = page.locator("text=Create Position").locator("xpath=ancestor::*[contains(@class,'rounded')][1]").first();
      const box = await card.boundingBox().catch(() => null);
      if (box) await shot(page, "04-create-lock-tokens-mezo", box);
      else await shot(page, "04-create-lock-tokens-mezo");
    }

    // Switch back to BTC lock and submit deposit for liquid position screenshots
    const btcBtn = page.getByRole("button", { name: /^BTC$/i }).first();
    if (await btcBtn.isVisible().catch(() => false)) await btcBtn.click();
    await page.waitForTimeout(500);
    if (await lockTab.isVisible().catch(() => false)) await lockTab.click();
    await page.waitForTimeout(400);
    const amountInput = page.locator('input').filter({ hasNot: page.locator('[type=hidden]') }).first();
    // Find amount field near Create a liquid position
    const createCta = page.getByRole("button", { name: /create a liquid position|approve|deposit/i }).first();
    // fill last visible number-like input in create card
    const inputs = page.locator("aside input, [class*='Create'] input, input");
    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
      const el = inputs.nth(i);
      if (await el.isVisible().catch(() => false)) {
        const type = await el.getAttribute("type");
        if (type === "hidden" || type === "checkbox" || type === "radio") continue;
        await el.fill("0.05").catch(() => undefined);
        break;
      }
    }
    await page.waitForTimeout(800);

    if (await createCta.isVisible().catch(() => false)) {
      await createCta.click();
      // may need approve then create — click through a few times
      for (let i = 0; i < 4; i++) {
        await page.waitForTimeout(2500);
        const next = page.getByRole("button", {
          name: /create a liquid position|approve|confirm|deposit|continue/i,
        }).first();
        if (await next.isEnabled().catch(() => false)) {
          await next.click().catch(() => undefined);
        }
      }
      await page.waitForTimeout(4000);
    }

    // Refresh earn
    const refresh = page.getByRole("button", { name: /^refresh$/i }).first();
    if (await refresh.isVisible().catch(() => false)) await refresh.click();
    await page.waitForTimeout(2500);
    await shot(page, "05-earn-with-position");

    // Liquid positions section
    const liq = page.getByText(/Your Liquid Positions/i).first();
    if (await liq.isVisible().catch(() => false)) {
      await liq.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await shot(page, "06-liquid-positions");
    }

    // Claimables + gauges
    const claimables = page.getByText(/^Claimables$/i).first();
    if (await claimables.isVisible().catch(() => false)) {
      await claimables.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await shot(page, "07-claimables-gauges");
    }

    // Move time into settlement window: next epoch start + 10 hours
    moveTime("--epochs 1 --hours 10");
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    if (await refresh.isVisible().catch(() => false)) await refresh.click();
    await page.waitForTimeout(2000);

    const positionsHeader = page.getByText(/Your Liquid Positions/i).first();
    if (await positionsHeader.isVisible().catch(() => false)) {
      await positionsHeader.scrollIntoViewIfNeeded();
    }
    await shot(page, "08-settlement-window-redeem");

    // Outside settlement: + 7 days from now-ish (1 more epoch)
    moveTime("--epochs 1");
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    if (await positionsHeader.isVisible().catch(() => false)) {
      await positionsHeader.scrollIntoViewIfNeeded();
    }
    await shot(page, "09-await-redemption-window");

    console.log("done →", outDir);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

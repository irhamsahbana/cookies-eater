import puppeteer, { Browser, Page, ElementHandle, Frame } from 'puppeteer';
import 'dotenv/config';
import { selectors } from './selectors';

export const loginToWeb = async (
  opts?: { email?: string; password?: string; companyId?: string; url?: string }
): Promise<any[]> => {
  const IS_HEADLESS = process.env.ENVIRONMENT === 'PRODUCTION';
  const EMAIL = opts?.email ?? process.env.EMAIL ?? '';
  const PASSWORD = opts?.password ?? process.env.PASSWORD ?? '';
  const COMPANY_ID = opts?.companyId ?? process.env.COMPANY_ID ?? '';


  if (!EMAIL || !PASSWORD || !COMPANY_ID) {
    throw new Error('❌ EMAIL, PASSWORD, or COMPANY_ID not set in environment variables');
  }

  console.log('🚀 Launching browser...');

  const browser = await puppeteer.launch({
    headless: IS_HEADLESS,
    args: ["--no-sandbox"],
    executablePath: puppeteer.executablePath(),
  });
  console.log('🚀 Browser launched.');

  console.log('Opening login page...');
  const page = await browser.newPage();
  await page.setDefaultTimeout(20000);
  await page.setDefaultNavigationTimeout(20000);

  const URL = opts?.url ?? process.env.WEB_URL ?? ''
  console.log(`🚀 Navigating to ${URL}...`);

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  console.log('✅ Login page opened.');
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
  await waitForLoginForm(page, 20000).catch(() => {});

  const invalidSession = await page.evaluate(() => {
    const t = (document.body?.innerText || '').toLowerCase();
    return t.includes('invalid session') || t.includes('session is invalid or expired');
  });
  if (invalidSession) {
    const clicked = await clickByTextAcrossFrames(page, /kembali/i, ['button', 'a']).catch(() => false);
    if (clicked) {
      try {
        await page.waitForNavigation({ timeout: 30000 });
      } catch {}
    } else {
      throw new Error('❌ Cronus session invalid or expired');
    }
  }

  const [emailEl, passwordEl] = await Promise.all([
    findInFrames(page, selectors.emailInput, 2000),
    findInFrames(page, selectors.passwordInput, 2000),
  ]);
  console.log('⌨️ Typing email...');
  await typeHandle(page, emailEl, EMAIL);

  let companyEl = await findInFrames(page, selectors.companyIdInput, 1500).catch(() => null);
  if (!companyEl) {
    companyEl = await findInputByLabelAcrossFrames(page, /company\s*id/i, 2000).catch(() => null);
  }
  if (companyEl) {
    await typeHandle(page, companyEl, COMPANY_ID);
  }

  console.log('🔒 Typing password...');
  if (passwordEl) {
    await typeHandle(page, passwordEl, PASSWORD);
  }

  let submitAfterPassword = await findInFrames(page, selectors.submitButton, 1000).catch(() => null);
  if (!submitAfterPassword) {
    submitAfterPassword = await findLoginButtonAcrossFrames(page, 1000).catch(() => null);
    if (!submitAfterPassword) {
      const clicked = await clickByTextAcrossFrames(page, /(login|masuk)/i, ['button']).catch(() => false);
      if (!clicked) {
        submitAfterPassword = await findAnyVisibleButtonAcrossFrames(page, 1500).catch(() => null);
      }
    }
  }
  let beforeCookiesLen = 0;
  if (submitAfterPassword) {
    await waitButtonEnabled(submitAfterPassword, 300).catch(() => {});
    beforeCookiesLen = (await browser.defaultBrowserContext().cookies()).length;
    try {
      await waitClickable(submitAfterPassword, 300);
      await robustClick(page, submitAfterPassword);
    } catch {
      if (passwordEl) {
        try {
          await passwordEl.focus();
          await (passwordEl as any).press?.('Enter');
        } catch {
          await page.keyboard.press('Enter');
        }
      } else {
        await page.keyboard.press('Enter');
      }
      try {
        await submitFormAcrossFrames(page, 4000);
      } catch {}
    }
  }

  console.log('⏳ Waiting for navigation after login...');
  console.log('✅ Login flow completed.');
  await waitCookiesChanged(browser, beforeCookiesLen, 3000).catch(() => {});

  const savedCookies = await getFormattedCookies(browser);

  // close browser
  await browser.close();

  return savedCookies;
};

const findInFrames = async (
  page: Page,
  selector: string,
  timeout = 30000,
): Promise<ElementHandle<Element>> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const frames = page.frames();
    for (const frame of frames) {
      const el = await frame.$(selector);
      if (el) return el as ElementHandle<Element>;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Selector not found across frames: ${selector}`);
};

const hasInFrames = async (page: Page, selector: string): Promise<boolean> => {
  const frames = page.frames();
  for (const frame of frames) {
    try {
      const el = await frame.$(selector);
      if (el) return true;
    } catch {}
  }
  return false;
};

const waitForLoginForm = async (page: Page, timeout = 20000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const hostOk = await page.evaluate(() => location.hostname.includes('cronus.edot-dev.com'));
      const emailOk = await hasInFrames(page, selectors.emailInput);
      const passOk = await hasInFrames(page, selectors.passwordInput);
      if ((hostOk || emailOk) && passOk) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
};

const typeHandle = async (page: Page, handle: ElementHandle<Element>, text: string) => {
  await handle.focus();
  await handle.click({ clickCount: 3 });
  try {
    const isMac = process.platform === 'darwin';
    await page.keyboard.down(isMac ? 'Meta' : 'Control');
    await page.keyboard.press('A');
    await page.keyboard.up(isMac ? 'Meta' : 'Control');
    await page.keyboard.press('Backspace');
  } catch {}
  await handle.type(text, { delay: 0 });
  await handle.evaluate((el) => {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  });
};

const clickByTextAcrossFrames = async (
  page: Page,
  pattern: RegExp,
  tags: string[] = ['button', 'a']
): Promise<boolean> => {
  const frames = page.frames();
  for (const frame of frames) {
    for (const tag of tags) {
      const elements = await frame.$$(tag);
      for (const el of elements) {
        const txt = await frame.evaluate((e) => e.textContent || '', el);
        if (pattern.test((txt || '').trim())) {
          await el.click();
          return true;
        }
      }
    }
  }
  return false;
};

const findInputByLabelAcrossFrames = async (
  page: Page,
  labelPattern: RegExp,
  timeout = 8000,
): Promise<ElementHandle<Element>> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const frames = page.frames();
    for (const frame of frames) {
      let handle: any = null;
      try {
        handle = await frame.evaluateHandle((patternSource) => {
          const re = new RegExp(patternSource, 'i');
          const labels = Array.from(document.querySelectorAll('label'));
          for (const label of labels) {
            const txt = (label.textContent || '').trim();
            if (re.test(txt)) {
              const container = label.parentElement;
              const candidate = container?.querySelector('input') || container?.parentElement?.querySelector('input') || null;
              if (candidate) return candidate;
            }
          }
          return null;
        }, labelPattern.source);
      } catch {
        handle = null;
      }
      const el = handle.asElement();
      if (el) return el as ElementHandle<Element>;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Input not found for label');
};

const findAnyVisibleButtonAcrossFrames = async (
  page: Page,
  timeout = 5000,
): Promise<ElementHandle<Element>> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const frames = page.frames();
    for (const frame of frames) {
      const buttons = await frame.$$('button');
      if (buttons.length) return buttons[buttons.length - 1] as ElementHandle<Element>;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('No button found');
};

const waitButtonEnabled = async (
  button: ElementHandle<Element>,
  timeout = 8000,
) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const enabled = await button.evaluate((el) => {
      const btn = el as HTMLButtonElement;
      return !btn.disabled && !el.hasAttribute('disabled');
    });
    if (enabled) return;
    await new Promise((r) => setTimeout(r, 100));
  }
};

const findLoginButtonAcrossFrames = async (
  page: Page,
  timeout = 8000,
): Promise<ElementHandle<Element>> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const frames = page.frames();
    for (const frame of frames) {
      const buttons = await frame.$$('button');
      for (const b of buttons) {
        const txt = await frame.evaluate((e) => (e.textContent || '').trim().toLowerCase(), b);
        if (txt.includes('login') || txt.includes('masuk')) {
          return b as ElementHandle<Element>;
        }
      }
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Login button not found');
};

const waitCookiesChanged = async (
  browser: Browser,
  previousCount: number,
  timeout = 3000,
) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const cookies = await browser.defaultBrowserContext().cookies();
    if (cookies.length > previousCount) return;
    await new Promise((r) => setTimeout(r, 150));
  }
};

const waitClickable = async (
  handle: ElementHandle<Element>,
  timeout = 2000,
) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const ok = await handle.evaluate((el) => {
      const he = el as HTMLElement;
      const style = window.getComputedStyle(he);
      const ariaDisabled = he.getAttribute('aria-disabled') === 'true';
      const disabled = (he as any).disabled === true || he.hasAttribute('disabled');
      const visible = style && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      const pe = style.pointerEvents !== 'none';
      return visible && pe && !disabled && !ariaDisabled;
    });
    const box = await handle.boundingBox();
    if (ok && box) return;
    await new Promise((r) => setTimeout(r, 100));
  }
};

const robustClick = async (page: Page, handle: ElementHandle<Element>) => {
  try {
    await handle.click();
    return;
  } catch {}
  try {
    await handle.evaluate((el) => {
      (el as HTMLElement).scrollIntoView({ block: 'center', inline: 'center' });
    });
    await handle.evaluate((el) => (el as HTMLElement).click());
    return;
  } catch {}
  const box = await handle.boundingBox();
  if (box) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    return;
  }
  await handle.evaluate((el) => (el as HTMLElement).click());
};

const submitFormAcrossFrames = async (
  page: Page,
  timeout = 4000,
) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const frames = page.frames();
    for (const frame of frames) {
      const ok = await frame.evaluate(() => {
        const forms = Array.from(document.querySelectorAll('form')) as HTMLFormElement[];
        for (const f of forms) {
          if (f.action.includes('/oidc/interaction-employee')) {
            if ((f as any).requestSubmit) (f as any).requestSubmit();
            else f.submit();
            return true;
          }
        }
        const first = forms[0];
        if (first) {
          if ((first as any).requestSubmit) (first as any).requestSubmit();
          else first.submit();
          return true;
        }
        return false;
      });
      if (ok) return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
};

const getFormattedCookies = async (browser: Browser): Promise<any[]> => {
  const cookies = await browser.defaultBrowserContext().cookies();

  const formattedCookies = cookies.map((cookie) => ({
    domain: cookie.domain,
    expirationDate: cookie.expires ?? undefined,
    hostOnly: !cookie.domain.startsWith('.'),
    httpOnly: cookie.httpOnly,
    name: cookie.name,
    path: cookie.path,
    sameSite: cookie.sameSite?.toLowerCase() ?? null,
    secure: cookie.secure,
    session: !cookie.expires,
    storeId: null,
    value: cookie.value,
  }));

  return formattedCookies;
};

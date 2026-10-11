import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { parse, serialize, defaultTreeAdapter as tree } from "parse5";
import { buildDemoHtml } from "../../scripts/build/demo-html.mjs";

test("demo HTML removes source execution before the browser parses it, independently of CSP", async () => {
  // This input becomes an executable img handler only after serialization.
  // It must fail at the build boundary, before any browser receives the page.
  assert.throws(() => buildDemoHtml(
    '<math><mtext><table><mglyph><style><img src=x onerror=window.unexpected=true></style>'
  ), /Demo HTML is unstable when reparsed/);
  const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "chrome" } : {}) });
  try {
    for (const withCsp of [true, false]) {
      const document = parse(buildDemoHtml(`<!doctype html><html><head>
        <scr<link rel="icon">ipt src="/unexpected.js"></script>
        <script>window.unexpected = true</script >
        </head><body>
        <button id="check" onclick='window.unexpected=true' onfocus=window.unexpected=true>Check</button>
        <svg onload=window.unexpected=true><script>window.unexpected=true</script><circle r="1"></circle></svg>
        <template id="fragment"><script src="/unexpected.js"></script><button onpointerenter=window.unexpected=true>Template</button></template>
        <iframe srcdoc="&lt;script&gt;parent.unexpected=true&lt;/script&gt;"></iframe>
        </body></html>`));
      const head = document.childNodes.find(node => node.tagName === "html").childNodes.find(node => node.tagName === "head");
      if (!withCsp) tree.detachNode(head.childNodes[0]);
      const page = await browser.newPage();
      const requests = [];
      const violations = [];
      page.on("console", message => { if (message.type() === "error") violations.push(message.text()); });
      await page.route("**/*", async route => {
        const pathname = new URL(route.request().url()).pathname;
        requests.push(pathname);
        if (pathname === "/demo.js") return route.fulfill({ contentType: "text/javascript", body: "window.demoBootstrapExecuted = true;" });
        if (pathname === "/security.html") return route.fulfill({ contentType: "text/html", body: serialize(document) });
        if (pathname.endsWith(".css")) return route.fulfill({ contentType: "text/css", body: "" });
        return route.abort();
      });
      await page.goto("http://demo.test/security.html");
      await page.waitForFunction(() => window.demoBootstrapExecuted === true);
      await page.locator("#check").focus();
      await page.locator("#check").click();
      await page.evaluate(() => document.body.append(document.getElementById("fragment").content.cloneNode(true)));
      assert.equal(await page.evaluate(() => window.unexpected), undefined, `CSP enabled: ${withCsp}`);
      assert.deepEqual(await page.locator("script").evaluateAll(elements => elements.map(node => node.getAttribute("src"))), ["./demo.js"]);
      assert.equal(requests.includes("/unexpected.js"), false);
      assert.deepEqual(violations, []);
      await page.close();
    }
  } finally { await browser.close(); }
});

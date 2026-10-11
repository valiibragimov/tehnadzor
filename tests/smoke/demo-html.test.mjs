import assert from "node:assert/strict";
import test from "node:test";
import { parse } from "parse5";
import { buildDemoHtml } from "../../scripts/build/demo-html.mjs";

function nodes(parent) {
  return [parent, ...(parent.childNodes || []).flatMap(nodes), ...(parent.content ? nodes(parent.content) : [])];
}

const attr = (node, name) => node.attrs?.find(value => value.name === name)?.value;
const payloads = [
  '<script>unexpected()</script ><SCRIPT SRC="/unexpected.js"></SCRIPT>',
  '<scr<script></script>ipt>unexpected()</scr<script></script>ipt>',
  '<scr<link rel="icon">ipt src="/unexpected.js"></script>',
  '<button OnClick = "unexpected()" onfocus=unexpected() onpointerenter=unexpected() onkeydown=unexpected()>Check</button>',
  "<img src=x onerror='unexpected()'><svg onload=unexpected()><script>unexpected()</script><circle cx=1 cy=1 r=1 /></svg>",
  '<template><script src="/unexpected.js"></script><button onclick=unexpected()>Check</button><template><svg onload=unexpected()></svg></template></template>',
  '<iframe srcdoc="&lt;script&gt;unexpected()&lt;/script&gt;"></iframe><object data="/unexpected.html"></object><embed src="/unexpected.html">',
  '<!-- <script> --><button onclick=unexpected()>Check</button><!-- </script> -->'
];

test("demo HTML transformation removes executable source nodes without creating new ones", () => {
  for (const payload of payloads) {
    const output = buildDemoHtml(`<!doctype html><html><head></head><body>${payload}</body></html>`);
    // Reparse serialized output: security must hold in the document the browser
    // receives, including template contents and foreign namespaces.
    const all = nodes(parse(output));
    const scripts = all.filter(node => node.tagName?.toLowerCase() === "script");
    assert.equal(scripts.length, 1, payload);
    assert.equal(attr(scripts[0], "src"), "./demo.js", payload);
    assert.equal(attr(scripts[0], "type"), "module", payload);
    assert.equal(scripts[0].childNodes.length, 0, payload);
    assert.deepEqual(all.flatMap(node => node.attrs || []).filter(value => value.name.toLowerCase().startsWith("on") || value.name === "srcdoc"), [], payload);
    assert.equal(all.some(node => ["iframe", "object", "embed", "base"].includes(node.tagName)), false, payload);
  }
});

test("demo HTML installs its own policy and only known local styles independently of source formatting", () => {
  const output = buildDemoHtml(`<html lang='en' class='theme-light keep'><head>
    <base href="https://unexpected.invalid/">
    <meta http-equiv="refresh" content="0;url=https://unexpected.invalid/">
    <meta http-equiv="Content-Security-Policy" content="script-src * 'unsafe-inline'">
    <meta name="robots" content="index">
    <link REL='stylesheet' HREF='https://unexpected.invalid/font.css'>
    <link rel="manifest" href="manifest.json"><title>Old title</title>
    </head><body class='home-page theme-light'></body></html>`);
  const all = nodes(parse(output));
  const head = all.find(node => node.tagName === "head");
  assert.equal(attr(head.childNodes[0], "http-equiv"), "Content-Security-Policy");
  const policies = all.filter(node => node.tagName === "meta" && attr(node, "http-equiv"));
  assert.equal(policies.length, 1);
  assert.ok(attr(policies[0], "content").includes("script-src 'self' 'wasm-unsafe-eval'"));
  assert.ok(attr(policies[0], "content").includes("base-uri 'none'"));
  assert.deepEqual(all.filter(node => node.tagName === "link").map(node => attr(node, "href")), [
    "data:,", "./style.css", "./liquid-glass.css", "./modules/summary/analytics-block.css"
  ]);
  assert.equal(attr(all.find(node => node.tagName === "html"), "class"), "keep theme-dark");
  assert.equal(attr(all.find(node => node.tagName === "body"), "class"), "home-page theme-dark");
  assert.equal(attr(all.find(node => node.tagName === "html"), "lang"), "ru");
});

test("demo HTML rejects namespace mutations that turn raw text into executable attributes", () => {
  assert.throws(() => buildDemoHtml(
    '<math><mtext><table><mglyph><style><img src=x onerror=window.unexpected=true></style>'
  ), /Demo HTML is unstable when reparsed/);
});

test("demo HTML preserves form data, text escaping, accessible labels and SVG structure", () => {
  const output = buildDemoHtml(`<html><head></head><body>
    <label for="value">X &lt; Y &amp; H</label><input id="value" value="&quot; onfocus=unexpected()">
    <button id="geo" data-target="geo" aria-label="Survey">Check</button>
    <svg viewBox="0 0 24 24"><path d="M0 0 L24 24"></path></svg>
    </body></html>`);
  const all = nodes(parse(output));
  assert.equal(attr(all.find(node => node.tagName === "input"), "value"), '" onfocus=unexpected()');
  assert.equal(attr(all.find(node => node.tagName === "label"), "for"), "value");
  assert.equal(all.find(node => node.tagName === "label").childNodes[0].value, "X < Y & H");
  assert.equal(attr(all.find(node => node.tagName === "button"), "data-target"), "geo");
  assert.equal(attr(all.find(node => node.tagName === "button"), "aria-label"), "Survey");
  assert.equal(all.find(node => node.tagName === "path").namespaceURI, "http://www.w3.org/2000/svg");
  assert.equal(attr(all.find(node => node.tagName === "svg"), "viewBox"), "0 0 24 24");
});

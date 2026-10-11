import { parse, serialize, defaultTreeAdapter as tree } from "parse5";

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const DEMO_CSP = "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'wasm-unsafe-eval'; base-uri 'none'; form-action 'self'; object-src 'none'";
const STYLESHEETS = ["./style.css", "./liquid-glass.css", "./modules/summary/analytics-block.css"];

function element(tag, attributes = {}) {
  return tree.createElement(tag, HTML_NAMESPACE, Object.entries(attributes).map(([name, value]) => ({ name, value })));
}

function attribute(node, name) {
  return node.attrs?.find(attr => attr.name === name)?.value;
}

function setAttribute(node, name, value) {
  node.attrs = node.attrs.filter(attr => attr.name !== name);
  node.attrs.push({ name, value });
}

function useDarkTheme(node) {
  const classes = (attribute(node, "class") || "").split(/\s+/).filter(value => value && value !== "theme-light" && value !== "theme-dark");
  setAttribute(node, "class", [...classes, "theme-dark"].join(" "));
}

// Transforms our repository-owned page, not arbitrary user HTML. Parse before
// deleting nodes so removal cannot manufacture tags or executable attributes.
export function buildDemoHtml(source) {
  const document = parse(source);
  function transform(parent) {
    for (const node of [...(parent.childNodes || [])]) {
      const tag = node.tagName?.toLowerCase();
      if (["script", "link", "base", "iframe", "object", "embed"].includes(tag) ||
          (tag === "meta" && (attribute(node, "http-equiv") !== undefined || attribute(node, "name")?.toLowerCase() === "robots"))) {
        tree.detachNode(node);
        continue;
      }
      if (node.attrs) {
        node.attrs = node.attrs.filter(attr => !attr.name.toLowerCase().startsWith("on") && attr.name !== "srcdoc");
      }
      transform(node);
      if (node.content) transform(node.content);
    }
  }
  transform(document);
  const html = document.childNodes.find(node => node.tagName === "html");
  const head = html.childNodes.find(node => node.tagName === "head");
  const body = html.childNodes.find(node => node.tagName === "body");
  setAttribute(html, "lang", "ru");
  useDarkTheme(html);
  useDarkTheme(body);

  // Place policy before source resources, even when the source has no viewport.
  const policy = element("meta", { "http-equiv": "Content-Security-Policy", content: DEMO_CSP });
  if (head.childNodes.length) tree.insertBefore(head, policy, head.childNodes[0]);
  else tree.appendChild(head, policy);
  for (const node of [...head.childNodes]) {
    if (node.tagName === "title") tree.detachNode(node);
  }
  const title = element("title");
  tree.insertText(title, "Интерактивная демонстрация Tehnadzor");
  tree.appendChild(head, title);
  tree.appendChild(head, element("meta", { name: "robots", content: "noindex,nofollow" }));
  tree.appendChild(head, element("link", { rel: "icon", href: "data:," }));
  for (const href of STYLESHEETS) tree.appendChild(head, element("link", { rel: "stylesheet", href }));
  tree.appendChild(body, element("script", { type: "module", src: "./demo.js" }));
  const output = serialize(document);
  // Foreign-content foster parenting can turn raw text into active markup on
  // reparsing. Never emit a document whose tree changes across this boundary.
  if (serialize(parse(output)) !== output) {
    throw new Error("Demo HTML is unstable when reparsed; fix the source markup.");
  }
  return output;
}

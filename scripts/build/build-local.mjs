import { build } from "esbuild";
import { parse, serialize, defaultTreeAdapter as tree } from "parse5";
import { mkdir, readFile, writeFile, cp, access } from "node:fs/promises";
import { resolve } from "node:path";
import { readIndexHtmlSource } from "./index-html-source.mjs";

const root = process.cwd();
const output = resolve(root, "dist-local");
await mkdir(output, { recursive: true });
const entries = {};
for (const page of ["index", "login", "profile"]) {
  const source = page === "index" ? await readIndexHtmlSource(root) : await readFile(`${page}.html`, "utf8");
  const document = parse(source);
  let count = 0;
  function visit(parent) {
    parent.childNodes = (parent.childNodes || []).filter(node => {
      const attr = name => node.attrs?.find(item => item.name === name)?.value;
      if (node.tagName === "link" && /^(https?:)?\/\//.test(attr("href") || "")) return false;
      if (node.tagName === "link" && attr("rel") === "manifest") return false;
      if (node.tagName === "link" && (attr("href") || "").startsWith("dist/modules/")) node.attrs.find(item => item.name === "href").value = attr("href").slice(5);
      if (node.tagName === "script") {
        const src = attr("src");
        const text = (node.childNodes || []).map(child => child.value || "").join("");
        if (src === "dist/liquid-glass.js") return false;
        if (text.includes("serviceWorker") || (src && /^(https?:)?\/\//.test(src))) return false;
        const name = `${page}-${count++}`;
        entries[name] = src
          ? { entryPoint: resolve(root, src.replace(/^\.\//, "").replace(/^dist\//, "src/client/").replace(/\.js$/, ".ts")), out: name }
          : { name, text };
        node.attrs = [{ name: "type", value: "module" }, { name: "src", value: `./${name}.js` }];
        node.childNodes = [];
      }
      visit(node);
      if (node.tagName === "main") {
        const banner = tree.createElement("p", "http://www.w3.org/1999/xhtml", [{ name: "class", value: "local-environment-banner" }, { name: "role", value: "status" }]);
        tree.insertText(banner, "Локальная апробация · Firebase Emulator · production не подключён");
        if (node.childNodes.length) tree.insertBefore(node, banner, node.childNodes[0]);
        else tree.appendChild(node, banner);
      }
      return true;
    });
  }
  visit(document);
  await writeFile(resolve(output, `${page}.html`), serialize(document));
}
const plugins = [{ name: "local-composition", setup(context) {
  context.onLoad({ filter: /lazy-libs\.ts$/ }, async args => ({ contents: (await readFile(args.path, "utf8")).replace("https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js", "/vendor/chart.js").replace("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js", "/vendor/jspdf.js"), loader: "ts" }));
  context.onResolve({ filter: /^inline:/ }, args => ({ path: args.path, namespace: "inline" }));
  context.onLoad({ filter: /.*/, namespace: "inline" }, args => ({ contents: entries[args.path.slice(7)].text, loader: "js", resolveDir: root }));
  context.onResolve({ filter: /^\.\/dist\/.*\.js$/ }, args => ({ path: resolve(root, args.path.replace("./dist/", "src/client/").replace(/\.js$/, ".ts")) }));
  context.onResolve({ filter: /^(?:\.\.\/|\.\/)+firebase\.js$/ }, () => ({ path: resolve(root, "src/client/infrastructure/firebase/development.ts") }));
  context.onResolve({ filter: /document-validation\.js$/ }, () => ({ path: resolve(root, "src/shared/documents.ts") }));
  context.onResolve({ filter: /bim-publication\.js$/ }, () => ({ path: resolve(root, "src/shared/bim/publication.ts") }));
  context.onResolve({ filter: /vendor\/.*\.bundle\.js$/ }, args => ({ path: `/dist/app/vendor/${args.path.split("/").pop()}`, external: true }));
} }];
await build({ entryPoints: Object.entries(entries).map(([name, entry]) => entry.entryPoint ? { in: entry.entryPoint === resolve(root, "src/client/firebase.ts") ? resolve(root, "src/client/infrastructure/firebase/development.ts") : entry.entryPoint, out: name } : { in: `inline:${name}`, out: name }), outdir: output, bundle: true, splitting: true, format: "esm", platform: "browser", target: "es2022", plugins, charset: "utf8" });
for (const asset of ["style.css", "liquid-glass.css", "icons", "favicon.ico"]) await cp(resolve(root, asset), resolve(output, asset), { recursive: true });
for (const extension of ["html", "css"]) {
  await mkdir(resolve(output, "modules/summary"), { recursive: true });
  await cp(resolve(root, `src/client/app/modules/summary/analytics-block.${extension}`), resolve(output, `modules/summary/analytics-block.${extension}`));
}


await mkdir(resolve(output, "vendor"), { recursive: true });
for (const [name, url] of [["chart", "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"], ["jspdf", "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"]]) {
  const file = resolve(output, `vendor/${name}.js`);
  if (await access(file).then(() => true, () => false)) continue;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Cannot obtain existing dependency ${name}: ${response.status}`);
  await writeFile(file, new Uint8Array(await response.arrayBuffer()));
}
await mkdir(resolve(output, "dist/app"), { recursive: true });
await cp(resolve(root, "dist/app/vendor"), resolve(output, "dist/app/vendor"), { recursive: true, filter: path => !path.endsWith(".map") });
await mkdir(resolve(output, "dist/app/services"), { recursive: true });
await cp(resolve(root, "dist/app/services/ifc-import-worker.js"), resolve(output, "dist/app/services/ifc-import-worker.js"));
await cp(resolve(root, "fonts"), resolve(output, "fonts"), { recursive: true });

console.log("Local frontend built: dist-local (emulators only, no documents bundled)");

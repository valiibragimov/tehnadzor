import { build } from "esbuild";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { startStaticServer } from "../../smoke/helpers/static-server.mjs";

const demoRoot = resolve("src/client/demo");
const bundle = await build({
  stdin: {
    resolveDir: process.cwd(),
    contents: `
      import { updateControlPlan, configureControlPlanWorkspace, initControlPlanModule } from './src/client/features/control-plan/ui.ts';
      import { updateSummaryTab, configureSummaryWorkspace } from './src/client/app/modules/summary.ts';
      import { initializeLocalization } from './src/client/shared/i18n/index.ts';
      import { createDemoFixtures } from './src/client/demo/fixtures.ts';
      import { createDemoDatabaseStore } from './src/client/demo/storage.ts';
      export { updateControlPlan, updateSummaryTab };
      export async function setup() {
        const state = createDemoFixtures();
        const original = state.projects['demo-project'];
        const projects = {}, projectCollections = {}, journal = {};
        for (const [id, name, count, status] of [['project-a','Project A',1,'exceeded'],['project-b','Project B',2,'ok']]) {
          projects[id] = { ...original, id, name, ownerUid:'synthetic-owner', createdBy:'synthetic-owner' };
          const geomChecks = {}, inspections = {};
          for (let i=0;i<count;i++) {
            const sourceId = id + '-' + i;
            const record = { projectId:id, module:'Геометрия', moduleKey:'geometry', construction:'foundation_slab',
              context:name+' position', location:name+' position', status, createdAt:Date.UTC(2026,6,24),
              projThick:500, factThick:status==='ok'?500:514 };
            geomChecks[sourceId] = record;
            inspections[sourceId] = { ...record, sourceId, sourceCollection:'geomChecks', checkStatus:status };
            journal[sourceId] = { ...record, sourceId };
          }
          projectCollections[id] = { geomChecks, inspections, issues:{}, geoNodes:{}, reinfChecks:{}, strengthChecks:{} };
        }
        state.projects=projects; state.projectCollections=projectCollections; state.journal=journal;
        createDemoDatabaseStore(localStorage).write(state);
        let projectId='project-a';
        const selector=document.getElementById('projectSelector');
        selector.innerHTML='<option value="project-a">Project A</option><option value="project-b">Project B</option><option value="">No project</option>';
        const workspace={ getProjectId:()=>projectId, getEngineerName:()=>'', projectSelector:selector,
          construction:document.getElementById('construction'), dateInput:{value:'2026-10-16'}, nodes:new Map(), geometryChecks:new Map() };
        configureControlPlanWorkspace(workspace); configureSummaryWorkspace(workspace,()=>{});
        await initializeLocalization();
        document.querySelectorAll('.section').forEach(el=>el.classList.add('active'));
        return { select(id) { projectId=id; selector.value=id||''; }, updateControlPlan, updateSummaryTab, initializePlan:initControlPlanModule };
      }`
  },
  bundle: true, write: false, format: "esm", platform: "browser",
  plugins: [{
    name: "controlled-demo-storage",
    setup(context) {
      context.onResolve({ filter: /firestore-repository\.js$/ }, () => ({ path: "storage", namespace: "race-test" }));
      context.onLoad({ filter: /.*/, namespace: "race-test" }, () => ({
        resolveDir: process.cwd(),
        contents: `
          export * from './src/client/demo/repositories/app-repository.ts';
          import * as storage from './src/client/demo/repositories/app-repository.ts';
          async function read(method,args) {
            const snapshot=await storage[method](...args);
            return globalThis.projectReadGate(method,args,snapshot);
          }
          export const getProjectCollectionSnapshot=(...args)=>read('getProjectCollectionSnapshot',args);
          export const getProjectCollectionDocSnapshot=(...args)=>read('getProjectCollectionDocSnapshot',args);
          export const getProjectCollectionOrderedSnapshot=(...args)=>read('getProjectCollectionOrderedSnapshot',args);
          export const getProjectDocSnapshot=(...args)=>read('getProjectDocSnapshot',args);
          export const getJournalEntriesSnapshot=(...args)=>read('getJournalEntriesSnapshot',args);
          export const getProjectsByFieldSnapshot=(...args)=>read('getProjectsByFieldSnapshot',args);
          export const getProjectsSnapshot=(...args)=>read('getProjectsSnapshot',args);`
      }));
      for (const [filter, file] of [
        [/infrastructure\/firebase\/firestore\.js$/, "firebase-firestore-shim.ts"],
        [/infrastructure\/firebase\/auth\.js$/, "firebase-auth-shim.ts"],
        [/infrastructure\/firebase\/app\.js$/, "firebase-shim.ts"],
        [/^(?:\.\.\/|\.\/)+firebase\.js$/, "firebase-shim.ts"],
        [/ui\/lazy-libs\.js$/, "lazy-libs-shim.ts"]
      ]) context.onResolve({ filter }, () => ({ path: resolve(demoRoot, file) }));
    }
  }]
});

export async function startProjectUpdateHarness({ production = false } = {}) {
  const server = await startStaticServer(resolve("dist-demo"));
  const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "chrome" } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    if (!production) {
      await page.route("**/demo.js", route => route.fulfill({ contentType: "text/javascript", body: "" }));
      await page.route("**/project-update-harness.js", route => route.fulfill({ contentType: "text/javascript", body: bundle.outputFiles[0].text }));
    }
    await page.goto(`${server.url}/demo.html`);
    if (production) return { page, close: async () => { await browser.close(); await server.close(); } };
    await page.evaluate(async () => {
      const gates = [], flights = new Map(), reads = [];
      window.projectReadGate = (method, args, snapshot) => {
        reads.push({ method, project: args[0], collection: args[1] });
        const gate = gates.find(item => !item.started && item.method === method &&
          (item.project == null || item.project === args[0]) && (item.collection == null || item.collection === args[1]));
        if (!gate) return snapshot;
        gate.started = true;
        return new Promise((resolve, reject) => {
          gate.finish = error => error ? reject(new Error(error)) : resolve(snapshot);
        });
      };
      const ui = await (await import("/project-update-harness.js")).setup();
      window.race = {
        ...ui, gates, reads,
        hold(method, project, collection) { gates.push({ method, project, collection, started: false }); return gates.length-1; },
        start(name, action) { flights.set(name, ui[action]()); },
        finish: name => flights.get(name),
        release(index, error) { gates[index].finish(error); }
      };
    });
    return { page, close: async () => { await browser.close(); await server.close(); } };
  } catch (error) {
    await browser.close(); await server.close(); throw error;
  }
}

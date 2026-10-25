import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
test("excavation dimensions require a confirmed criterion and no fictitious slab thickness", async()=>{
 const dir=await mkdtemp(join(tmpdir(),"tehnadzor-dim-"));
 try {const file=join(dir,"evaluation.mjs");await build({entryPoints:[resolve("src/client/features/inspections/geometry/evaluation.ts")],outfile:file,bundle:true,platform:"node",format:"esm"});
 const {evaluateGeometryCheck}=await import(pathToFileURL(file));
 const check={construction:"excavation",physicalDimensions:{length:{project:1000,actual:1004}},acceptanceCriteria:{reference:"Synthetic project criterion",confirmed:true,limits:{dimensions:{min:-5,max:5}}}};
 assert.equal(evaluateGeometryCheck(check).status,"ok");
 assert.notEqual(evaluateGeometryCheck({...check,acceptanceCriteria:{}}).status,"ok");
 }finally{await rm(dir,{recursive:true,force:true});}
});

test("sample quality index excludes other measurements and whole-project rankings", async()=>{
 const dir=await mkdtemp(join(tmpdir(),"tehnadzor-scope-"));
 try {const file=join(dir,"analytics.mjs");await build({entryPoints:[resolve("src/client/app/modules/summary/analytics-data.ts")],outfile:file,bundle:true,platform:"node",format:"esm"});
 const {calculateProjectAnalytics,rankProjects,calculateContractors}=await import(pathToFileURL(file));
 const node={id:"selected",construction:"excavation",measurementScope:"height",coordinateUnit:"m",deviationUnit:"mm",measurementSchemaVersion:2,evaluationSchemaVersion:2,status:"ok",projH:100,factH:100.002,acceptanceCriteria:{reference:"Synthetic criterion",confirmed:true,limits:{geoHeight:{min:-5,max:5}}}};
 const scoped=calculateProjectAnalytics({id:"test",data:()=>({name:"Synthetic sample",qualityIndexScope:{moduleKey:"geo",sourceIds:["selected"],label:"Selected elevations only"}})},{geoNodes:[node,{...node,id:"other",factH:100.004}]});
 assert.equal(scoped.measurementCount,1);
 assert.equal(rankProjects([scoped]).ranked.length,0);
 assert.equal(rankProjects([scoped]).fullList.length,1);
 assert.equal(calculateContractors([scoped]).length,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});

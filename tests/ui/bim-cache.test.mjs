import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startStaticServer} from '../smoke/helpers/static-server.mjs';
import {resolve} from 'node:path';
test('IFC file cache isolates projects and deletes only the requested model',async()=>{
 const server=await startStaticServer(resolve('.'));
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
 try{
  const page=await browser.newPage();await page.goto(server.url+'/login.html');
  const result=await page.evaluate(async()=>{
   const cache=await import('/dist/app/services/ifc-file-cache.js');
   const file=new Blob(['synthetic IFC bytes']);
   for(const projectId of ['a','b']) await cache.cacheProjectIfcFile({projectId,sourceModelId:'same',fileName:'fixture.ifc',file});
   const before=await cache.getCachedProjectIfcFile({projectId:'a',sourceModelId:'same'});
   await cache.deleteAllCachedProjectIfcFiles('a');
   const after=await cache.getCachedProjectIfcFile({projectId:'a',sourceModelId:'same'});
   const other=await cache.getCachedProjectIfcFile({projectId:'b',sourceModelId:'same'});
   await cache.deleteCachedProjectIfcFile({projectId:'b',sourceModelId:'same'});
   return {text:await before.file.text(),after,other:await other.file.text()};
  });
  assert.deepEqual(result,{text:'synthetic IFC bytes',after:null,other:'synthetic IFC bytes'});
 }finally{await browser.close();await server.close();}
});

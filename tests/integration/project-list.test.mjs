import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {initializeTestEnvironment,assertFails,assertSucceeds} from "@firebase/rules-unit-testing";
import {collection,doc,setDoc,getDocs,query,where} from "firebase/firestore";
test("project list is queryable by its owner and rejects foreign or unscoped reads",async()=>{
 const address=process.env.FIRESTORE_EMULATOR_HOST||"";
 if(!/^127\.0\.0\.1:\d+$/.test(address))throw Error("Loopback emulator required");
 const [host,port]=address.split(":");
 const env=await initializeTestEnvironment({projectId:"demo-project-list",firestore:{host,port:Number(port),rules:await readFile("firestore.rules","utf8")}});
 try{await env.withSecurityRulesDisabled(async context=>{const db=context.firestore();await setDoc(doc(db,"projects/own"),{ownerUid:"alice",createdBy:"alice"});await setDoc(doc(db,"projects/foreign"),{ownerUid:"bob",createdBy:"bob"});});
 const db=env.authenticatedContext("alice").firestore();const own=await assertSucceeds(getDocs(query(collection(db,"projects"),where("ownerUid","==","alice"))));assert.equal(own.size,1);
 await assertFails(getDocs(query(collection(db,"projects"),where("ownerUid","==","bob"))));await assertFails(getDocs(collection(db,"projects")));
 }finally{await env.cleanup();}
});

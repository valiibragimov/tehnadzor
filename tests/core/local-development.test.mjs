import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {getLocalDevelopmentConfig}=require('../../server/dist/server/src/infrastructure/local-development.js');
test('local development requires a demo project and all Firebase services on loopback',()=>{
 const env={LOCAL_FIREBASE_EMULATORS:'true',FIREBASE_PROJECT_ID:'demo-tehnadzor-approbation',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8085',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199',FIREBASE_STORAGE_BUCKET:'demo-tehnadzor-approbation.appspot.com',AUTH_REQUIRED:'true'};
 assert.equal(getLocalDevelopmentConfig(env).projectId,'demo-tehnadzor-approbation');
 assert.equal(getLocalDevelopmentConfig({}),null);
 for(const key of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST']){
  assert.throws(()=>getLocalDevelopmentConfig({...env,[key]:''}),/LOCAL_EMULATOR_CONFIG/);
  assert.throws(()=>getLocalDevelopmentConfig({...env,[key]:'cloud.example:8085'}),/LOCAL_EMULATOR_CONFIG/);
 }
 assert.throws(()=>getLocalDevelopmentConfig({...env,FIREBASE_PROJECT_ID:'real-project'}),/LOCAL_EMULATOR_CONFIG/);
 assert.throws(()=>getLocalDevelopmentConfig({...env,FIREBASE_STORAGE_BUCKET:'real-project.appspot.com'}),/LOCAL_EMULATOR_CONFIG/);
 assert.throws(()=>getLocalDevelopmentConfig({...env,AUTH_REQUIRED:'false'}),/LOCAL_EMULATOR_CONFIG/);
});

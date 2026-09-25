import test from 'node:test';
import assert from 'node:assert/strict';
import { allowed, contains, filterFrames } from '../src/lib/edge-regions.ts';
const exclusion={id:'e',name:'Exclude',kind:'exclude',enabled:true,points:[[0,0],[.5,0],[.5,1],[0,1]]};
const profile={frame_size:{width:1920,height:1080},anchor:'center',regions:[exclusion]};
const track=(box,id=1)=>({xyxy:box,native_id:id,native_class:2,visible:true});
test('Crowne-compatible center and edge semantics, with exclusion winning over inclusion',()=>{
 assert.equal(contains([.5,.5],exclusion.points),true);
 assert.equal(allowed(track([0,0,1920,1080]),profile),false);
 assert.equal(allowed(track([1200,0,1500,80]),profile),true);
 assert.equal(allowed(track([1200,0,1500,80]),{...profile,regions:[{...exclusion,kind:'include'}]}),false);
 assert.equal(allowed(track([100,0,150,80]),{...profile,regions:[exclusion,{...exclusion,kind:'include'}]}),false);
 assert.equal(allowed(track([100,0,150,80]),{...profile,regions:[{...exclusion,enabled:false}]}),true);
});
test('filtering one view never mutates its replay or another camera',()=>{
 const frames=[{camera:'a',source_seconds:1,native_tracks:[track([100,0,150,80]),track([1200,0,1500,80],2)]}];
 const filtered=filterFrames(frames,profile);
 assert.equal(filtered[0].native_tracks.length,1);assert.equal(filtered[0].native_tracks[0].native_id,2);
 assert.equal(frames[0].native_tracks.length,2);assert.equal(filterFrames(frames,undefined)[0].native_tracks.length,2);
});

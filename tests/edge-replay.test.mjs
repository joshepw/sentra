import test from 'node:test';
import assert from 'node:assert/strict';
import {frameAt, ReplayClock, vehiclesIn} from '../src/lib/edge-replay.ts';
const track=(id,attributes=null,box=[1,2,5,8])=>({native_id:id,native_class:2,visible:true,xyxy:box,attributes});
const frame=(time,tracks=[],camera='crowne')=>({camera,source_seconds:time,analysed_fps_5s:9,native_tracks:tracks});

test('a later classification never appears on an earlier video frame and stale boxes disappear',()=>{
 const earlier=frame(1,[track(4)]),later=frame(1.15,[track(4,{type:'paila',color:'rojo',completed_s:1.1})]);
 assert.equal(frameAt([earlier,later],.99),undefined);
 assert.equal(frameAt([earlier,later],1.1).native_tracks[0].attributes,null);
 assert.equal(frameAt([earlier,later],1.16).native_tracks[0].attributes.color,'rojo');
 assert.equal(frameAt([earlier,later],1.5),undefined);
});

test('shared playback clock preserves pause/seek and resets before another inference',t=>{
 let milliseconds=1000;t.mock.method(performance,'now',()=>milliseconds);
 const c=new ReplayClock();
 c.replay([{seconds:0,frames:[frame(-1),frame(0,[track(2)])],metrics:{}}]);
 milliseconds=5000;assert.equal(c.time(),4);
 c.pause();milliseconds=9000;assert.equal(c.time(),4);
 c.seek(45);assert.equal(c.time(),45);
 c.pause();milliseconds=10000;assert.equal(c.time(),46);
 c.pause();c.reset();assert.equal(c.paused,false);assert.equal(c.time(),0);assert.equal(c.frames.size,0);
});

test('camera histories remain independent; context and duplicate frames do not pollute the gallery',()=>{
 const c=new ReplayClock();
 c.append([frame(-1,[track(1)]),frame(0,[track(2)]),frame(0,[track(999)]),frame(0,[track(2)],'little')]);
 assert.equal(c.frames.get('crowne').length,1);
 assert.equal(c.frames.get('little').length,1);
 const frames=[frame(0,[track(2),{...track(77),native_class:0}]),frame(.2,[track(2,{type:'camioneta',color:'blanco',completed_s:.1},[0,0,30,30])]),frame(.4,[track(2)])];
 const vehicles=vehiclesIn(frames);assert.equal(vehicles.length,1);
 assert.deepEqual(vehicles[0],{id:2,time:.2,box:[0,0,30,30],type:'Camioneta',color:'Blanco'});
});

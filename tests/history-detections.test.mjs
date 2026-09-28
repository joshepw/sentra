import test from 'node:test';
import assert from 'node:assert/strict';
import { historyFrameAt, historyTime } from '../src/lib/history-detections.ts';
const object={id:2,class_id:2,label:'Auto',score:.9,box:[.1,.2,.3,.4]};
const frame=(at,extra={})=>({camera:'little',session:'one',captured_at:at,width:1920,height:1080,source_pts:at-100,region_revision:20,objects:[object],...extra});
test('archive seeks never show future labels and remove boxes across missing observations',()=>{
 const future={...object,box:[.2,.3,.4,.5],attributes:{type:'paila',color:'rojo'}};
 const rows=[frame(100),frame(100.1,{objects:[future]})];
 assert.equal(historyFrameAt(rows,99.99),null);
 const mid=historyFrameAt(rows,100.05);assert.equal(mid.objects[0].attributes,undefined);
 assert(Math.abs(mid.objects[0].box[0]-.15)<1e-8);
 assert.equal(historyFrameAt(rows,100.5),null);
 assert.equal(historyFrameAt(rows,NaN),null);
 assert.equal(historyFrameAt(rows,100.1).objects[0].attributes.color,'rojo');
});
test('restarts, area changes, empty frames and time gaps do not invent trajectories',()=>{
 for(const extra of [{session:'new'},{region_revision:21}]){
  const rows=[frame(100),frame(100.1,{...extra,objects:[{...object,box:[.9,.9,1,1]}]})];
  assert.equal(historyFrameAt(rows,100.05).objects[0].box[0],.1);
 }
 assert.deepEqual(historyFrameAt([frame(100),frame(100.1,{objects:[]})],100.1).objects,[]);
 assert.equal(historyFrameAt([frame(100),frame(102)],101),null);
 assert.match(historyTime(1790470931),/7:02:11/);
});
test('query dates retain Honduras time for ISO strings and epoch seconds',()=>{
 const expected=historyTime(1790470931);
 for(const value of ['1790470931','2026-09-26T19:02:11-06:00','2026-09-27T01:02:11Z',
   '2026-09-26T19:02:11','2026-09-26 19:02:11','2026-09-26T19:02:11-06']){
  assert.equal(historyTime(value),expected,value);
 }
 assert.equal(historyTime('2026-09-26'),historyTime('2026-09-26T00:00:00-06:00'));
 assert.match(historyTime('2026-09-27T01:02:11Z',false),/7:02:11/);
});
test('unusable timestamps do not throw the viewer into its error boundary',()=>{
 for(const value of [undefined,null,'',' ','not-a-date','2026-99-99T25:00:00',NaN,Infinity,1e30]){
  assert.equal(historyTime(value),'Hora no disponible');
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {DetectionBuffer,fragmentPosition,containedVideo,displayDetections} from '../src/lib/live-detections.ts';
import {historyFrameAt} from '../src/lib/history-detections.ts';

const object=(id,box=[.1,.2,.3,.4],label='Carro')=>({id,class_id:2,label,score:.8,box});
const frame=(offset,objects=[object(3)],extra={})=>({camera:'little1',session:'one',segment:'video_seg1.mp4',offset,
 sequence:Math.round(offset*100)+1,width:1920,height:1080,region_revision:20,objects,...extra});

test('each client synchronizes against its decoded fragment clock, not event arrival time',()=>{
 const fragment={url:'https://example.test/video_seg1.mp4?session=abc',start:100,duration:4,
   elementaryStreams:{video:{startPTS:100.067,endPTS:104.067}}};
 const position=fragmentPosition([fragment],101.067);
 assert.deepEqual(position,{segment:'video_seg1.mp4',offset:1});
 assert.equal(fragmentPosition([fragment],99),null);
 assert.equal(fragmentPosition([{url:fragment.url,start:100,duration:4}],101),null);
});

test('geometry interpolates while labels and IDs never arrive from the future',()=>{
 const buffer=new DetectionBuffer();
 buffer.append([frame(1),frame(1.2,[object(3,[.2,.2,.4,.4],'Camión'),object(7)])],'little1');
 assert.equal(buffer.at('video_seg1.mp4',.99),null);
 const halfway=buffer.at('video_seg1.mp4',1.1);
 assert.equal(halfway.objects.length,1);
 assert.equal(halfway.objects[0].label,'Carro');
 assert(Math.abs(halfway.objects[0].box[0]-.15)<1e-10);
 assert.equal(buffer.at('video_seg1.mp4',1.49),null);
 assert.equal(buffer.at('new_signal_seg1.mp4',1.1),null);
});

test('a tracker restart or area edit prevents interpolation between identities',()=>{
 for(const extra of [{session:'two'},{region_revision:21}]){
  const buffer=new DetectionBuffer();
  buffer.append([frame(1),frame(1.2,[object(3,[.5,.5,.6,.6])],extra)],'little1');
  assert.equal(buffer.at('video_seg1.mp4',1.1).objects[0].box[0],.1);
 }
});

test('empty observations clear boxes and camera/coordinate validation rejects wrong metadata',()=>{
 const buffer=new DetectionBuffer();
 buffer.append([frame(0),frame(.1,[]),frame(.2,[object(3,[-1,.2,.3,.4])]),frame(.3,[],{camera:'other'})],'little1');
 assert.equal(buffer.count,2);
 assert.equal(buffer.at('video_seg1.mp4',.1).objects.length,0);
});

test('reconnected SSE packets deduplicate and paused seeks retain matching observations',()=>{
 const buffer=new DetectionBuffer(),rows=[frame(0),frame(.1),frame(.2)];
 buffer.append(rows,'little1');buffer.append(rows,'little1');
 assert.equal(buffer.count,3);
 assert.equal(buffer.at('video_seg1.mp4',.2).offset,.2);
 assert.equal(buffer.at('video_seg1.mp4',0).offset,0);
});

test('indefinite live sessions have bounded browser memory',()=>{
 const buffer=new DetectionBuffer();
 for(let i=0;i<200;i++)buffer.append([frame(0,[],{segment:`video_seg${i}.mp4`})],'little1');
 assert.equal(buffer.frames.size,90);
 assert.equal(buffer.count,90);
 assert.equal(buffer.at('video_seg0.mp4',0),null);
});

test('boxes follow the displayed video rectangle in portrait and fullscreen layouts',()=>{
 assert.deepEqual(containedVideo(400,400,1920,1080),{x:0,y:87.5,width:400,height:225});
 assert.deepEqual(containedVideo(1920,1080,1920,1080),{x:0,y:0,width:1920,height:1080});
 assert.equal(containedVideo(0,0,1920,1080),null);
});

const attributes={type:'camioneta',color:'gris',type_score:.9,color_score:.8,
 ready_source_pts:11.4,view_source_pts:[10,10.5,11]};

test('type and color are causal and never borrowed from an interpolated future frame',()=>{
 const buffer=new DetectionBuffer();
 buffer.append([frame(1.4,[object(3)],{source_pts:11.4}),
  frame(1.5,[{...object(3,[.2,.2,.4,.4]),attributes}],{source_pts:11.5})],'little1');
 assert.equal(buffer.at('video_seg1.mp4',1.45).objects[0].attributes,undefined);
 assert.deepEqual(buffer.at('video_seg1.mp4',1.5).objects[0].attributes,attributes);
 assert.equal(buffer.at('video_seg1.mp4',1.4).objects[0].attributes,undefined);
});

test('future crops, malformed scores and attributes on people or motorcycles are rejected',()=>{
 const invalid=[
  {attributes:{...attributes,ready_source_pts:12}},
  {attributes:{...attributes,view_source_pts:[10,10.5,12]}},
  {attributes:{...attributes,view_source_pts:[10,10.1,10.2]}},
  {attributes:{...attributes,color_score:NaN}},
  {attributes:{...attributes,type_score:1.1}},
  {attributes:{...attributes,color:''}},
  {attributes:null}, {attributes,class_id:0}, {attributes,class_id:3}
 ];
 for(const extra of invalid){
  const buffer=new DetectionBuffer();
  buffer.append([frame(1.5,[{...object(3),...extra}],{source_pts:11.5})],'little1');
  assert.equal(buffer.count,0);
 }
});

test('a new session or empty observations do not retain earlier type and color',()=>{
 const buffer=new DetectionBuffer();
 buffer.append([frame(1.5,[{...object(3),attributes}],{source_pts:11.5}),
  frame(1.6,[object(3)],{source_pts:11.6,session:'new'}),
  frame(1.7,[],{source_pts:11.7,session:'new'})],'little1');
 assert.equal(buffer.at('video_seg1.mp4',1.6).objects[0].attributes,undefined);
 assert.equal(buffer.at('video_seg1.mp4',1.7).objects.length,0);
});

test('live and saved playback use observed geometry at the same time, retaining past labels',()=>{
 const past={...object(3),display_box:[.2,.2,.4,.4]};
 const future={...object(3),display_box:[.4,.2,.6,.4],label:'future label'};
 const originals=[frame(1,[past]),frame(1.2,[future])];
 const buffer=new DetectionBuffer();buffer.append(originals,'little1');
 const historical=originals.map(row=>displayDetections({...row,captured_at:100+row.offset}));
 for(const row of [buffer.at('video_seg1.mp4',1.1),historyFrameAt(historical,101.1)]){
  assert(Math.abs(row.objects[0].box[0]-.3)<1e-8);
  assert.equal(row.objects[0].label,'Carro');
 }
 assert.equal(buffer.at('video_seg1.mp4',1).objects[0].box[0],.2);
 assert.equal(buffer.at('video_seg1.mp4',.99),null);
 assert.equal(originals[0].objects[0].box[0],.1,'Display cannot mutate tracked evidence');
});

test('older metadata and invalid optional geometry preserve the valid tracked rectangle',()=>{
 for(const display_box of [undefined,null,[],[.1,.2,.3],[-1,.2,.3,.4],[.3,.2,.1,.4],[NaN,.2,.3,.4],['.1',.2,.3,.4]]){
  const input=frame(1,[{...object(3),display_box}]);
  assert.deepEqual(displayDetections(input).objects[0].box,object(3).box);
  const buffer=new DetectionBuffer();buffer.append([input],'little1');
  assert.equal(buffer.count,1);
  assert.deepEqual(buffer.at('video_seg1.mp4',1).objects[0].box,object(3).box);
 }
});

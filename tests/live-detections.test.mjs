import test from 'node:test';
import assert from 'node:assert/strict';
import {DetectionBuffer,fragmentPosition,containedVideo} from '../src/lib/live-detections.ts';

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

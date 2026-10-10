import assert from "node:assert/strict";
import test from "node:test";
import {contentPolicyRejection, matureContentModeEnabled} from "../lib/ai-room-content-policy";
import {parseVideoRequest, VideoEngineError} from "../lib/video-engine";

const safePrompt="Two consenting adult partners slow dance in a cinematic candlelit restaurant";
const reference="data:image/png;base64,AAAA";
const example=(extra:Record<string,unknown>={})=>({
  prompt:safePrompt,model:"Wan 2.2 Fast",mode:"text",duration:"5s",quality:"720p",...extra
});

function setMatureFlag(t:test.TestContext, value?:string) {
  const before=process.env.AI_ROOM_ENABLE_MATURE_MODE;
  t.after(()=>{if(before===undefined)delete process.env.AI_ROOM_ENABLE_MATURE_MODE;else process.env.AI_ROOM_ENABLE_MATURE_MODE=before});
  if(value===undefined)delete process.env.AI_ROOM_ENABLE_MATURE_MODE;
  else process.env.AI_ROOM_ENABLE_MATURE_MODE=value;
}

test("operator feature flag is off by default and requires exact true",t=>{
  setMatureFlag(t);
  assert.equal(matureContentModeEnabled(),false);
  process.env.AI_ROOM_ENABLE_MATURE_MODE="TRUE";
  assert.equal(matureContentModeEnabled(),false);
  process.env.AI_ROOM_ENABLE_MATURE_MODE="true";
  assert.equal(matureContentModeEnabled(),true);
});

test("normal mode stays the default and does not require 18+ affirmation",t=>{
  setMatureFlag(t);
  const request=parseVideoRequest(example());
  assert.equal(request.contentMode,"standard");
  assert.equal(request.adultConfirmed,false);
  assert.equal(request.mode,"text");
  assert.equal(request.model,"Wan 2.2 Fast");
  assert.equal(parseVideoRequest(example({mode:"image",imageUrl:reference})).mode,"image");
});

test("mode input and age affirmation must be valid data types",()=>{
  assert.throws(()=>parseVideoRequest(example({contentMode:"anything"})), /Unsupported content mode/);
  assert.throws(()=>parseVideoRequest(example({adultConfirmed:"true"})),/Invalid adult confirmation/);
  assert.throws(()=>parseVideoRequest(example({contentMode:null})),/Unsupported content mode/);
});

test("mature request fails closed when administrator flag is unset",t=>{
  setMatureFlag(t);
  assert.throws(()=>parseVideoRequest(example({contentMode:"mature",adultConfirmed:true})),
    (error:unknown)=>error instanceof VideoEngineError&&error.httpStatus===403&&/disabled/i.test(error.message));
});

test("mature request requires affirmative adult declaration",t=>{
  setMatureFlag(t,"true");
  assert.throws(()=>parseVideoRequest(example({contentMode:"mature"})),
    (error:unknown)=>error instanceof VideoEngineError&&error.httpStatus===403&&/18 or older/i.test(error.message));
  const accepted=parseVideoRequest(example({contentMode:"mature",adultConfirmed:true}));
  assert.equal(accepted.contentMode,"mature");
  assert.equal(accepted.adultConfirmed,true);
});

test("mature image-to-video remains unavailable pending image consent and account controls",t=>{
  setMatureFlag(t,"true");
  assert.throws(()=>parseVideoRequest(example({mode:"image",imageUrl:reference,contentMode:"mature",adultConfirmed:true})),
    (error:unknown)=>error instanceof VideoEngineError&&error.httpStatus===403&&/image-to-video/i.test(error.message));
});

test("baseline disallowed prompts blocked in both modes before paid submission",t=>{
  setMatureFlag(t,"true");
  const blocked=[
    "Produce explicit pornographic video of adults",
    "Make revenge porn using this photo",
    "Create a sexual scene with an underage child",
    "A fully naked model poses in a close-up",
    "A non-consensual intimate video",
  ];
  for(const prompt of blocked){
    assert.ok(contentPolicyRejection(prompt),prompt);
    for(const contentMode of ["standard","mature"]){
      assert.throws(()=>parseVideoRequest(example({prompt,contentMode,adultConfirmed:true})),
        (error:unknown)=>error instanceof VideoEngineError&&error.httpStatus===422,
        contentMode+": "+prompt);
    }
  }
});

test("ordinary romance and lifestyle videos are not incorrectly blocked by baseline guard",()=>{
  for(const prompt of [
    "A couple shares a gentle kiss under a sunset",
    "A stylish adult in an elegant evening dress walks through a hotel",
    "Two adults slow dance in warm candlelight",
    "An adult fashion model poses in a high-end studio",
  ])assert.equal(contentPolicyRejection(prompt),null,prompt);
});

import assert from "node:assert/strict";
import test from "node:test";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import PrivateVideoPlayer from "../app/ai-room/PrivateVideoPlayer";

test("Gallery and Preview initial markup never requests private MP4 bytes",()=>{
  const url="/api/ai-room/videos/confidential-owner-video/stream";
  const html=renderToStaticMarkup(createElement(PrivateVideoPlayer,{
    src:url,aspect:"16 / 9"
  }));
  assert.match(html,/Play saved video/);
  assert.match(html,/<button/);
  assert.doesNotMatch(html,/<video|src=|confidential-owner-video/);
});

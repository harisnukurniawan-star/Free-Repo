"use client";
import {useState} from "react";

/** No src-bearing media element is mounted until Play is explicitly clicked.
 * Avoids OCI range requests for every card when Gallery first renders. */
export default function PrivateVideoPlayer({src,aspect,videoClassName}:{
  src:string;aspect?:string|number;videoClassName?:string
}){
  const [activated,setActivated]=useState(false);
  if(activated)return <video src={src} controls playsInline autoPlay preload="metadata"
    className={videoClassName} style={{aspectRatio:aspect}}/>;
  return <button type="button" className="private-video-activate"
    style={{aspectRatio:aspect}} onClick={()=>setActivated(true)}
    aria-label="Play saved private video">
    <span className="play-icon" aria-hidden="true">▶</span>
    <strong>Play saved video</strong>
    <small>Loads from OCI only when selected</small>
  </button>;
}

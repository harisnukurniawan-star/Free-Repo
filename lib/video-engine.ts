export type VideoRequest={prompt:string;mode:"text"|"image";model:string;duration:"5s"|"10s";aspect:"16:9"|"9:16"|"1:1";quality:"480p"|"720p"};
export type VideoJob={id:string;status:"queued"|"processing"|"completed"|"failed";provider:string;createdAt:string};
export interface VideoEngine{name:string;submit(input:VideoRequest):Promise<VideoJob>}
class DevelopmentEngine implements VideoEngine{name="development";async submit(_:VideoRequest){return{id:crypto.randomUUID(),status:"queued" as const,provider:this.name,createdAt:new Date().toISOString()}}}
export function getVideoEngine():VideoEngine{return new DevelopmentEngine()}

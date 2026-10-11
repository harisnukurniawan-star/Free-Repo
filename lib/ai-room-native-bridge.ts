import "server-only";
import {NativeObjectStore} from "./ai-room-native-objects";

// Kept inside the private storage boundary so existing metadata, quotas,
// tombstones and owner-authorization logic can be reused unmodified.
export class NativeCommandBridge {
  private readonly store=new NativeObjectStore();
  destroy():void {}
  async send(command:unknown):Promise<unknown>{
    const req=command as {constructor:{name:string};input:{
      Key?:string;Prefix?:string;MaxKeys?:number;Body?:string|Buffer;
      ContentType?:string;ContentLength?:number;
    }};
    const key=req.input.Key||"";
    switch(req.constructor.name){
      case "HeadObjectCommand":
        return this.store.head(key);
      case "GetObjectCommand":{
        const text=await this.store.getText(key);
        return {Body:{transformToString:async()=>text}};
      }
      case "PutObjectCommand":
        await this.store.put(key,req.input.Body||"",req.input.ContentLength,req.input.ContentType||"application/json");
        return {};
      case "DeleteObjectCommand":
        await this.store.delete(key);
        return {};
      case "ListObjectsV2Command":
        return this.store.list(req.input.Prefix||"",req.input.MaxKeys||1000);
      default:
        throw new Error("Unsupported OCI Native command");
    }
  }
}

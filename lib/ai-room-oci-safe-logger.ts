import "server-only";
import {AsyncLocalStorage} from "node:async_hooks";

/**
 * OCI TypeScript SDK's retrier writes directly to console.warn, bypassing
 * common.LOG.logger. Those messages can contain private object keys even
 * when retries are disabled. Filter ONLY known SDK retry warnings while an
 * OCI operation is running in this AsyncLocalStorage context.
 *
 * Keep the app's own sanitized AI_ROOM_OCI_NATIVE_FAILURE log untouched.
 * Do not hide unrelated warnings from concurrent requests.
 */
const ociRequestScope=new AsyncLocalStorage<boolean>();
const SDK_RETRY_PREFIXES=[
  "Request cannot be retried. Not Retrying. Exception occurred :",
  "Request failed with Exception :",
  "All retry attempts have exhausted."
] as const;

export function isOciSdkRetryWarning(args:readonly unknown[]):boolean {
  return typeof args[0]==="string" &&
    SDK_RETRY_PREFIXES.some(prefix=>(args[0] as string).startsWith(prefix));
}

let guardInstalled=false;
export function installOciRetryLogGuard():void {
  if(guardInstalled)return;
  guardInstalled=true;
  const previousWarn=console.warn;
  console.warn=function(...args:unknown[]):void {
    if(ociRequestScope.getStore()===true && isOciSdkRetryWarning(args))return;
    previousWarn.apply(console,args);
  };
}

export function withPrivateOciLogs<T>(invoke:()=>Promise<T>):Promise<T> {
  installOciRetryLogGuard();
  return ociRequestScope.run(true,invoke);
}

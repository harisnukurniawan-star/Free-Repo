import "server-only";
import {createHmac, scryptSync, timingSafeEqual} from "node:crypto";
import {VideoEngineError} from "./video-engine";
import {nativeStorageEnabled,nativeCredentialsConfigured} from "./ai-room-native-objects";

export const SESSION_COOKIE = "ai_room_session";
const SESSION_SECONDS = 24 * 60 * 60;
const USER_ID = /^[a-z0-9][a-z0-9_-]{2,39}$/;
type UserRecord = {id:string;salt:string;passwordHash:string};

export function privateVideoEnabled(): boolean {
  return process.env.AI_ROOM_STORAGE_MODE === "oci";
}
export function privateVideoConfigured(): boolean {
  return Boolean(
    process.env.AI_ROOM_SESSION_SECRET && process.env.AI_ROOM_SESSION_SECRET.length >= 32 &&
    process.env.AI_ROOM_OCI_BUCKET_PRIVACY_VERIFIED === "true" &&
    process.env.AI_ROOM_USERS_JSON &&
    process.env.AI_ROOM_OCI_NAMESPACE && process.env.AI_ROOM_OCI_BUCKET &&
    (nativeStorageEnabled()?nativeCredentialsConfigured():
      (process.env.AI_ROOM_OCI_ACCESS_KEY_ID && process.env.AI_ROOM_OCI_SECRET_ACCESS_KEY))
  );
}
function secret(): string {
  const value = process.env.AI_ROOM_SESSION_SECRET;
  if (!value || value.length < 32) throw new VideoEngineError("Private video login is not configured.",503,false);
  return value;
}
function users(): UserRecord[] {
  try {
    const value:unknown = JSON.parse(process.env.AI_ROOM_USERS_JSON || "[]");
    if (!Array.isArray(value) || value.length === 0 || value.length > 25) throw new Error("No users");
    const users = value as UserRecord[];
    const ids = new Set<string>();
    for (const user of users) {
      if (!user || typeof user.id !== "string" || !USER_ID.test(user.id) ||
          !/^[a-f0-9]{32,128}$/i.test(user.salt) ||
          !/^[a-f0-9]{128}$/i.test(user.passwordHash) || ids.has(user.id)) {
        throw new Error("Invalid user record");
      }
      ids.add(user.id);
    }
    return users;
  } catch {
    throw new VideoEngineError("Private video user accounts are not configured.",503,false);
  }
}
export function verifyPassword(id: string, password: string): string | null {
  if (!privateVideoConfigured()) throw new VideoEngineError("Private video storage is not configured.",503,false);
  if (typeof id !== "string" || typeof password !== "string" || id.length > 40 || password.length > 512) return null;
  const user = users().find(row => row.id === id);
  // Derive even for an unknown user, limiting observable account-enumeration differences.
  const salt = user?.salt || "f".repeat(32);
  const known = Buffer.from(user?.passwordHash || "0".repeat(128),"hex");
  const actual = scryptSync(password,salt,64,{N:16384,r:8,p:1,maxmem:64 * 1024 * 1024});
  return timingSafeEqual(known,actual) && user ? user.id : null;
}
function mac(payload: string): string {
  return createHmac("sha256",secret()).update(payload).digest("base64url");
}
export function makeSession(id: string, now = Date.now()): string {
  if (!users().some(user=>user.id===id)) throw new VideoEngineError("Unknown private video user.",401,false);
  const payload = Buffer.from(JSON.stringify({id, exp:Math.floor(now/1000)+SESSION_SECONDS})).toString("base64url");
  return payload + "." + mac(payload);
}
export function readSession(token: string | undefined, now=Date.now()): string | null {
  if (!token || token.length > 4096) return null;
  const parts=token.split(".");
  if (parts.length !== 2 || !/^[\w-]+$/.test(parts[0]) || !/^[\w-]+$/.test(parts[1])) return null;
  const expected=Buffer.from(mac(parts[0]));
  const actual=Buffer.from(parts[1]);
  if (expected.length !== actual.length || !timingSafeEqual(expected,actual)) return null;
  try {
    const value:unknown=JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8"));
    if (!value || typeof value!=="object" || Array.isArray(value)) return null;
    const data=value as {id?:unknown;exp?:unknown};
    if (typeof data.id!=="string" || !USER_ID.test(data.id) ||
      typeof data.exp!=="number" || !Number.isInteger(data.exp) || data.exp<=Math.floor(now/1000)) return null;
    return users().some(user=>user.id===data.id)?data.id:null;
  } catch { return null; }
}
export function requirePrivateUser(request:Request): string {
  if (!privateVideoConfigured()) throw new VideoEngineError("Private video storage is not configured.",503,false);
  const cookie=(request.headers.get("cookie") || "").split(";").map(v=>v.trim())
    .find(v=>v.startsWith(SESSION_COOKIE+"="))?.slice(SESSION_COOKIE.length+1);
  let token:string|undefined;
  try { token=cookie?decodeURIComponent(cookie):undefined; } catch { return unauthorized(); }
  const id=readSession(token);
  if (!id) return unauthorized();
  return id;
}
function unauthorized():never {
  throw new VideoEngineError("Sign in to your private AI ROOM account.",401,false);
}
export function requireSameOrigin(request:Request):void {
  const origin=request.headers.get("origin");
  // Mutating browser requests always supply Origin; rejecting missing Origin also blocks CSRF form fallbacks.
  if (!origin || origin === "null" || origin !== new URL(request.url).origin) {
    throw new VideoEngineError("Cross-origin request denied.",403,false);
  }
}
export function sessionCookieOptions() {
  return {httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict" as const,
    path:"/",maxAge:SESSION_SECONDS};
}

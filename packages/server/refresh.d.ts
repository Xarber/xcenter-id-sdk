export interface SessionTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}
export function createSessionTokenSource<T extends SessionTokens>(options:{
  withLock:<R>(work:()=>Promise<R>)=>Promise<R>;
  load:()=>Promise<T|null>;
  save:(tokens:T)=>Promise<void>;
  refresh:(token:string)=>Promise<{access_token:string;refresh_token?:string;expires_in?:number}>;
  now?:()=>number;
  refreshWindowMs?:number;
}):()=>Promise<string>;

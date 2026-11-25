import type {Options, RevisionOptions, UserInfo} from '@xcenter-id/client';
export * from './data.js';
export * from './refresh.js';

export interface ServerConfigOptions {
  clientId?:string;clientSecret?:string;redirectUri?:string;databaseKey?:string;file?:string|URL|false;
  env?:Record<string,string|undefined>;scopes?:Scope[];promptConsent?:boolean;allowLoopback?:boolean;
}
export function loadXCenterConfig(options?:ServerConfigOptions):ServerConfigOptions & {clientId:string;scopes:Scope[]};
export const issuer: 'https://id.xcenter.it';
export type Scope = 'openid' | 'profile' | 'email' | 'age_range' | 'app_data' | 'friends' | 'offline_access' |
  'files_read' | 'files_write' | 'shared_files_read';
export interface LoginTransaction {state:string;nonce:string;verifier:string;expiresAt:number}
export interface DeviceTransaction {nonce:string;expiresAt:number;response:{device_code:string;expires_in:number;interval?:number}}
export interface Tokens {
  access_token:string;id_token?:string;refresh_token?:string;expires_in?:number;scope?:string;token_type:string;
}
export function redirectURL(value:string|URL):URL;
export function validateCallback(value:string|URL, redirect:URL):URL;
export function createXCenterOIDC(options?:ServerConfigOptions):Promise<{
  begin():Promise<{url:URL;transaction:LoginTransaction}>;
  complete(callback:string|URL,transaction:LoginTransaction):Promise<{tokens:Tokens;identity:UserInfo}>;
  beginDevice():Promise<{userCode:string;verificationUrl:string;transaction:DeviceTransaction}>;
  completeDevice(transaction:DeviceTransaction,options?:Options):Promise<{tokens:Tokens;identity:UserInfo}>;
  userInfo(accessToken:string,subject:string):Promise<UserInfo>;
  refresh(refreshToken:string):Promise<Tokens>;
  issuerSignOutURL():URL;
  revoke(token:string,tokenTypeHint?:'access_token'|'refresh_token'):Promise<void>;
}>;
export interface SavedPlaceWrite {label:string;latitude:number;longitude:number}
export interface SavedPlace extends SavedPlaceWrite {id:string;revision:number}
export function createSavedPlacesClient(options:{getAccessToken:()=>string|Promise<string>;fetch?:typeof fetch}):{
  list(options?:Options & {source?:string;after?:string}):Promise<{records:SavedPlace[];nextCursor?:string|null}>;
  create(body:SavedPlaceWrite,options?:Options):Promise<SavedPlace>;
  update(id:string,body:SavedPlaceWrite,options:RevisionOptions):Promise<SavedPlace>;
  delete(id:string,options?:Options):Promise<{deleted:true}>;
};

export const issuer: 'https://id.xcenter.it';
export class XCenterError extends Error {
  status: number;
  body: unknown;
  retryAfter: string | null;
}
export type Json = null | boolean | number | string | Json[] | {[key:string]:Json};
export interface Options {signal?: AbortSignal}
export interface PageOptions extends Options {cursor?: string}
export interface RevisionOptions extends Options {revision: number}
export interface RecordWrite<T extends Json = Json> {data: T; public: boolean; readers?: string[]}
export interface StoredRecord<T extends Json = Json> {id: string; revision: number; public: boolean; data: T; shared?: boolean}
export interface RecordPage<T extends Json = Json> {records: StoredRecord<T>[]; nextCursor?: string | null}
export interface Records {
  list<T extends Json = Json>(collection:string, options?:PageOptions):Promise<RecordPage<T>>;
  get<T extends Json = Json>(collection:string, id:string, options?:Options):Promise<StoredRecord<T>>;
  put<T extends Json = Json>(collection:string, id:string, body:RecordWrite<T>, options:RevisionOptions):Promise<Omit<StoredRecord<T>,'data'|'shared'>>;
  delete(collection:string, id:string, options:RevisionOptions):Promise<{ok:true}>;
}
export type Profile = {username:string;givenName?:string;surname?:string;avatar?:string|null;verified?:boolean;admin?:boolean};
export type UserInfo = {sub:string;name?:string;given_name?:string;family_name?:string;preferred_username?:string;picture?:string;email?:string;email_verified?:boolean;age_range?:'child'|'teen'|'adult'};
export type FileEntry = {id:string;name:string;size:number;created:number};
export type Folder = {id:string;name:string};
export interface PublicClient {
  discover(options?:Options):Promise<Record<string,unknown>>;
  profile(username:string, options?:Options):Promise<Profile>;
  avatarUrl(username:string):string;
  avatar(username:string,options?:Options):Promise<Response>;
  appIconUrl(registrationId:string):string;
  appIcon(registrationId:string,options?:Options):Promise<Response>;
  listRecords<T extends Json = Json>(client:string,collection:string,options?:PageOptions):Promise<RecordPage<T>>;
  getRecord<T extends Json = Json>(client:string,collection:string,id:string,options?:Options):Promise<StoredRecord<T>>;
}
export interface UserClient {
  userInfo(options?:Options):Promise<UserInfo>;
  avatar(options?:Options):Promise<Response>;
  friends(options?:Options):Promise<{friends:{username:string;sub?:string}[]}>;
  records:Records;
  sharedRecords:{
    list<T extends Json = Json>(client:string,collection:string,options?:PageOptions):Promise<RecordPage<T>>;
    get<T extends Json = Json>(client:string,collection:string,id:string,options?:Options):Promise<StoredRecord<T>>;
  };
  files:{
    list(options?:Options & {folder?:string|null}):Promise<{files:FileEntry[];folders:Folder[];breadcrumbs:Folder[]}>;
    download(id:string,options?:Options):Promise<Response>;
    upload(file:{name:string;content:string;folder?:string|null},options?:Options):Promise<{id:string}>;
    update(id:string,change:{name?:string;folder?:string|null},options?:Options):Promise<{ok:true}>;
    delete(id:string,options?:Options):Promise<{ok:true}>;
    createFolder(folder:{name:string;folder?:string|null},options?:Options):Promise<{id:string}>;
    updateFolder(id:string,change:{name?:string;folder?:string|null},options?:Options):Promise<{ok:true}>;
    deleteFolder(id:string,options?:Options):Promise<{ok:true}>;
    listShared(options?:Options):Promise<{incoming:(FileEntry & {from:string})[]}>;
    downloadShared(id:string,options?:Options):Promise<Response>;
  };
}
export function createPublicClient(options?:{fetch?:typeof fetch}):PublicClient;
export function createUserClient(options:{clientId:string;getAccessToken:()=>string|Promise<string>;fetch?:typeof fetch}):UserClient;
export function createTransport(options?:{getAccessToken?:()=>string|Promise<string>;fetch?:typeof fetch}):
  (path:string,options?:Options & {method?:string;body?:Json;revision?:number;binary?:boolean})=>Promise<unknown>;
export function createRecords(request:ReturnType<typeof createTransport>,clientId:string):Records;

export const scopes: readonly ['openid','profile','email','age_range','app_data','friends','offline_access','files_read','files_write','shared_files_read'];
export type PublicScope = (typeof scopes)[number];
export interface OAuthTransaction {state:string;nonce:string;verifier:string;expiresAt:number}
export interface PublicTokens {access_token:string;token_type:string;id_token?:string;refresh_token?:string;expires_in?:number;scope?:string}
export function createPublicOAuthClient(options:PublicConfigOptions & {
  fetch?:typeof fetch;crypto?:Crypto;verifyRS256?:(jwt:string,key:JsonWebKey)=>boolean|Promise<boolean>;now?:()=>number;
}):{
  begin(options?:{scopes?:readonly PublicScope[];promptConsent?:boolean}):Promise<{url:URL;transaction:OAuthTransaction}>;
  complete(callback:string|URL,transaction:OAuthTransaction,options?:Options):Promise<{tokens:PublicTokens;identity:UserInfo}>;
  refresh(refreshToken:string,subject:string,options?:Options):Promise<{tokens:PublicTokens;identity:UserInfo}>;
  issuerSignOutURL():URL;
};
export interface PublicConfigOptions {
  clientId?:string;redirectUri?:string;scopes?:readonly PublicScope[];
  config?:Record<string,unknown>;env?:{XCENTER_CLIENT_ID?:string;XCENTER_REDIRECT_URI?:string};
}
export function publicConfig(options?:PublicConfigOptions):{clientId:string;redirectUri?:string;scopes:readonly PublicScope[]};
export function loadPublicConfig(options?:PublicConfigOptions & {file?:string;fetch?:typeof fetch}):Promise<ReturnType<typeof publicConfig>>;

export {createSessionTokenSource, type SessionTokens} from "./session.js";

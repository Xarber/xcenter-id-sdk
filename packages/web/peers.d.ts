import type {UserClient} from '@xcenter-id/client';

export interface IncomingPeer {
  peerId:string;
  kind:'media'|'data';
}
export interface AcceptPeer {
  stream?:MediaStream;
  onConnection?:(connection:RTCPeerConnection,close:()=>void)=>void;
}
export interface PeerConnections {
  id:string;
  listDiscoverablePeers():Promise<string[]>;
  connect(peerId:string,options?:{stream?:MediaStream;dataLabel?:string;onConnection?:(connection:RTCPeerConnection)=>void}):
    Promise<{connection:RTCPeerConnection;channel?:RTCDataChannel;close:()=>void}>;
  close():Promise<void>;
}
export function openPeerConnections(user:Pick<UserClient,'peers'>,options?:{
  discoverable?:boolean;
  configuration?:RTCConfiguration;
  onInvite?:(invite:IncomingPeer)=>false|AcceptPeer|Promise<false|AcceptPeer>;
  onError?:(error:unknown)=>void;
}):Promise<PeerConnections>;
export function sendPeerFile(channel:RTCDataChannel,file:Blob,options?:{
  signal?:AbortSignal;
  onProgress?:(sent:number,total:number)=>void;
}):Promise<void>;

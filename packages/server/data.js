import {loadXCenterConfig} from './config.js';
import {createAppFiles, createRecords, createTransport} from '@xcenter-id/client';
export {createPublicClient, createUserClient, XCenterError} from '@xcenter-id/client';

export function createServiceClient(options) {
  const {fetch,...settings}=options??{};
  const {clientId,databaseKey}=loadXCenterConfig(settings);
  if (typeof clientId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(clientId)) {
    throw new TypeError('Configure the registered client ID.');
  }
  if (typeof databaseKey !== 'string' || !/^xid-db-[A-Za-z0-9_-]{43}$/.test(databaseKey)) {
    throw new TypeError('Configure the verified app database key.');
  }
  const request=createTransport({fetch,getAccessToken:()=>databaseKey});
  return {records:createRecords(request,clientId),files:createAppFiles(request,clientId,true)};
}

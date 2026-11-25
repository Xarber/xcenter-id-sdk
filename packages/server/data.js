import {createRecords, createTransport} from '@xcenter-id/client';
export {createPublicClient, createUserClient, XCenterError} from '@xcenter-id/client';

export function createServiceClient({clientId, databaseKey, fetch}) {
  if (typeof clientId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(clientId)) {
    throw new TypeError('Configure the registered client ID.');
  }
  if (typeof databaseKey !== 'string' || !/^xid-db-[A-Za-z0-9_-]{43}$/.test(databaseKey)) {
    throw new TypeError('Configure the verified app database key.');
  }
  return {records:createRecords(createTransport({fetch, getAccessToken:()=>databaseKey}), clientId)};
}

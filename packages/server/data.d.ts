import type {Records} from '@xcenter-id/client';
export {createPublicClient, createUserClient, XCenterError} from '@xcenter-id/client';
export function createServiceClient(options:{clientId:string;databaseKey:string;fetch?:typeof fetch}):{records:Records};

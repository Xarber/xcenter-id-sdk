import type {ServerConfigOptions} from './index.js';
import type {Records} from '@xcenter-id/client';
export {createPublicClient, createUserClient, XCenterError} from '@xcenter-id/client';
export function createServiceClient(options?:ServerConfigOptions & {fetch?:typeof fetch}):{records:Records};

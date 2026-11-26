import type {ServerConfigOptions} from './index.js';
import type {ContainerFiles, Records, ServiceUpload} from '@xcenter-id/client';
export {createPublicClient, createUserClient, XCenterError} from '@xcenter-id/client';
export function createServiceClient(options?:ServerConfigOptions & {fetch?:typeof fetch}):{records:Records;files:ContainerFiles<ServiceUpload>};

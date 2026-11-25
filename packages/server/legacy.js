import {createTransport} from '@xcenter-id/client';

/** Migration helper for the historical saved-place dataset. Use hosted records for new data. */
export function createSavedPlacesClient({getAccessToken, fetch}) {
  if (typeof getAccessToken !== 'function') throw new TypeError('Provide an end-user access token callback.');
  const request = createTransport({fetch, getAccessToken:async ()=>{
    const token = await getAccessToken();
    if (typeof token === 'string' && token.startsWith('xid-db-')) throw new TypeError('An end-user access token is required.');
    return token;
  }});
  const root='/v1/records/saved-place';
  const item=id=>{
    if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
      throw new TypeError('Invalid saved place ID.');
    }
    return root+'/'+id;
  };
  return {
    list:({source,after,signal}={})=>{
      const query = new URLSearchParams();
      if (source) query.set('source',source);
      if (after) query.set('after',after);
      return request(root+(query.size?'?'+query:''),{signal});
    },
    create:(body,{signal}={})=>request(root,{method:'POST',body,signal}),
    update:(id,body,{revision,signal}={})=>{
      if (!Number.isSafeInteger(revision)||revision<=0) throw new TypeError('Supply the current place revision.');
      return request(item(id),{method:'PUT',body,revision,signal});
    },
    delete:(id,{signal}={})=>request(item(id),{method:'DELETE',signal}),
  };
}

import { createPublicClient, createServiceClient, createUserClient } from '@xcenter-id/server';

const { issuer } = await createPublicClient().discover();
console.log('Connected to', issuer);

const clientId = process.env.XCENTER_CLIENT_ID;
const accessToken = process.env.XCENTER_USER_ACCESS_TOKEN;
const databaseKey = process.env.XCENTER_DATABASE_KEY;

if (clientId && accessToken) {
  const user = createUserClient({ clientId, getAccessToken: () => accessToken });
  const profile = await user.userInfo();
  console.log('UserInfo validated by issuer for a signed-in user:', Boolean(profile.sub));
}

if (clientId && databaseKey) {
  const service = createServiceClient({ clientId, databaseKey });
  const page = await service.records.list('notes');
  console.log('Service records in this page:', page.records.length);
}

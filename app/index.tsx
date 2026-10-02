import { Redirect } from 'expo-router';

import { getAuthAccessToken, getAuthUser } from '@/stores/authSession';
import { isAdminUser } from '@/utils/authRole';

export default function Index() {
  if (!getAuthAccessToken()) {
    return <Redirect href="/auth/login" />;
  }

  return <Redirect href={(isAdminUser(getAuthUser()) ? '/admin' : '/(tabs)/home') as never} />;
}

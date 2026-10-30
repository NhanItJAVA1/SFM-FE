import { Redirect } from 'expo-router';

import { getAuthAccessToken } from '@/stores/authSession';

export default function Index() {
  if (!getAuthAccessToken()) {
    return <Redirect href="/auth/login" />;
  }

  return <Redirect href="/(tabs)/home" />;
}

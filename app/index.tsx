import { Redirect } from 'expo-router';

import { getAuthAccessToken } from '@/stores/authSession';

export default function Index() {
  return <Redirect href={getAuthAccessToken() ? '/(tabs)/home' : '/auth/login'} />;
}

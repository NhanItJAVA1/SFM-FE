import { useLocalSearchParams } from 'expo-router';

import { TransferPanel } from '@/screens/transfers/transfer-panel';

export default function TransferScreen() {
  const params = useLocalSearchParams<{ fromAccountId?: string; view?: string }>();
  return <TransferPanel initialFromAccountId={Number(params.fromAccountId) || undefined} initialView={params.view === 'history' ? 'history' : 'create'} />;
}

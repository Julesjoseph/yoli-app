import AppTabs from '@/components/app-tabs';
import { useBusiness } from '@/hooks/use-business';

export default function TabsLayout() {
  const ctx = useBusiness();
  return <AppTabs role={ctx.role} />;
}

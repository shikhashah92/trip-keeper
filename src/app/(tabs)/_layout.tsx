import { useEffect } from 'react';
import { useWindowDimensions } from 'react-native';
import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore, useTheme } from '../../store';
import { MAX_WIDTH } from '../../ui';
import { backupDue } from '../../model';
import { offerUnreadable } from '../../backupActions';
import { sans } from '../../theme';

type Icon = keyof typeof Ionicons.glyphMap;
const TABS: { name: string; title: string; icon: Icon; on: Icon }[] = [
  { name: 'index', title: 'Today', icon: 'sunny-outline', on: 'sunny' },
  { name: 'plan', title: 'Itinerary', icon: 'calendar-outline', on: 'calendar' },
  { name: 'bookings', title: 'Bookings', icon: 'briefcase-outline', on: 'briefcase' },
  { name: 'expenses', title: 'Expenses', icon: 'wallet-outline', on: 'wallet' },
  { name: 'more', title: 'More', icon: 'ellipsis-horizontal-circle-outline', on: 'ellipsis-horizontal-circle' },
];

export default function TabsLayout() {
  const { c } = useTheme();
  const narrow = useWindowDimensions().width < 360; // e.g. iPhone SE: smaller labels so "Bookings" fits
  const { bottom } = useSafeAreaInsets(); // home-indicator space in the installed app; 0 in a browser tab
  const { log, replace } = useStore();
  const due = !!log && backupDue(log);
  // Data "Start fresh" set aside because it wouldn't open: offer it back once this version can read it.
  useEffect(() => { offerUnreadable(replace).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Tabs screenOptions={({ navigation, route }) => ({
      headerShown: false,
      tabBarActiveTintColor: c.accent,
      tabBarInactiveTintColor: c.muted,
      // On a wide screen the bar stays as wide as the content column above it.
      tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border, height: 70 + bottom, paddingBottom: bottom, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
      tabBarLabelPosition: 'below-icon',
      tabBarItemStyle: { paddingTop: 6, paddingBottom: 8 },
      tabBarLabelStyle: { fontSize: narrow ? 11 : 13, lineHeight: 18, fontWeight: '600', fontFamily: sans },
      // Tabs you're not on stay mounted (they keep their scroll) but are hidden, so screen readers and Tab skip them.
      sceneStyle: { backgroundColor: c.bg, display: navigation.getState().routes[navigation.getState().index]?.key === route.key ? 'flex' : 'none' },
    })}>
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{
          title: t.title,
          // A dot on More when a backup is overdue (Backup, from More, is where you save one).
          ...(t.name === 'more' && due ? { tabBarBadge: '', tabBarBadgeStyle: { backgroundColor: c.warnText, minWidth: 10, height: 10, borderRadius: 5, top: 4 } } : {}),
          tabBarIcon: ({ color, focused, size }) => <Ionicons name={focused ? t.on : t.icon} size={size} color={color} />,
        }} />
      ))}
    </Tabs>
  );
}

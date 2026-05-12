import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const T = { bg:'#060914', surface:'#0C1220', accent:'#5EE7B7', muted:'#3A4F6A', border:'rgba(255,255,255,.06)' };

export default function TabLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: T.surface, borderTopColor: T.border, borderTopWidth: 1, height: 80, paddingBottom: 20 },
      tabBarActiveTintColor: T.accent,
      tabBarInactiveTintColor: T.muted,
      tabBarLabelStyle: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },
    }}>
      <Tabs.Screen name="index"   options={{ title:'Hjem',     tabBarIcon:({color})=><Ionicons name="home-outline"      size={24} color={color}/> }}/>
      <Tabs.Screen name="plan"    options={{ title:'Plan',     tabBarIcon:({color})=><Ionicons name="calendar-outline"  size={24} color={color}/> }}/>
      <Tabs.Screen name="alarm"   options={{ title:'Alarm',    tabBarIcon:({color})=><Ionicons name="alarm-outline"     size={24} color={color}/> }}/>
      <Tabs.Screen name="analyse" options={{ title:'Analyse',  tabBarIcon:({color})=><Ionicons name="stats-chart-outline" size={24} color={color}/> }}/>
      <Tabs.Screen name="profil"  options={{ title:'Profil',   tabBarIcon:({color})=><Ionicons name="person-outline"    size={24} color={color}/> }}/>
    </Tabs>
  );
}

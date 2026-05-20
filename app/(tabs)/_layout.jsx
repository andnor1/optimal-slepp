import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const T = { bg:'#060914', surface:'#0C1220', accent:'#5EE7B7', muted:'#3A4F6A', border:'rgba(255,255,255,.06)' };

export default function TabLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: {
        backgroundColor: T.surface,
        borderTopColor: T.border,
        borderTopWidth: 1,
        height: 74,
        paddingBottom: 14,
      },
      tabBarActiveTintColor: T.accent,
      tabBarInactiveTintColor: T.muted,
      tabBarLabelStyle: { fontSize: 9, fontWeight: '600', letterSpacing: 0.3 },
    }}>
      <Tabs.Screen name="index"    options={{ title:'Home',     tabBarIcon:({color})=><Ionicons name="home-outline"        size={22} color={color}/> }}/>
      <Tabs.Screen name="plan"     options={{ title:'Schedule', tabBarIcon:({color})=><Ionicons name="calendar-outline"    size={22} color={color}/> }}/>
      <Tabs.Screen name="nap"      options={{ title:'Nap',      tabBarIcon:({color})=><Ionicons name="timer-outline"       size={22} color={color}/> }}/>
      <Tabs.Screen name="alarm"    options={{ title:'Alarm',    tabBarIcon:({color})=><Ionicons name="alarm-outline"       size={22} color={color}/> }}/>
      <Tabs.Screen name="analyse"  options={{ title:'Analysis', tabBarIcon:({color})=><Ionicons name="stats-chart-outline" size={22} color={color}/> }}/>
      <Tabs.Screen name="coaching" options={{ title:'Coaching', tabBarIcon:({color})=><Ionicons name="bulb-outline"        size={22} color={color}/> }}/>
      <Tabs.Screen name="profil"   options={{ title:'Profile',  tabBarIcon:({color})=><Ionicons name="person-outline"      size={22} color={color}/> }}/>
    </Tabs>
  );
}

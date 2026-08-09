import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, useColorScheme } from 'react-native';

import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { ThemedView } from '@/components/themed-view';

// Guards every route: while a session is loading, show a spinner.
// Once loaded, redirect logged-out users to /login (and away from
// /login|/register once they ARE logged in), based on which route
// segment they're currently on.
function RootNavigator() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const currentSegment = segments[0];
    const isOnAuthScreen = currentSegment === 'login' || currentSegment === 'register';

    if (!user && !isOnAuthScreen) {
      router.replace('/login');
    } else if (user && isOnAuthScreen) {
      router.replace('/');
    }
  }, [user, isLoading, segments, router]);

  if (isLoading) {
    return (
      <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ title: 'התחברות', headerShown: false }} />
      <Stack.Screen name="register" options={{ title: 'הרשמה', headerShown: false }} />
      <Stack.Screen name="layer/[id]/index" options={{ title: 'שכבה' }} />
      <Stack.Screen name="layer/[id]/schedule" options={{ title: 'לוח שבועי' }} />
      <Stack.Screen name="layer/[id]/calendar" options={{ title: 'לוח שנה' }} />
      <Stack.Screen name="profile" options={{ title: 'הגדרות' }} />
      <Stack.Screen name="activities/index" options={{ title: 'מאגר פעילויות' }} />
      <Stack.Screen name="activities/new" options={{ title: 'פעילות חדשה' }} />
      <Stack.Screen name="activities/[id]" options={{ title: 'פעילות' }} />
      <Stack.Screen name="year" options={{ title: 'תצוגת שנה' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}

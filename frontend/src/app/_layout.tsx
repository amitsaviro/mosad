import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import Head from 'expo-router/head';
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
      <Stack.Screen name="layer/[id]/schedule" options={{ title: 'לוח' }} />
      <Stack.Screen name="layer/[id]/attendance" options={{ title: 'נוכחות' }} />
      <Stack.Screen name="layer/[id]/chat" options={{ title: 'צ׳אט' }} />
      <Stack.Screen name="layer/[id]/trips/index" options={{ title: 'תיקי טיול' }} />
      <Stack.Screen name="layer/[id]/trips/[tripId]" options={{ title: 'תיק טיול' }} />
      <Stack.Screen name="profile" options={{ title: 'הגדרות' }} />
      <Stack.Screen name="activities/index" options={{ title: 'מאגר פעילויות' }} />
      <Stack.Screen name="activities/new" options={{ title: 'פעילות חדשה' }} />
      <Stack.Screen name="activities/[id]" options={{ title: 'פעילות' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Head>
        <title>Instructor</title>
      </Head>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}

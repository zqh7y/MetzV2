import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Text, ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { Poppins_600SemiBold, Poppins_700Bold, Poppins_800ExtraBold } from "@expo-google-fonts/poppins";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from "@expo-google-fonts/space-grotesk";
import { FONTS } from "./src/styles/fonts";

import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import LoginScreen from "./src/screens/LoginScreen";
import SignupScreen from "./src/screens/SignupScreen";
import VerifyScreen from "./src/screens/VerifyScreen";
import HomeScreen from "./src/screens/HomeScreen";
import CreateScreen from "./src/screens/CreateScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import AdminPendingScreen from "./src/screens/AdminPendingScreen";
import MeetingDetailScreen from "./src/screens/MeetingDetailScreen";
import UserProfileScreen from "./src/screens/UserProfileScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import EditProfileScreen from "./src/screens/EditProfileScreen";
import AdminDashboardScreen from "./src/screens/AdminDashboardScreen";
import ExploreScreen from "./src/screens/ExploreScreen";
import ActivityScreen from "./src/screens/ActivityScreen";

const AuthStack = createNativeStackNavigator();
const RootStack = createNativeStackNavigator();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Signup" component={SignupScreen} />
      <AuthStack.Screen name="Verify" component={VerifyScreen} />
    </AuthStack.Navigator>
  );
}

function MainNavigator() {
  const { theme } = useTheme();

  // One flat stack, no tab bar: the web dropped its bottom nav in favour of
  // the hamburger drawer on Home, and this mirrors that. Create and Profile
  // are pushed screens reached from the drawer, so they keep a back header.
  return (
    <RootStack.Navigator
      screenOptions={{
        animation: "slide_from_right",
        headerStyle: { backgroundColor: theme.surface },
        headerTintColor: theme.text,
        headerTitleStyle: { fontFamily: FONTS.heading, fontSize: 17 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.bg },
      }}
    >
      <RootStack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      {/* Title left empty on purpose: Create draws its own header (the web's
          .create-header), so a nav title too would say the same thing twice.
          The header stays mounted for the back chevron. */}
      <RootStack.Screen name="Create" component={CreateScreen} options={{ title: "" }} />
      <RootStack.Screen name="Explore" component={ExploreScreen} options={{ title: "Explore" }} />
      <RootStack.Screen name="Activity" component={ActivityScreen} options={{ title: "Activity" }} />
      <RootStack.Screen name="Profile" component={ProfileScreen} options={{ title: "My profile" }} />
      <RootStack.Screen name="MeetingDetail" component={MeetingDetailScreen} options={{ title: "Meeting" }} />
      <RootStack.Screen name="AdminPending" component={AdminPendingScreen} options={{ title: "Pending Meetings" }} />
      <RootStack.Screen name="UserProfile" component={UserProfileScreen} options={{ title: "Profile" }} />
      <RootStack.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
      <RootStack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: "Edit profile" }} />
      <RootStack.Screen name="AdminDashboard" component={AdminDashboardScreen} options={{ title: "Dashboard" }} />
    </RootStack.Navigator>
  );
}

function Root() {
  const { uid, booting } = useAuth();
  const { theme, scheme, loaded } = useTheme();

  // Wait for the saved preference as well as the session, or the first frame
  // flashes light before a dark-mode user's choice lands.
  if (booting || !loaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg }}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer
      theme={{
        dark: scheme === "dark",
        colors: {
          primary: theme.accent,
          background: theme.bg,
          card: theme.surface,
          text: theme.text,
          border: theme.border,
          notification: theme.accent,
        },
      }}
    >
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      {uid ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });

  if (!fontsLoaded) {
    // Before the theme provider mounts there is nothing to read a colour from,
    // so this one splash uses the light background token literally.
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#eef1f5" }}>
        <ActivityIndicator size="large" color="#0d9c8a" />
      </View>
    );
  }

  // Give every <Text> the body font by default; headings/numbers/buttons
  // override it explicitly where they want Poppins or Space Grotesk.
  Text.defaultProps = Text.defaultProps || {};
  Text.defaultProps.style = [{ fontFamily: FONTS.body }, Text.defaultProps.style];

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <Root />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

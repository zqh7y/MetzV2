import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text, ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { Poppins_600SemiBold, Poppins_700Bold } from "@expo-google-fonts/poppins";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from "@expo-google-fonts/space-grotesk";
import { FONTS } from "./src/styles/fonts";

import { AuthProvider, useAuth } from "./src/context/AuthContext";
import LoginScreen from "./src/screens/LoginScreen";
import SignupScreen from "./src/screens/SignupScreen";
import VerifyScreen from "./src/screens/VerifyScreen";
import HomeScreen from "./src/screens/HomeScreen";
import DiscoverScreen from "./src/screens/DiscoverScreen";
import CreateScreen from "./src/screens/CreateScreen";
import JoinedScreen from "./src/screens/JoinedScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import AdminPendingScreen from "./src/screens/AdminPendingScreen";
import MeetingDetailScreen from "./src/screens/MeetingDetailScreen";
import UserProfileScreen from "./src/screens/UserProfileScreen";
import CustomTabBar from "./src/components/CustomTabBar";

const AuthStack = createNativeStackNavigator();
const RootStack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Signup" component={SignupScreen} />
      <AuthStack.Screen name="Verify" component={VerifyScreen} />
    </AuthStack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tabs.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="Discover" component={DiscoverScreen} />
      <Tabs.Screen name="Create" component={CreateScreen} />
      <Tabs.Screen name="Joined" component={JoinedScreen} />
      <Tabs.Screen name="Profile" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

function MainNavigator() {
  return (
    <RootStack.Navigator screenOptions={{ animation: "slide_from_right" }}>
      <RootStack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
      <RootStack.Screen name="MeetingDetail" component={MeetingDetailScreen} options={{ title: "Meeting" }} />
      <RootStack.Screen name="AdminPending" component={AdminPendingScreen} options={{ title: "Pending Meetings" }} />
      <RootStack.Screen name="UserProfile" component={UserProfileScreen} options={{ title: "Profile" }} />
    </RootStack.Navigator>
  );
}

function Root() {
  const { uid, booting } = useAuth();

  if (booting) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#667eea" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {uid ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Poppins_600SemiBold,
    Poppins_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#667eea" />
      </View>
    );
  }

  // Give every <Text> the body font by default; headings/numbers/buttons
  // override it explicitly where they want Poppins or Space Grotesk.
  Text.defaultProps = Text.defaultProps || {};
  Text.defaultProps.style = [{ fontFamily: FONTS.body }, Text.defaultProps.style];

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text, ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";

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

const AuthStack = createNativeStackNavigator();
const RootStack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Signup" component={SignupScreen} />
      <AuthStack.Screen name="Verify" component={VerifyScreen} />
    </AuthStack.Navigator>
  );
}

function TabIcon({ label }) {
  return <Text style={{ fontSize: 18 }}>{label}</Text>;
}

function MainTabs() {
  return (
    <Tabs.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: "#667eea" }}>
      <Tabs.Screen name="Home" component={HomeScreen} options={{ tabBarIcon: () => <TabIcon label="🏠" /> }} />
      <Tabs.Screen name="Discover" component={DiscoverScreen} options={{ tabBarIcon: () => <TabIcon label="🧭" /> }} />
      <Tabs.Screen name="Create" component={CreateScreen} options={{ tabBarIcon: () => <TabIcon label="➕" /> }} />
      <Tabs.Screen name="Joined" component={JoinedScreen} options={{ tabBarIcon: () => <TabIcon label="🤝" /> }} />
      <Tabs.Screen name="Profile" component={ProfileScreen} options={{ tabBarIcon: () => <TabIcon label="👤" /> }} />
    </Tabs.Navigator>
  );
}

function MainNavigator() {
  return (
    <RootStack.Navigator>
      <RootStack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
      <RootStack.Screen name="MeetingDetail" component={MeetingDetailScreen} options={{ title: "Meeting" }} />
      <RootStack.Screen name="AdminPending" component={AdminPendingScreen} options={{ title: "Pending Meetings" }} />
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
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Root />
    </AuthProvider>
  );
}

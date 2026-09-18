import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Text, ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { Outfit_600SemiBold, Outfit_700Bold, Outfit_800ExtraBold } from "@expo-google-fonts/outfit";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from "@expo-google-fonts/space-grotesk";
import { FONTS } from "./src/styles/fonts";

import { IS_HOST } from "./src/variant";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { LocaleProvider, useI18n } from "./src/context/LocaleContext";
import { LocationProvider } from "./src/context/LocationContext";
import LoginScreen from "./src/screens/LoginScreen";
import SignupScreen from "./src/screens/SignupScreen";
import ForgotPasswordScreen from "./src/screens/ForgotPasswordScreen";
import HomeScreen from "./src/screens/HomeScreen";
import WelcomeScreen from "./src/screens/WelcomeScreen";
import IntroScreen from "./src/screens/IntroScreen";
import { hasSeenIntro } from "./src/intro";
import CreateScreen from "./src/screens/CreateScreen";
import MeetingCreatedScreen from "./src/screens/MeetingCreatedScreen";
import MeetingInsightsScreen from "./src/screens/MeetingInsightsScreen";
import HostDashboardScreen from "./src/screens/HostDashboardScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import HostAuthScreen from "./src/screens/HostAuthScreen";
import HostHomeScreen from "./src/screens/HostHomeScreen";
import EditProfileScreen from "./src/screens/EditProfileScreen";
import AdminPendingScreen from "./src/screens/AdminPendingScreen";
import MeetingDetailScreen from "./src/screens/MeetingDetailScreen";
import UserProfileScreen from "./src/screens/UserProfileScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import AdminDashboardScreen from "./src/screens/AdminDashboardScreen";
import AdminReportsScreen from "./src/screens/AdminReportsScreen";
import InboxScreen from "./src/screens/InboxScreen";
import ErrorBoundary from "./src/components/ErrorBoundary";
import BrandSplash from "./src/components/BrandSplash";
import { AlertHost } from "./src/components/AppAlert";

const AuthStack = createNativeStackNavigator();
const RootStack = createNativeStackNavigator();

function AuthNavigator({ showIntro }) {
  // "Create a new account" from the logout sheet lands straight on Signup;
  // everything else opens on Login. A brand-new install goes to the intro
  // first, which explains what this is before asking anyone to sign up for it.
  const { authLanding } = useAuth();
  const initial = showIntro ? "Intro" : (authLanding === "Signup" ? "Signup" : "Login");
  return (
    <AuthStack.Navigator
      initialRouteName={initial}
      screenOptions={{ headerShown: false, animation: "slide_from_right" }}
    >
      <AuthStack.Screen name="Intro" component={IntroScreen} />
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Signup" component={SignupScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </AuthStack.Navigator>
  );
}

/**
 * Metz Host: one way in, and it is Google.
 *
 * No intro, no signup, no password reset — a Host account is made by signing
 * in with Google, and the three screens behind this are the whole app. See
 * HostAuthScreen for why an email form still exists in development.
 */
function HostAuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
      <AuthStack.Screen name="Login" component={HostAuthScreen} />
    </AuthStack.Navigator>
  );
}

/**
 * Host's two screens, plus the places they lead.
 *
 * There is no Profile here. Once the light app had taken off it everything it
 * cannot do, what was left was an avatar and two buttons that both went
 * somewhere else — and Settings already held all of it: the address you signed
 * in with, the edit form, the way out, and deletion. A screen whose whole job
 * is to forward you to another screen is a tap, not a destination, so the
 * avatar in Host's top bar opens Settings directly.
 *
 * That makes the edit form a route again, which is how it started: it takes an
 * optional `onDone`, and without one it saves and pops like any other screen.
 * The full app still hosts it inside Profile, where a back gesture has a
 * profile to fall back to.
 *
 * Everything else the full app registers is deliberately absent: no map, no
 * Explore, no inbox, no moderation.
 *
 * Not registering them makes Host simple; it does not make it small. Metro does
 * not tree-shake, so every screen imported at the top of this file is in both
 * bundles whether or not a navigator can reach it. Cutting the weight took
 * native work — one architecture instead of four, R8, and dropping the dev
 * client that was quietly shipping ML Kit — not this. Splitting the bundles
 * too would need separate entry files, and the JS is 2MB of a 25MB app.
 */
function HostNavigator() {
  const { theme } = useTheme();
  const { t } = useI18n();

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
      <RootStack.Screen name="Home" component={HostHomeScreen} options={{ headerShown: false }} />
      <RootStack.Screen name="Create" component={CreateScreen} options={{ title: "" }} />
      <RootStack.Screen
        name="MeetingCreated"
        component={MeetingCreatedScreen}
        options={{ title: "", headerBackVisible: false, gestureEnabled: false }}
      />
      <RootStack.Screen
        name="MeetingInsights"
        component={MeetingInsightsScreen}
        options={{ title: t("nav.insights") }}
      />
      <RootStack.Screen name="Settings" component={SettingsScreen} options={{ title: t("nav.settings") }} />
      <RootStack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: t("nav.editProfile") }} />
    </RootStack.Navigator>
  );
}

function MainNavigator() {
  const { theme } = useTheme();
  // Reading `t` from the hook rather than the plain import is what re-titles
  // every header the moment the language changes, with no relaunch.
  const { t } = useI18n();

  // One flat stack, no tab bar: the web dropped its bottom nav in favour of
  // the hamburger drawer on Home, and this mirrors that. Create and Profile
  // are pushed screens reached from the drawer, so they keep a back header.
  //
  // The drawer lists five destinations rather than eight. Explore, Activity
  // and Edit Profile were views of something another screen already owned, so
  // each is now a part of that screen instead of a route beside it.
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
      {/* Explore, Activity and Edit Profile are no longer routes: they are a
          tab on Home's sheet, a tab on Inbox, and a section of Profile. The
          screens still exist as components — see the notes at the top of each. */}
      <RootStack.Screen name="Inbox" component={InboxScreen} options={{ title: t("nav.inbox") }} />
      <RootStack.Screen name="Profile" component={ProfileScreen} options={{ title: t("nav.myProfile") }} />
      {/* No back chevron: the create form it came from has already been
          submitted, and offering a way back to it offers a second submit.
          Every step ends in a button that leaves deliberately. */}
      <RootStack.Screen
        name="MeetingCreated"
        component={MeetingCreatedScreen}
        options={{ title: "", headerBackVisible: false, gestureEnabled: false }}
      />
      <RootStack.Screen
        name="HostDashboard"
        component={HostDashboardScreen}
        options={{ title: t("nav.hostDashboard") }}
      />
      <RootStack.Screen
        name="MeetingInsights"
        component={MeetingInsightsScreen}
        options={{ title: t("nav.insights") }}
      />
      <RootStack.Screen name="MeetingDetail" component={MeetingDetailScreen} options={{ title: t("nav.meeting") }} />
      <RootStack.Screen name="AdminPending" component={AdminPendingScreen} options={{ title: t("nav.pendingMeetings") }} />
      <RootStack.Screen name="UserProfile" component={UserProfileScreen} options={{ title: t("nav.profile") }} />
      <RootStack.Screen name="Settings" component={SettingsScreen} options={{ title: t("nav.settings") }} />
      <RootStack.Screen name="AdminDashboard" component={AdminDashboardScreen} options={{ title: t("nav.dashboard") }} />
      <RootStack.Screen name="AdminReports" component={AdminReportsScreen} options={{ title: t("nav.reports") }} />
    </RootStack.Navigator>
  );
}

/**
 * The wait before the first screen.
 *
 * A bare spinner is fine for the half-second it usually takes. It is not fine
 * for a cold start: the API sleeps after fifteen idle minutes and the next
 * request pays around twenty seconds for the boot, and twenty seconds of an
 * unexplained spinner is indistinguishable from an app that has hung.
 *
 * So the explanation appears only once the wait has become strange — saying it
 * immediately would make every ordinary launch look slow.
 */
function Booting({ theme }) {
  const { t } = useI18n();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg, paddingHorizontal: 40 }}>
      <ActivityIndicator size="large" color={theme.accent} />
      {slow ? (
        <Text style={{ marginTop: 18, color: theme.text3, fontSize: 13.5, textAlign: "center", lineHeight: 20 }}>
          {t("splash.waking")}
        </Text>
      ) : null}
    </View>
  );
}


function Root() {
  const { uid, profile, booting, switching } = useAuth();
  // Undefined until answered: rendering the auth stack before we know would
  // flash the login form at someone who should be seeing the intro.
  //
  // It must never be able to hold the whole app hostage, though. Blocking the
  // splash on a storage read means any way that read can fail to settle is a
  // way the app never starts at all, which is a far worse failure than one
  // frame of the wrong screen. Hence the timeout, and hence only waiting for
  // it when signed out — where it is the only thing the answer affects.
  const [showIntro, setShowIntro] = useState(undefined);
  useEffect(() => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; setShowIntro(v); } };
    hasSeenIntro().then((seen) => done(!seen)).catch(() => done(false));
    const bail = setTimeout(() => done(false), 1500);
    return () => clearTimeout(bail);
  }, []);
  const { theme, scheme, loaded } = useTheme();
  // Same reason as the theme: rendering before the stored language lands would
  // paint one frame of English at someone who chose Arabic.
  const { loaded: localeLoaded } = useI18n();

  // Wait for the saved preference as well as the session, or the first frame
  // flashes light before a dark-mode user's choice lands.
  // showIntro is only waited on while signed out, because that is the only
  // case it changes anything — a signed-in user goes to the map either way.
  if (booting || !loaded || !localeLoaded || (!uid && showIntro === undefined)) {
    return <Booting theme={theme} />;
  }

  // Covers the remount above with the brand screen rather than a blank frame.
  if (switching) return <BrandSplash />;

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
      {/* Inside the providers so it picks up the theme and the language, and
          above the navigator so an alert survives a screen being popped. */}
      <AlertHost />
      {/* Keyed on the uid so switching accounts remounts every screen instead
          of leaving them holding the previous person's data. Without this a
          private meeting the last account could see stayed on the list, since
          nothing ever refetched it under the new token. */}
      {/* An account that has just been created gets the welcome flow instead
          of the map. It is gated on the profile rather than on "did this
          device just sign up", so it runs once per person: reinstalling, or
          signing in on a second phone, must not ask again. While the profile
          is still loading, `onboarded` is undefined and Home wins — a blank
          moment on the map beats flashing the welcome at someone who has
          already done it. */}
      {uid
        ? (profile && profile.onboarded === false
            // Host skips the welcome flow: it asks what someone came here to
            // find, and a Host account came here to post, not to look.
            ? (IS_HOST ? <HostNavigator key={uid} /> : <WelcomeScreen />)
            : (IS_HOST ? <HostNavigator key={uid} /> : <MainNavigator key={uid} />))
        : (IS_HOST ? <HostAuthNavigator /> : <AuthNavigator showIntro={showIntro} />)}
    </NavigationContainer>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
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
  // override it explicitly where they want Outfit or Space Grotesk.
  Text.defaultProps = Text.defaultProps || {};
  Text.defaultProps.style = [{ fontFamily: FONTS.body }, Text.defaultProps.style];

  return (
    // Outside the providers on purpose: if the theme or auth provider is what
    // throws, a boundary nested inside them would go down with it.
    <ErrorBoundary>
      <SafeAreaProvider>
        {/* Outside ThemeProvider so that a screen can translate a label while
            the theme is still resolving, and so the language is set before
            anything below it renders its first frame. */}
        <LocaleProvider>
          <ThemeProvider>
            <AuthProvider>
              {/* One GPS watcher for the whole app — see LocationContext. */}
              <LocationProvider>
                <Root />
              </LocationProvider>
            </AuthProvider>
          </ThemeProvider>
        </LocaleProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

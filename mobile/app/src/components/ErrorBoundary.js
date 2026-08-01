import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";

/**
 * Catches render errors so one bad component does not take the app with it.
 *
 * Without this, any exception thrown while rendering unmounts the whole tree
 * and leaves a white screen with no way out but force-quitting — in a release
 * build there is not even a red box to read. That is the single worst thing an
 * app can do to someone, and it is the state this app shipped in.
 *
 * Deliberately a class: `componentDidCatch` has no hook equivalent.
 *
 * The message is shown in development only. In a release build a stack trace
 * tells the user nothing and can leak internals, so they get a plain apology
 * and a way to continue.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // No crash reporter wired up yet, so at least make it findable in logcat
    // rather than losing it entirely.
    console.error("Unhandled render error:", error, info?.componentStack);
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.page}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.emoji}>😵‍💫</Text>
          <Text style={styles.title}>Something broke</Text>
          <Text style={styles.body}>
            That screen hit an error. Nothing you did caused it, and nothing you
            saved is lost.
          </Text>

          {__DEV__ ? (
            <View style={styles.devBox}>
              <Text style={styles.devText}>{String(error?.message || error)}</Text>
            </View>
          ) : null}

          <TouchableOpacity style={styles.btn} onPress={this.handleRetry} activeOpacity={0.85}>
            <Text style={styles.btnText}>Try again</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }
}

// Plain literals rather than theme tokens: this has to render even when the
// failure is in the theme provider itself.
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#eef1f5" },
  content: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  emoji: { fontSize: 44, marginBottom: 14 },
  title: { fontSize: 20, fontWeight: "800", color: "#2c3e50", marginBottom: 8, textAlign: "center" },
  body: { fontSize: 14.5, lineHeight: 21, color: "#6b7480", textAlign: "center" },
  devBox: {
    marginTop: 18,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(192,57,43,0.08)",
    borderWidth: 1,
    borderColor: "rgba(192,57,43,0.35)",
    maxWidth: "100%",
  },
  devText: { fontSize: 12, color: "#c0392b", fontFamily: "monospace" },
  btn: {
    marginTop: 22,
    backgroundColor: "#0d9c8a",
    borderRadius: 999,
    paddingHorizontal: 30,
    paddingVertical: 13,
  },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});

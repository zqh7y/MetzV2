import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL } from "./config";

let currentUid = null;
let currentToken = null;

export async function loadStoredUid() {
  currentUid = await AsyncStorage.getItem("uid");
  currentToken = await AsyncStorage.getItem("token");
  return currentUid;
}

/** The token for whoever is signed in, so the account switcher can store it. */
export async function loadStoredToken() {
  return currentToken || (await AsyncStorage.getItem("token"));
}

/** Save the signed session token the API issues at login/verify. The uid is
 *  kept only for display — the server derives identity from the token. */
export function setSession(uid, token) {
  currentUid = uid;
  currentToken = token || null;
  if (uid) AsyncStorage.setItem("uid", uid);
  else AsyncStorage.removeItem("uid");
  if (token) AsyncStorage.setItem("token", token);
  else AsyncStorage.removeItem("token");
}

// Kept for callers that only have a uid
export function setCurrentUid(uid) {
  setSession(uid, currentToken);
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && currentToken) headers["Authorization"] = `Bearer ${currentToken}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  signup: (email, password) => request("/api/signup", { method: "POST", body: { email, password }, auth: false }),
  verify: (email, code) => request("/api/verify", { method: "POST", body: { email, code }, auth: false }),
  resendVerify: (email) => request("/api/verify/resend", { method: "POST", body: { email }, auth: false }),
  login: (email, password) => request("/api/login", { method: "POST", body: { email, password }, auth: false }),
  // Only the token goes up: the server reads the address out of it rather than
  // trusting one sent alongside.
  googleSignIn: (idToken) =>
    request("/api/auth/google", { method: "POST", body: { id_token: idToken }, auth: false }),
  requestPasswordReset: (email) =>
    request("/api/password/reset", { method: "POST", body: { email }, auth: false }),

  getTags: () => request("/api/tags", { auth: false }),
  getMeetings: () => request("/api/meetings"),
  createMeeting: (payload) => request("/api/meetings", { method: "POST", body: payload }),
  joinMeeting: (id) => request(`/api/meetings/${id}/join`, { method: "POST" }),
  passMeeting: (id) => request(`/api/meetings/${id}/pass`, { method: "POST" }),
  deleteMeeting: (id) => request(`/api/meetings/${id}`, { method: "DELETE" }),

  getJoined: () => request("/api/joined"),

  // Explore takes the same query string the web page uses, so a set of filters
  // means the same thing on both.
  getExplore: (params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== "" && value !== null && value !== undefined && value !== false) {
        query.set(key, value === true ? "1" : String(value));
      }
    });
    const qs = query.toString();
    return request(`/api/explore${qs ? `?${qs}` : ""}`);
  },
  getActivity: () => request("/api/activity"),
  getInbox: () => request("/api/inbox"),
  readInboxMessage: (id) => request(`/api/inbox/${id}/read`, { method: "POST" }),
  readAllInbox: () => request("/api/inbox/read-all", { method: "POST" }),

  getAttendees: (id) => request(`/api/meetings/${id}/attendees`),
  /** status: "went" | "missed". Returns the updated reliability. */
  checkIn: (id, status) =>
    request(`/api/meetings/${id}/checkin`, { method: "POST", body: { status } }),

  getComments: (id) => request(`/api/meetings/${id}/comments`),
  addComment: (id, text) =>
    request(`/api/meetings/${id}/comments`, { method: "POST", body: { text } }),
  deleteComment: (id, commentId) =>
    request(`/api/meetings/${id}/comments/${commentId}`, { method: "DELETE" }),

  getProfile: () => request("/api/profile"),
  updateProfile: (payload) => request("/api/profile", { method: "POST", body: payload }),
  deleteAccount: () => request("/api/profile", { method: "DELETE" }),
  getUser: (uid) => request(`/api/users/${uid}`),
  toggleTrust: (uid) => request(`/api/users/${uid}/trust`, { method: "POST" }),
  searchUsers: (q) => request(`/api/search_users?q=${encodeURIComponent(q)}`),

  // Reporting and blocking
  getReportReasons: () => request("/api/report/reasons"),
  reportContent: (targetType, targetId, reason, detail) =>
    request("/api/report", {
      method: "POST",
      body: { target_type: targetType, target_id: String(targetId), reason, detail },
    }),
  blockUser: (uid) => request(`/api/block/${uid}`, { method: "POST" }),
  unblockUser: (uid) => request(`/api/block/${uid}`, { method: "DELETE" }),
  getBlocked: () => request("/api/blocked"),
  getReports: (status) => request(`/api/admin/reports${status ? `?status=${status}` : ""}`),
  resolveReport: (id, action) =>
    request(`/api/admin/reports/${id}`, { method: "POST", body: { action } }),

  getDashboard: () => request("/api/admin/dashboard"),
  banUser: (uid) => request(`/api/admin/users/${uid}/ban`, { method: "POST" }),
  setTrust: (uid) => request(`/api/admin/users/${uid}/trust`, { method: "POST" }),
  deleteUser: (uid) => request(`/api/admin/users/${uid}`, { method: "DELETE" }),
  adminDeleteMeeting: (id) => request(`/api/admin/meetings/${id}`, { method: "DELETE" }),

  getPending: () => request("/api/admin/pending"),
  approveMeeting: (id) => request(`/api/admin/meetings/${id}/approve`, { method: "POST" }),
  declineMeeting: (id) => request(`/api/admin/meetings/${id}/decline`, { method: "POST" }),
};

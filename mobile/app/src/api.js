import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL } from "./config";

let currentUid = null;
let currentToken = null;

export async function loadStoredUid() {
  currentUid = await AsyncStorage.getItem("uid");
  currentToken = await AsyncStorage.getItem("token");
  return currentUid;
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

  getTags: () => request("/api/tags", { auth: false }),
  getMeetings: () => request("/api/meetings"),
  createMeeting: (payload) => request("/api/meetings", { method: "POST", body: payload }),
  joinMeeting: (id) => request(`/api/meetings/${id}/join`, { method: "POST" }),
  passMeeting: (id) => request(`/api/meetings/${id}/pass`, { method: "POST" }),
  deleteMeeting: (id) => request(`/api/meetings/${id}`, { method: "DELETE" }),

  getJoined: () => request("/api/joined"),

  getAttendees: (id) => request(`/api/meetings/${id}/attendees`),

  getProfile: () => request("/api/profile"),
  updateProfile: (payload) => request("/api/profile", { method: "POST", body: payload }),
  getUser: (uid) => request(`/api/users/${uid}`),
  toggleTrust: (uid) => request(`/api/users/${uid}/trust`, { method: "POST" }),
  searchUsers: (q) => request(`/api/search_users?q=${encodeURIComponent(q)}`),

  getDashboard: () => request("/api/admin/dashboard"),
  banUser: (uid) => request(`/api/admin/users/${uid}/ban`, { method: "POST" }),
  setTrust: (uid) => request(`/api/admin/users/${uid}/trust`, { method: "POST" }),
  deleteUser: (uid) => request(`/api/admin/users/${uid}`, { method: "DELETE" }),
  adminDeleteMeeting: (id) => request(`/api/admin/meetings/${id}`, { method: "DELETE" }),

  getPending: () => request("/api/admin/pending"),
  approveMeeting: (id) => request(`/api/admin/meetings/${id}/approve`, { method: "POST" }),
  declineMeeting: (id) => request(`/api/admin/meetings/${id}/decline`, { method: "POST" }),
};

import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL } from "./config";

let currentUid = null;

export async function loadStoredUid() {
  currentUid = await AsyncStorage.getItem("uid");
  return currentUid;
}

export function setCurrentUid(uid) {
  currentUid = uid;
  if (uid) AsyncStorage.setItem("uid", uid);
  else AsyncStorage.removeItem("uid");
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && currentUid) headers["X-User-Id"] = currentUid;

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

  getProfile: () => request("/api/profile"),
  getUser: (uid) => request(`/api/users/${uid}`),
  toggleTrust: (uid) => request(`/api/users/${uid}/trust`, { method: "POST" }),
  searchUsers: (q) => request(`/api/search_users?q=${encodeURIComponent(q)}`),

  getPending: () => request("/api/admin/pending"),
  approveMeeting: (id) => request(`/api/admin/meetings/${id}/approve`, { method: "POST" }),
  declineMeeting: (id) => request(`/api/admin/meetings/${id}/decline`, { method: "POST" }),
};

// Firebase 初期化・参照ヘルパ（CDN の ES Modules を利用。ビルド不要）
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged, setPersistence, browserSessionPersistence,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  getFirestore, doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch, deleteField,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

export const DEV = new URLSearchParams(location.search).has("dev"); // ?dev=1 : 同一ブラウザの複数タブで別プレイヤーとして試せる

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

/** 匿名認証してuidを返す */
export async function signIn() {
  if (DEV) await setPersistence(auth, browserSessionPersistence);
  if (auth.currentUser) return auth.currentUser.uid;
  await new Promise((res) => { const off = onAuthStateChanged(auth, () => { off(); res(); }); });
  if (auth.currentUser) return auth.currentUser.uid;
  const cred = await signInAnonymously(auth);
  return cred.user.uid;
}

export const roomRef = (id) => doc(db, "rooms", id);
export const playersCol = (id) => collection(db, "rooms", id, "players");
export const playerRef = (id, uid) => doc(db, "rooms", id, "players", uid);
export const secretsCol = (id) => collection(db, "rooms", id, "secrets");
export const secretRef = (id, uid) => doc(db, "rooms", id, "secrets", uid);
export const actionsCol = (id) => collection(db, "rooms", id, "actions");
export const actionRef = (id, uid) => doc(db, "rooms", id, "actions", uid);

export { getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch, deleteField };

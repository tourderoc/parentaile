import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCQysWQaf5j_-6HddVW1foRkLZN-ykr3iw",
  authDomain: "parentaile.firebaseapp.com",
  projectId: "parentaile",
  storageBucket: "parentaile.appspot.com",
  messagingSenderId: "837549100291",
  appId: "1:837549100291:web:64740c12546e4463c0ad36",
  measurementId: "G-LP79JFGDWG"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };
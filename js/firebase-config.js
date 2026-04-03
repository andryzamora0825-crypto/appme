// =====================================================
// ZAMORA MSG — Firebase Configuration
// =====================================================

import { initializeApp }   from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth }         from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getFirestore }    from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { getStorage }      from "https://www.gstatic.com/firebasejs/12.11.0/firebase-storage.js";
import { getAnalytics }    from "https://www.gstatic.com/firebasejs/12.11.0/firebase-analytics.js";

const firebaseConfig = {
  apiKey:            "AIzaSyA-5VMFvHl5u9h_f2s0N2M7igcPMhSbFKw",
  authDomain:        "proyecto-chiquito-43037.firebaseapp.com",
  projectId:         "proyecto-chiquito-43037",
  storageBucket:     "proyecto-chiquito-43037.firebasestorage.app",
  messagingSenderId: "113000980428",
  appId:             "1:113000980428:web:2f160a96b5467fb50ac769",
  measurementId:     "G-B5T1M09G6F"
};

const app       = initializeApp(firebaseConfig);
export const auth      = getAuth(app);
export const db        = getFirestore(app);
export const storage   = getStorage(app);
export const analytics = getAnalytics(app);
export default app;

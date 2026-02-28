// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDMj8NO1gDkl8FJdbB75cQ2-9DEZo1PGwI",
  authDomain: "datamap-c8ba6.firebaseapp.com",
  projectId: "datamap-c8ba6",
  storageBucket: "datamap-c8ba6.firebasestorage.app",
  messagingSenderId: "517568787377",
  appId: "1:517568787377:web:47b17636c5394152518390",
  measurementId: "G-2WV11SRYHK"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
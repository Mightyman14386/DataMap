import { db } from "./firebase.js"; // Note the .js extension is often required with NodeNext
import { collection, addDoc, getDocs, serverTimestamp } from "firebase/firestore";

async function seedDatabase() {
  try {
    console.log("🚀 Attempting to connect to Firestore...");

    // 1. Add a new document
    const docRef = await addDoc(collection(db, "projects"), {
      name: "DataMap Web App",
      status: "Initialization",
      createdAt: serverTimestamp(),
    });

    console.log("✅ Document written with ID: ", docRef.id);

    // 2. Read it back to verify
    const querySnapshot = await getDocs(collection(db, "projects"));
    console.log("📂 Current projects in database:");
    querySnapshot.forEach((doc) => {
      console.log(`- ${doc.id}:`, doc.data());
    });

  } catch (error) {
    console.error("❌ Error connecting to Firebase:", error);
  }
}

seedDatabase();
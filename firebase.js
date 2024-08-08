// Import the functions you need from the SDKs you need
const { initializeApp } = require("firebase/app");
const { getFirestore , doc, setDoc, collection, getDocs, query, addDoc, writeBatch,getDoc} = require("firebase/firestore");
require("dotenv").config();

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID
};


let app;
let firestoreDb;

const initializeFirebaseApp = () => {
    try {
        app = initializeApp(firebaseConfig);
        firestoreDb = getFirestore(app);
        return app;
    }
    catch (e) {
        console.error("Error initializing firebase app: ", e);
    }
}




const uploadData = async (value)=>{
    const dataToUpload = {
        key1: value,
        key2: "value2"
    }
    try {
        await setDoc(doc(firestoreDb, "users", "user1"), dataToUpload);
        console.log("Data uploaded successfully");
    } catch (e) {
        console.error("Error adding document: ", e);
    }
}

const uploadPreferences = async (userId, order) => {
    let allPreferences = [];

    // Extract preferences from each food item in the order
    order.forEach(food => {
        if (food.preferences) {
            food.preferences.forEach(preference => {
                if (preference.preferenceInLanguageOfDiner) {
                    allPreferences.push(preference.preferenceInLanguageOfDiner);
                }
            });
        }
    });

    try {
        const docRef = doc(firestoreDb, "preferencecollection", userId);
        const docSnap = await getDoc(docRef);

        let existingPreferences = [];

        if (docSnap.exists()) {
            const existingData = docSnap.data();
            existingPreferences = existingData.preferences || [];
        }

        const updatedPreferences = [...existingPreferences, ...allPreferences];

        await setDoc(docRef, { preferences: updatedPreferences }, { merge: true });
        console.log("Preferences uploaded successfully");
    } catch (e) {
        console.error("Error updating document: ", e);
    }
};

const getPreferences = async (userId) => {
    try {
        const docRef = doc(firestoreDb, "preferencecollection", userId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            return data.preferences || [];
        } else {
            console.log("No such document!");
            return [];
        }
    } catch (error) {
        console.error("Error getting document: ", error);
        return [];
    }
};

const uploadFoodNames = async (userId, order) => {
    const foodNames = order.map(food => food.foodname);

    try {
        const docRef = doc(firestoreDb, "foodcollection", userId);
        const docSnap = await getDoc(docRef);

        let existingFoodNames = [];

        if (docSnap.exists()) {
            const existingData = docSnap.data();
            existingFoodNames = existingData.foodNames || [];
        }

        const updatedFoodNames = [...existingFoodNames, ...foodNames];

        await setDoc(docRef, { foodNames: updatedFoodNames }, { merge: true });
        console.log("Food names uploaded successfully");
    } catch (e) {
        console.error("Error updating document: ", e);
    }
};

const getFoodNames = async (userId) => {
    try {
        const docRef = doc(firestoreDb, "foodcollection", userId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            return data.foodNames || [];
        } else {
            console.log("No such document!");
            return [];
        }
    } catch (error) {
        console.error("Error getting document: ", error);
        return [];
    }
};


const getData = async (collectionName) => {
    try{
        const collectionRef = collection(firestoreDb, collectionName);
        const finalData = [];
        const q = query(collectionRef);
        const docSnap = await getDocs(q);
        docSnap.forEach((doc) => {
            finalData.push(doc.data());
        });
        return finalData;
    }catch(error){
        console.error("Error getting document: ", error);
    }
}

const getFirebaseApp = () => {
  return app;
}

module.exports = {
    getFirebaseApp,
    uploadData,
    initializeFirebaseApp,
    getData,
    uploadFoodNames,
    getFoodNames,
    uploadPreferences,
    getPreferences
}
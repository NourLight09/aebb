import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getServiceAccount() {
  const serializedAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serializedAccount) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not configured.");
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serializedAccount);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT must contain valid JSON.");
  }

  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is missing required credentials.");
  }

  return {
    ...serviceAccount,
    private_key: serviceAccount.private_key.replace(/\\n/g, "\n"),
  };
}

export function getFirebaseAdmin() {
  const app = getApps()[0] || initializeApp({
    credential: cert(getServiceAccount()),
  });

  return {
    auth: getAuth(app),
    firestore: getFirestore(app),
  };
}

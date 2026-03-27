import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { app } from "./client";

export const auth = getAuth(app);
auth.useDeviceLanguage();

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account",
});

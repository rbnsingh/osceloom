
// Firebase configuration for OSCEloom
export const firebaseConfig = {
  apiKey: "AIzaSyAfx1zAP02edszrntE0zLwQEQJ6JxRemyY",
  authDomain: "osceloom.firebaseapp.com",
  projectId: "osceloom",
  appId: "1:975452779433:web:8dc38f5736dec3f4840ab8"
};

export const isConfigured = !Object.values(firebaseConfig).some(
  value => value.startsWith("PASTE_")
);

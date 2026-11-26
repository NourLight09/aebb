export function apiError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function field(document, name) {
  return document?.fields?.[name]?.stringValue;
}

export async function readFirestoreDocument(projectId, path, idToken) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${encodedPath}`,
    { headers: { Authorization: `Bearer ${idToken}` } },
  );
  if (!response.ok) return null;
  return response.json();
}

export async function verifyUser(idToken, apiKey) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    },
  );
  if (!response.ok) throw apiError(401, "Session invalide. Reconnectez-vous.");
  const result = await response.json();
  const uid = result.users?.[0]?.localId;
  if (!uid) throw apiError(401, "Session invalide. Reconnectez-vous.");
  return uid;
}

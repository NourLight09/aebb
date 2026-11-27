import { createHash } from "node:crypto";
import { getFirebaseAdmin } from "../server/firebase-admin.js";

function apiError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function cloudinaryPublicIdFromUrl(imageUrl) {
  try {
    const url = new URL(imageUrl);
    if (url.hostname !== "res.cloudinary.com") return null;
    const uploadPath = url.pathname.split("/upload/")[1];
    if (!uploadPath) return null;
    const pathSegments = uploadPath.split("/");
    const versionIndex = pathSegments.findIndex((segment) => /^v\d+$/.test(segment));
    const publicId = (versionIndex < 0
      ? pathSegments
      : pathSegments.slice(versionIndex + 1))
      .join("/")
      .replace(/\.[a-z0-9]+$/i, "");
    return publicId.startsWith("aebb_") ? publicId : null;
  } catch {
    return null;
  }
}

async function deleteCloudinaryAsset(publicId) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const parameters = { public_id: publicId, timestamp };
  const serialized = Object.entries(parameters)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const signature = createHash("sha1")
    .update(`${serialized}${apiSecret}`)
    .digest("hex");
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/destroy`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        api_key: apiKey,
        public_id: publicId,
        timestamp,
        signature,
      }),
    },
  );
  const result = await response.json().catch(() => null);
  if (!response.ok || !["ok", "not found"].includes(result?.result)) {
    throw apiError(502, "Cloudinary n’a pas pu supprimer une image liée à ce compte.");
  }
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Méthode non autorisée." });
  }

  const idToken = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const { userId } = request.body || {};
  if (!idToken) {
    return response.status(401).json({ error: "Connexion administrateur requise." });
  }
  if (typeof userId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(userId)) {
    return response.status(400).json({ error: "Compte utilisateur invalide." });
  }

  let targetAuthUser;
  let firestoreCleanupStarted = false;
  try {
    const { auth, firestore } = getFirebaseAdmin();
    const caller = await auth.verifyIdToken(idToken, true);
    const callerProfile = await firestore.doc(`users/${caller.uid}`).get();
    if (callerProfile.data()?.role !== "admin") {
      throw apiError(403, "Seul un administrateur peut supprimer un compte.");
    }
    if (userId === caller.uid) {
      throw apiError(400, "Vous ne pouvez pas supprimer votre propre compte.");
    }

    const targetUserRef = firestore.doc(`users/${userId}`);
    const targetProfile = await targetUserRef.get();
    if (!targetProfile.exists) {
      throw apiError(404, "Ce profil utilisateur n’existe plus.");
    }
    if (targetProfile.data().role === "admin") {
      const administrators = await firestore
        .collection("users")
        .where("role", "==", "admin")
        .get();
      if (administrators.size <= 1) {
        throw apiError(409, "Le dernier compte administrateur ne peut pas être supprimé.");
      }
    }

    targetAuthUser = await auth.getUser(userId);
    const [announcementContacts, directoryEntries, userChats, commissionProfile] =
      await Promise.all([
        firestore.collectionGroup("contact").where("auteurId", "==", userId).get(),
        firestore.collection("annuaire_solidaire").where("userId", "==", userId).get(),
        firestore.collection("chats").where("etudiantId", "==", userId).get(),
        firestore.doc(`commission_public/${userId}`).get(),
      ]);

    const imagePublicIds = new Set();
    const announcements = await Promise.all(
      announcementContacts.docs.map((contact) => contact.ref.parent.parent?.get()),
    );
    announcements.filter(Boolean).forEach((announcement) => {
      const publicId = cloudinaryPublicIdFromUrl(announcement.data()?.imageUrl);
      if (publicId) imagePublicIds.add(publicId);
    });

    if (commissionProfile.exists) {
      const publicId = cloudinaryPublicIdFromUrl(commissionProfile.data().photoUrl);
      if (publicId) imagePublicIds.add(publicId);
    }

    if (imagePublicIds.size && (!process.env.CLOUDINARY_CLOUD_NAME
      || !process.env.CLOUDINARY_API_KEY
      || !process.env.CLOUDINARY_API_SECRET)) {
      throw apiError(503, "Configurez Cloudinary sur Vercel avant de supprimer ce compte : il possède des images.");
    }

    await auth.updateUser(userId, { disabled: true });
    for (const publicId of imagePublicIds) {
      await deleteCloudinaryAsset(publicId);
    }

    firestoreCleanupStarted = true;
    const announcementRefs = announcementContacts.docs
      .map((contact) => contact.ref.parent.parent)
      .filter(Boolean);
    await Promise.all([
      ...announcementRefs.map((ref) => firestore.recursiveDelete(ref)),
      ...directoryEntries.docs.map((entry) => firestore.recursiveDelete(entry.ref)),
      ...userChats.docs.map((chat) => firestore.recursiveDelete(chat.ref)),
      ...(commissionProfile.exists
        ? [firestore.recursiveDelete(commissionProfile.ref)]
        : []),
    ]);
    await firestore.recursiveDelete(targetUserRef);
    await auth.deleteUser(userId);

    return response.status(200).json({ deleted: true });
  } catch (error) {
    if (targetAuthUser && !firestoreCleanupStarted) {
      try {
        const { auth } = getFirebaseAdmin();
        await auth.updateUser(targetAuthUser.uid, { disabled: false });
      } catch (restoreError) {
        console.error("Could not restore a temporarily disabled AEBB account.", {
          targetUserId: userId,
        });
      }
    }
    if (error.status) {
      return response.status(error.status).json({ error: error.message });
    }
    console.error("AEBB account deletion failed.", {
      targetUserId: userId,
      firestoreCleanupStarted,
    });
    return response.status(500).json({
      error: firestoreCleanupStarted
        ? "La suppression est incomplète. Le compte a été désactivé; contactez un administrateur technique pour terminer le nettoyage."
        : "Le compte n’a pas pu être supprimé. Réessayez plus tard.",
    });
  }
}

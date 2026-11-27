import { createHash } from "node:crypto";
import {
  apiError,
  field,
  readFirestoreDocument,
  verifyUser,
} from "../server/firebase-rest.js";

function signParameters(parameters, apiSecret) {
  const serialized = Object.entries(parameters)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return createHash("sha1")
    .update(`${serialized}${apiSecret}`)
    .digest("hex");
}

function sendError(response, error) {
  if (error.status >= 500) {
    console.error("Cloudinary image API failed", { status: error.status });
  }
  return response.status(error.status || 500).json({
    error: error.status ? error.message : "Le service d’images est temporairement indisponible.",
  });
}

function cloudinaryPublicIdFromUrl(imageUrl) {
  try {
    const url = new URL(imageUrl);
    if (url.hostname !== "res.cloudinary.com") return null;
    const uploadPath = url.pathname.split("/upload/")[1];
    if (!uploadPath) return null;
    const pathSegments = uploadPath.split("/");
    const versionIndex = pathSegments.findIndex((segment) => /^v\d+$/.test(segment));
    return (versionIndex < 0
      ? pathSegments
      : pathSegments.slice(versionIndex + 1))
      .join("/")
      .replace(/\.[a-z0-9]+$/i, "");
  } catch {
    return null;
  }
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Méthode non autorisée." });
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY;
  const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET;
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;
  const firebaseApiKey = process.env.VITE_FIREBASE_API_KEY;
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
  if (!cloudName || !cloudinaryApiKey || !cloudinaryApiSecret || !uploadPreset
    || !firebaseApiKey || !projectId) {
    return response.status(503).json({
      error: "Le service d’images n’est pas encore configuré.",
    });
  }

  const idToken = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!idToken) {
    return response.status(401).json({ error: "Connexion requise." });
  }

  const {
    action,
    purpose,
    assetId,
    ownerId,
    announcementId,
  } = request.body || {};
  const hasModerationOwner = ownerId !== undefined || announcementId !== undefined;
  if (!["sign-upload", "delete"].includes(action)
    || !["announcement", "commission"].includes(purpose)
    || typeof assetId !== "string"
    || !/^[A-Za-z0-9_-]{1,128}$/.test(assetId)
    || (hasModerationOwner
      && (action !== "delete"
        || purpose !== "announcement"
        || typeof ownerId !== "string"
        || !/^[A-Za-z0-9_-]{1,128}$/.test(ownerId)
        || typeof announcementId !== "string"
        || !/^[A-Za-z0-9_-]{1,128}$/.test(announcementId)))) {
    return response.status(400).json({ error: "Demande d’image invalide." });
  }

  try {
    const uid = await verifyUser(idToken, firebaseApiKey);
    const user = await readFirestoreDocument(projectId, `users/${uid}`, idToken);
    const role = field(user, "role");
    const hasPermission = purpose === "announcement"
      ? ["etudiant", "commission", "admin"].includes(role)
      : ["commission", "admin"].includes(role);
    if (!hasPermission) {
      throw apiError(403, "Vous n’êtes pas autorisé à gérer cette image.");
    }

    let assetOwnerId = uid;
    if (hasModerationOwner) {
      if (!["commission", "admin"].includes(role)) {
        throw apiError(403, "Seule la commission peut supprimer l’image d’une annonce d’un autre membre.");
      }
      const [announcement, privateContact] = await Promise.all([
        readFirestoreDocument(projectId, `annonces/${announcementId}`, idToken),
        readFirestoreDocument(
          projectId,
          `annonces/${announcementId}/prive/contact`,
          idToken,
        ),
      ]);
      const savedImageId = field(announcement, "imageId") || announcementId;
      const expectedPublicId = `aebb_announcement_${createHash("sha256")
        .update(`${ownerId}:${assetId}`)
        .digest("hex")}`;
      if (!announcement
        || field(privateContact, "auteurId") !== ownerId
        || savedImageId !== assetId
        || cloudinaryPublicIdFromUrl(field(announcement, "imageUrl")) !== expectedPublicId) {
        throw apiError(403, "Cette image n’appartient pas à l’annonce à modérer.");
      }
      assetOwnerId = ownerId;
    }

    const assetKey = createHash("sha256")
      .update(`${assetOwnerId}:${assetId}`)
      .digest("hex");
    const publicId = `aebb_${purpose}_${assetKey}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();

    if (action === "sign-upload") {
      const parameters = {
        overwrite: "false",
        public_id: publicId,
        timestamp,
        upload_preset: uploadPreset,
      };
      return response.status(200).json({
        apiKey: cloudinaryApiKey,
        cloudName,
        publicId,
        timestamp,
        uploadPreset,
        signature: signParameters(parameters, cloudinaryApiSecret),
      });
    }

    const parameters = { public_id: publicId, timestamp };
    const signature = signParameters(parameters, cloudinaryApiSecret);
    const cloudinaryResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/destroy`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          api_key: cloudinaryApiKey,
          public_id: publicId,
          timestamp,
          signature,
        }),
      },
    );
    const result = await cloudinaryResponse.json().catch(() => null);
    if (!cloudinaryResponse.ok
      || !["ok", "not found"].includes(result?.result)) {
      throw apiError(502, "Cloudinary n’a pas pu supprimer l’image.");
    }
    return response.status(200).json({ deleted: true });
  } catch (error) {
    return sendError(response, error);
  }
}

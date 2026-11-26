import {
  apiError,
  field,
  readFirestoreDocument,
  verifyUser,
} from "../server/firebase-rest.js";

function isRecent(document) {
  const timestamp = document?.fields?.createdAt?.timestampValue;
  const age = Date.now() - Date.parse(timestamp || "");
  return Number.isFinite(age) && age >= 0 && age < 24 * 60 * 60 * 1000;
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Méthode non autorisée." });
  }

  const idToken = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!idToken) {
    return response.status(401).json({ error: "Connexion requise." });
  }

  const { eventType, documentId, messageId } = request.body || {};
  if (!["new-announcement", "new-message"].includes(eventType)
    || typeof documentId !== "string"
    || !/^[A-Za-z0-9_-]{1,128}$/.test(documentId)
    || (eventType === "new-message"
      && (typeof messageId !== "string"
        || !/^[A-Za-z0-9_-]{1,128}$/.test(messageId)))) {
    return response.status(400).json({ error: "Demande de notification invalide." });
  }

  const apiKey = process.env.VITE_FIREBASE_API_KEY;
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
  const emailServiceId = process.env.EMAILJS_SERVICE_ID;
  const emailTemplateId = process.env.EMAILJS_TEMPLATE_ID;
  const emailPublicKey = process.env.EMAILJS_PUBLIC_KEY;
  const emailPrivateKey = process.env.EMAILJS_PRIVATE_KEY;

  if (!apiKey || !projectId || !emailServiceId || !emailTemplateId
    || !emailPublicKey || !emailPrivateKey) {
    return response.status(503).json({
      error: "Notifications par courriel non configurées sur le déploiement.",
    });
  }

  try {
    const uid = await verifyUser(idToken, apiKey);
    const profile = await readFirestoreDocument(projectId, `users/${uid}`, idToken);
    const role = field(profile, "role");
    if ((eventType === "new-message" && role !== "etudiant")
      || (eventType === "new-announcement"
        && !["etudiant", "commission", "admin"].includes(role))) {
      throw apiError(403, "Ce compte n’est pas autorisé à déclencher cette notification.");
    }

    if (eventType === "new-announcement") {
      const announcement = await readFirestoreDocument(
        projectId,
        `annonces/${documentId}`,
        idToken,
      );
      const privateContact = await readFirestoreDocument(
        projectId,
        `annonces/${documentId}/prive/contact`,
        idToken,
      );
      if (!["don", "demande"].includes(field(announcement, "type"))
        || field(announcement, "statut") !== "en_attente"
        || field(privateContact, "auteurId") !== uid
        || !isRecent(announcement)) {
        throw apiError(403, "Cette annonce ne peut pas déclencher de notification.");
      }
    } else {
      const chat = await readFirestoreDocument(projectId, `chats/${documentId}`, idToken);
      const message = await readFirestoreDocument(
        projectId,
        `chats/${documentId}/messages/${messageId}`,
        idToken,
      );
      if (field(chat, "etudiantId") !== uid
        || field(chat, "destinataireType") !== "commission"
        || field(message, "senderType") !== "etudiant"
        || field(message, "senderId") !== uid
        || !isRecent(message)) {
        throw apiError(403, "Ce message ne peut pas déclencher de notification.");
      }
    }

    const subject = eventType === "new-announcement"
      ? "AEBB — annonce à valider"
      : "AEBB — nouveau message anonyme";
    const dashboardPath = eventType === "new-announcement"
      ? "/dashboard/entraide"
      : "/dashboard/messagerie";
    const portalBaseUrl = process.env.AEBB_PORTAL_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
    const portalLink = portalBaseUrl
      ? `${portalBaseUrl.replace(/\/+$/, "")}${dashboardPath}`
      : "";
    const action = eventType === "new-announcement"
      ? "Une nouvelle annonce (don ou demande) attend la validation d’un membre habilité."
      : "Un étudiant a envoyé un nouveau message anonyme à la commission.";
    const emailResponse = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        service_id: emailServiceId,
        template_id: emailTemplateId,
        user_id: emailPublicKey,
        accessToken: emailPrivateKey,
        template_params: {
          subject,
          message: action,
          portal_url: portalLink || "Connectez-vous au portail AEBB.",
        },
      }),
    });
    const emailResponseBody = await emailResponse.text();

    if (!emailResponse.ok) {
      const safeEmailResponseBody = [emailPublicKey, emailPrivateKey]
        .filter(Boolean)
        .reduce((body, key) => body.split(key).join("[redacted]"), emailResponseBody)
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email redacted]")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 500);
      console.error("EmailJS rejected an AEBB notification", {
        status: emailResponse.status,
        eventType,
        response: safeEmailResponseBody,
      });
      throw apiError(502, "Le service de courriel n’a pas accepté la notification.");
    }

    return response.status(200).json({ sent: true });
  } catch (error) {
    if (error.status) {
      return response.status(error.status).json({ error: error.message });
    }
    console.error("AEBB notification failed", { eventType });
    return response.status(502).json({
      error: "Impossible de vérifier ou d’envoyer la notification. Réessayez plus tard.",
    });
  }
}

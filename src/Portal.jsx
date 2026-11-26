import { useEffect, useRef, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase.js";

const roleLabels = {
  etudiant: "Étudiant",
  commission: "Commission",
  admin: "Administrateur",
};

const directoryCategories = [
  { id: "hebergement", label: "Hébergement temporaire" },
  { id: "colocation", label: "Colocation / logement" },
  { id: "emploi", label: "Recherche de job étudiant" },
];

function directoryCategoryLabel(type) {
  return directoryCategories.find((category) => category.id === type)?.label
    || type
    || "Catégorie inconnue";
}

function isChatUnread(chat, isPrivileged) {
  const incomingSender = isPrivileged ? "etudiant" : "commission";
  const readField = isPrivileged
    ? "commissionDerniereLectureAt"
    : "etudiantDerniereLectureAt";
  const updatedAt = chat.dernierMessageAt?.toMillis?.() || 0;
  const readAt = chat[readField]?.toMillis?.() || 0;
  return chat.dernierExpediteur === incomingSender && updatedAt > readAt;
}

const tabs = [
  { id: "accueil", label: "Accueil", icon: "⌂" },
  { id: "entraide", label: "Entraide", icon: "♡" },
  { id: "ecoute", label: "Écoute", icon: "◌" },
  { id: "messagerie", label: "Messagerie", icon: "✉" },
  { id: "espace", label: "Mon espace", icon: "▣" },
  { id: "annuaire", label: "Annuaire privé", icon: "⌕" },
  { id: "ressources", label: "Infos utiles", icon: "＋" },
  { id: "admin", label: "Administration", icon: "⚙", admin: true },
];

const demoAnnouncementSeed = [
  {
    id: "demo-vaisselle",
    titre: "Vaisselle et ustensiles à donner",
    description: "Quelques assiettes, bols et couverts en bon état. À récupérer près du centre-ville.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/a/ad/Glasses_dishes_art.jpg",
    type: "don",
    estAnonyme: false,
    auteurAffiche: "Exemple · Aïcha",
    contactPublic: null,
    statut: "actif",
  },
  {
    id: "demo-manteau",
    titre: "Manteau d’hiver taille M",
    description: "Manteau chaud en bon état, disponible pour une personne qui en a besoin.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/7/71/2017_Thom_Browne_man%27s_coat%2C_wool_twill_with_multiple_buttons%2C_Fall-Winter_04.jpg",
    type: "don",
    estAnonyme: true,
    auteurAffiche: "Membre anonyme AEBB",
    contactPublic: null,
    statut: "actif",
  },
  {
    id: "demo-demenagement",
    titre: "Un coup de main pour un déménagement",
    description: "Je cherche une ou deux personnes disponibles samedi matin. Je peux offrir le déjeuner !",
    imageUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/81/Open_Cardboard_Moving_Box_%2832067347137%29.jpg/960px-Open_Cardboard_Moving_Box_%2832067347137%29.jpg",
    type: "demande",
    estAnonyme: false,
    auteurAffiche: "Exemple · Jonas",
    contactPublic: null,
    statut: "actif",
  },
  {
    id: "demo-cours",
    titre: "Échange d’aide en mathématiques",
    description: "Je peux aider en mathématiques et cherche un peu de soutien en rédaction française.",
    imageUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/71/Cozy_study_space_with_an_open_book%2C_fresh_apple%2C_and_laptop_on_a_desk_in_bright_natural_light.jpg/960px-Cozy_study_space_with_an_open_book%2C_fresh_apple%2C_and_laptop_on_a_desk_in_bright_natural_light.jpg",
    type: "demande",
    estAnonyme: false,
    auteurAffiche: "Exemple · Grâce",
    contactPublic: null,
    statut: "actif",
  },
  {
    id: "demo-meubles",
    titre: "Petite table et lampe disponibles",
    description: "À récupérer gratuitement cette semaine. La table est démontable et la lampe fonctionne.",
    imageUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4e/Table_lamp_by_Omega_Workshops.jpg/960px-Table_lamp_by_Omega_Workshops.jpg",
    type: "don",
    estAnonyme: false,
    auteurAffiche: "Exemple · Emmanuel",
    contactPublic: null,
    statut: "actif",
  },
];

const demoCommissionSeed = [
  { id: "demo-logement", nom: "Exemple · Référente logement", fonction: "Logement et hébergement" },
  { id: "demo-ecoute", nom: "Exemple · Référent écoute", fonction: "Écoute et accompagnement" },
  { id: "demo-emploi", nom: "Exemple · Référente emploi", fonction: "Emploi étudiant et insertion" },
];

function getDemoAnnouncements(records) {
  const seedById = new Map(demoAnnouncementSeed.map((item) => [item.id, item]));
  if (!records.length) {
    return demoAnnouncementSeed.map((item) => ({ ...item, demo: true }));
  }
  return records.map((item) => {
    const seed = seedById.get(item.id);
    return {
      ...seed,
      ...item,
      demo: true,
      imageUrl: item.imageUrl || seed?.imageUrl,
    };
  });
}

const publicEmergencyNumbers = [
  { number: "112", title: "Urgences européennes", detail: "Numéro d’urgence général" },
  { number: "15", title: "SAMU", detail: "Urgence médicale" },
  { number: "17", title: "Police / gendarmerie", detail: "Danger ou infraction" },
  { number: "18", title: "Pompiers", detail: "Incendie et secours" },
  { number: "114", title: "Urgences par SMS / visio", detail: "Personnes sourdes ou malentendantes" },
  { number: "115", title: "Hébergement d’urgence", detail: "Mise à l’abri" },
  { number: "3114", title: "Prévention du suicide", detail: "Écoute gratuite, 24 h/24 et 7 j/7" },
];

const publicResourceLinks = [
  {
    title: "CROUS Bourgogne–Franche-Comté",
    detail: "Logement, aides sociales, restauration et accompagnement étudiant",
    url: "https://www.crous-bfc.fr/",
  },
  {
    title: "CAF du Doubs",
    detail: "Prestations, logement et rendez-vous",
    url: "https://www.caf.fr/allocataires/caf-du-doubs",
  },
  {
    title: "Préfecture du Doubs",
    detail: "Démarches et informations officielles",
    url: "https://www.doubs.gouv.fr/",
  },
  {
    title: "Nightline",
    detail: "Écoute étudiante — consultez le site pour les horaires et le service disponible",
    url: "https://nightline.fr/",
  },
  {
    title: "AGORAé",
    detail: "Épiceries solidaires étudiantes — informations et accès",
    url: "https://agorae.fage.org/",
  },
];

const publicHeroSlides = [
  {
    image: "/site-amazone-cc0.jpg",
    imageAlt: "La statue de l’Amazone à Cotonou",
    position: "center 50%",
    title: "La solidarité commence par une rencontre.",
    description: "Un espace d’entraide pour les étudiants béninois de Besançon : explorez librement, puis participez quand vous le souhaitez.",
  },
  {
    image: "/mairie-cotonou-cc0.jpg",
    imageAlt: "Une rue animée de Cotonou",
    position: "center 60%",
    title: "Un objet à donner, une aide à demander.",
    description: "Vaisselle, vêtements, mobilier, services : partagez ce qui peut aider quelqu’un près de vous.",
  },
  {
    image: "/plage-fidjrosse.jpg",
    imageAlt: "La plage de Fidjrossè à Cotonou, au Bénin",
    position: "center 56%",
    title: "Le Bénin en partage, à Besançon.",
    description: "Un réseau accueillant pour se soutenir, échanger et trouver les bonnes ressources.",
  },
];

function errorText(error) {
  if (error.code === "permission-denied") {
    return "Accès refusé par Firestore. Vérifiez le rôle du compte et le déploiement des règles de sécurité.";
  }
  return error.message || "Une erreur est survenue. Réessayez.";
}

function phoneToWhatsApp(phone) {
  let digits = (phone || "").replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `33${digits.slice(1)}`;
  return digits ? `https://wa.me/${digits}` : null;
}

function phoneToTelephone(phone) {
  const value = (phone || "").replace(/[^\d+]/g, "");
  return value ? `tel:${value}` : null;
}

function imageFileError(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return "Choisissez une image JPG, PNG ou WebP.";
  }
  if (file.size > 5 * 1024 * 1024) {
    return "L’image ne doit pas dépasser 5 Mo.";
  }
  return "";
}

async function requestCloudinaryImage(user, payload) {
  const idToken = await user.getIdToken();
  const response = await fetch("/api/cloudinary-image", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || "Impossible de gérer cette image.");
  }
  return result;
}

async function uploadCloudinaryImage(user, file, purpose, assetId) {
  const signedUpload = await requestCloudinaryImage(user, {
    action: "sign-upload",
    purpose,
    assetId,
  });
  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", signedUpload.apiKey);
  formData.append("timestamp", signedUpload.timestamp);
  formData.append("public_id", signedUpload.publicId);
  formData.append("upload_preset", signedUpload.uploadPreset);
  formData.append("overwrite", "false");
  formData.append("signature", signedUpload.signature);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(signedUpload.cloudName)}/image/upload`,
    { method: "POST", body: formData },
  );
  const result = await response.json().catch(() => null);
  if (!response.ok || typeof result?.secure_url !== "string") {
    throw new Error(result?.error?.message || "L’envoi de l’image a échoué.");
  }
  return result.secure_url;
}

async function deleteCloudinaryImage(user, purpose, assetId) {
  await requestCloudinaryImage(user, { action: "delete", purpose, assetId });
}

function isCloudinaryImageUrl(value) {
  try {
    return new URL(value).hostname === "res.cloudinary.com";
  } catch {
    return false;
  }
}

function formatDate(value) {
  if (!value?.toDate) return "À l’instant";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value.toDate());
}

function formatMessageTime(value) {
  if (!value?.toDate) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(value.toDate());
}

function FormError({ children }) {
  return children ? <p className="error-message" role="alert">{children}</p> : null;
}

function memberFullName(member) {
  return [member?.prenom, member?.nom]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join(" ");
}

function memberInitials(member) {
  const name = memberFullName(member) || member?.pseudoAnonyme || "AEBB";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => Array.from(part)[0] || "")
    .join("")
    .toLocaleUpperCase("fr");
}

function chatAvatarLabel(pseudo) {
  const number = typeof pseudo === "string" ? pseudo.match(/\d+/)?.[0] : "";
  return number ? number.slice(-2) : "ET";
}

function AnnouncementDetailsDialog({
  item,
  onClose,
  onNavigate,
  isPrivileged = false,
  isOwn = false,
  reservedContact = "",
}) {
  useEffect(() => {
    if (!item) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [item, onClose]);

  if (!item) return null;

  const resolved = item.statut === "resolu";
  const telephone = !isOwn && !item.estAnonyme && !resolved && item.contactPublic
    ? phoneToTelephone(item.contactPublic)
    : null;
  const whatsapp = !isOwn && !item.estAnonyme && !resolved && item.contactPublic
    ? phoneToWhatsApp(item.contactPublic)
    : null;

  return (
    <div
      className="announcement-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="announcement-dialog-title"
        aria-modal="true"
        className="announcement-dialog"
        role="dialog"
      >
        <button
          aria-label="Fermer les détails"
          className="announcement-dialog-close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
        <div className="announcement-topline">
          <span className={`category-pill ${item.type}`}>
            {item.type === "don" ? "Don" : "Demande"}
          </span>
          <span className={`status-pill ${item.statut}`}>
            {resolved ? "Résolu" : item.statut === "en_attente" ? "En attente" : "Disponible"}
          </span>
        </div>
        <h2 id="announcement-dialog-title">{item.titre}</h2>
        {item.imageUrl && (
          <div className="announcement-image">
            <img alt={`Photo : ${item.titre}`} src={item.imageUrl} />
          </div>
        )}
        <p className="announcement-description">{item.description}</p>
        <div className="announcement-dialog-author">
          <span>Publié par</span>
          <strong>{isOwn ? "Votre annonce" : item.estAnonyme ? "Membre anonyme AEBB" : item.auteurAffiche || "Membre AEBB"}</strong>
          <span>{item.demo ? "Annonce fictive" : formatDate(item.createdAt)}</span>
        </div>
        {isOwn ? (
          <p className="muted">Vous êtes l’auteur de cette annonce : votre propre numéro de contact n’est pas affiché ici.</p>
        ) : item.estAnonyme ? (
          item.demo ? (
            <p className="muted">Cette annonce d’exemple n’a pas de contact réel.</p>
          ) : isPrivileged && reservedContact ? (
            <div className="reserved-contact">
              <strong>Contact réservé à la commission</strong>
              <a href={`tel:${reservedContact}`}>{reservedContact}</a>
              {phoneToWhatsApp(reservedContact) && (
                <a href={phoneToWhatsApp(reservedContact)} rel="noreferrer" target="_blank">
                  Écrire sur WhatsApp
                </a>
              )}
            </div>
          ) : isPrivileged ? (
            <p className="muted">Les coordonnées sont réservées à la commission.</p>
          ) : (
            <div className="announcement-dialog-contact">
              <p>Pour préserver son anonymat, l’auteur ne peut pas être contacté directement.</p>
              <button
                className="button button-secondary"
                onClick={() => {
                  onClose();
                  onNavigate("/ecoute");
                }}
                type="button"
              >
                Contacter un membre de la commission
              </button>
            </div>
          )
        ) : resolved ? (
          <p className="muted">Cette annonce est résolue; le contact direct n’est plus proposé.</p>
        ) : telephone || whatsapp ? (
          <div className="announcement-dialog-contact">
            <strong>Contacter {item.auteurAffiche || "l’auteur"}</strong>
            {item.contactPublic && <span>{item.contactPublic}</span>}
            <div className="card-actions">
              {telephone && <a className="button button-small button-secondary" href={telephone}>Appeler</a>}
              {whatsapp && (
                <a className="button button-small button-primary" href={whatsapp} rel="noreferrer" target="_blank">
                  Écrire sur WhatsApp
                </a>
              )}
            </div>
          </div>
        ) : (
          <p className="muted">
            {item.demo ? "Cette annonce d’exemple n’a pas de contact réel." : "Aucun contact n’a été communiqué."}
          </p>
        )}
      </section>
    </div>
  );
}

function AnnouncementResolutionDialog({
  item,
  isBackfill,
  person,
  onPersonChange,
  onClose,
  onSubmit,
  busy,
  error,
}) {
  useEffect(() => {
    if (!item) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [item, onClose]);

  if (!item) return null;

  const isDonation = item.type === "don";
  return (
    <div
      className="announcement-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="announcement-resolution-title"
        aria-modal="true"
        className="announcement-dialog"
        role="dialog"
      >
        <button
          aria-label="Fermer"
          className="announcement-dialog-close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
        <p className="eyebrow">Suivi de l’entraide</p>
        <h2 id="announcement-resolution-title">
          {isBackfill
            ? "Compléter le suivi de l’annonce"
            : isDonation
              ? "Confirmer le don effectué"
              : "Confirmer l’aide reçue"}
        </h2>
        <p className="muted">
          {isBackfill
            ? "Cette annonce est déjà clôturée. Ajoutez la personne concernée pour compléter son suivi."
            : isDonation
              ? "À qui avez-vous donné ce bien ?"
              : "Qui vous a donné le bien ou apporté l’aide ?"}
        </p>
        <form className="portal-form" onSubmit={onSubmit}>
          <label>
            {isDonation ? "Prénom, pseudo ou repère du bénéficiaire" : "Prénom, pseudo ou repère du donateur"}
            <input
              autoComplete="off"
              maxLength={100}
              onChange={(event) => onPersonChange(event.target.value)}
              placeholder="Ex. Aïcha ou étudiant rencontré à la résidence"
              required
              value={person}
            />
          </label>
          <small className="muted">
            Ce suivi reste privé : seul l’auteur de l’annonce et la commission pourront le consulter.
            {!isBackfill && " Pour retirer l’annonce sans échange, annulez et choisissez « Supprimer » dans Mon espace."}
          </small>
          {error && <FormError>{error}</FormError>}
          <div className="card-actions">
            <button className="button button-primary" disabled={busy} type="submit">
              {busy ? "Enregistrement…" : isBackfill ? "Enregistrer le suivi" : "Confirmer et clôturer"}
            </button>
            <button className="button button-secondary" disabled={busy} onClick={onClose} type="button">
              Annuler
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function PanelHeading({ eyebrow, title, description, action }) {
  return (
    <div className="panel-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {description && <p className="muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function PublicResourceContent() {
  return (
    <>
      <section className="emergency-grid">
        {publicEmergencyNumbers.map((item) => (
          <a className="emergency-card" href={`tel:${item.number}`} key={item.number}>
            <span className="emergency-number">{item.number}</span>
            <span className="emergency-title">{item.title}</span>
            <span className="muted">{item.detail}</span>
          </a>
        ))}
      </section>
      <section className="card resource-links-card">
        <PanelHeading
          eyebrow="Services et accompagnement"
          title="Les ressources utiles"
          description="Consultez les sites officiels pour vérifier les horaires, conditions et coordonnées à jour."
        />
        <div className="resource-link-list">
          {publicResourceLinks.map((resource) => (
            <a href={resource.url} key={resource.title} rel="noreferrer" target="_blank">
              <span><strong>{resource.title}</strong><small>{resource.detail}</small></span>
              <span aria-hidden="true">↗</span>
            </a>
          ))}
        </div>
      </section>
      <p className="resource-disclaimer">
        En cas de danger immédiat, appelez les services d’urgence. Les liens externes
        renvoient vers leurs sites officiels; leurs contenus et horaires peuvent évoluer.
      </p>
    </>
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon" aria-hidden="true">✦</span>
      <h3>{title}</h3>
      <p className="muted">{text}</p>
    </div>
  );
}

function PublicHeroCarousel({ onSignup, onExplore }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const activeSlide = publicHeroSlides[activeIndex];

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % publicHeroSlides.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [paused]);

  function moveSlide(direction) {
    setActiveIndex((current) =>
      (current + direction + publicHeroSlides.length) % publicHeroSlides.length,
    );
  }

  return (
    <section
      aria-label="Présentation du portail"
      className="public-carousel"
      id="public-accueil"
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
      onFocusCapture={() => setPaused(true)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="public-carousel-images" aria-hidden="true">
        {publicHeroSlides.map((slide, index) => (
          <img
            alt=""
            className={`public-carousel-image ${index === activeIndex ? "active" : ""}`}
            fetchPriority={index === 0 ? "high" : "auto"}
            key={slide.image}
            loading={index === 0 ? "eager" : "lazy"}
            src={slide.image}
            style={{ objectPosition: slide.position }}
          />
        ))}
      </div>
      <div className="public-carousel-shade" aria-hidden="true" />
      <div className="public-carousel-inner">
        <div className="public-carousel-copy" key={activeSlide.title}>
          <p className="eyebrow">AEBB · Besançon</p>
          <h1>{activeSlide.title}</h1>
          <p>{activeSlide.description}</p>
          <div className="public-hero-actions">
            <button className="button button-light" onClick={onExplore} type="button">Explorer l’entraide</button>
            <button className="public-outline-button" onClick={onSignup} type="button">Créer un compte</button>
          </div>
        </div>
        <div className="public-carousel-controls" aria-label="Commandes du carrousel">
          <button aria-label="Image précédente" onClick={() => moveSlide(-1)} type="button">‹</button>
          <div className="public-carousel-dots">
            {publicHeroSlides.map((slide, index) => (
              <button
                aria-current={index === activeIndex ? "true" : undefined}
                aria-label={`Afficher l’image ${index + 1} : ${slide.imageAlt}`}
                className={index === activeIndex ? "active" : ""}
                key={slide.image}
                onClick={() => setActiveIndex(index)}
                type="button"
              />
            ))}
          </div>
          <button aria-label="Image suivante" onClick={() => moveSlide(1)} type="button">›</button>
        </div>
      </div>
    </section>
  );
}

export function PublicPortal({
  page,
  isAuthenticated,
  userId,
  onNavigate,
  onLogin,
  onSignup,
}) {
  const [announcements, setAnnouncements] = useState([]);
  const [myAnnouncementIds, setMyAnnouncementIds] = useState([]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [demoAnnouncementRecords, setDemoAnnouncementRecords] = useState([]);
  const [commissionProfiles, setCommissionProfiles] = useState([]);
  const [demoCommissionRecords, setDemoCommissionRecords] = useState([]);
  const [demoEnabled, setDemoEnabled] = useState(true);
  const [error, setError] = useState("");
  const demoAnnouncements = demoEnabled
    ? getDemoAnnouncements(demoAnnouncementRecords)
    : [];
  const demoCommissionProfiles = demoEnabled
    ? (demoCommissionRecords.length
        ? demoCommissionRecords
        : demoCommissionSeed.map((item) => ({ ...item, demo: true })))
    : [];
  const publicAnnouncements = [...announcements, ...demoAnnouncements]
    .filter((item) => item.statut === "actif")
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  const publicCommission = [...commissionProfiles, ...demoCommissionProfiles]
    .sort((a, b) => (a.nom || "").localeCompare(b.nom || "", "fr"));
  const joinAction = isAuthenticated
    ? () => onNavigate("/dashboard")
    : onSignup;

  useEffect(() => {
    if (!db) return undefined;
    const subscriptions = [
      [
        query(collection(db, "annonces"), where("statut", "in", ["actif", "resolu"])),
        setAnnouncements,
      ],
      [collection(db, "demo_annonces"), setDemoAnnouncementRecords],
      [collection(db, "commission_public"), setCommissionProfiles],
      [collection(db, "demo_commission_public"), setDemoCommissionRecords],
    ].map(([reference, setItems], index) =>
      onSnapshot(
        reference,
        (snapshot) => {
          setItems(snapshot.docs.map((item) => ({
            id: item.id,
            ...(index === 1 || index === 3 ? { demo: true } : {}),
            ...item.data(),
          })));
        },
        (snapshotError) => {
          setError(errorText(snapshotError));
        },
      ),
    );
    subscriptions.push(onSnapshot(
      doc(db, "demo_settings", "seed"),
      (snapshot) => {
        setDemoEnabled(!snapshot.exists() || snapshot.data().enabled !== false);
      },
      (snapshotError) => setError(errorText(snapshotError)),
    ));
    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  }, []);

  useEffect(() => {
    if (!db || !userId) {
      setMyAnnouncementIds([]);
      return undefined;
    }
    return onSnapshot(
      collection(db, "users", userId, "mes_annonces"),
      (snapshot) => setMyAnnouncementIds(snapshot.docs.map((item) => item.id)),
      (snapshotError) => setError(errorText(snapshotError)),
    );
  }, [userId]);

  function navigateToSection(id) {
    const destinations = {
      annonces: "/entraide",
      ecoute: "/ecoute",
      ressources: "/infos-utiles",
    };
    onNavigate(destinations[id] || "/");
  }

  function renderPublicAnnouncement(item) {
    const own = !item.demo && myAnnouncementIds.includes(item.id);
    const whatsapp = !item.estAnonyme && item.contactPublic
      ? phoneToWhatsApp(item.contactPublic)
      : null;
    return (
      <article className="announcement-card" key={`${item.demo ? "demo" : "live"}-${item.id}`}>
        <div className="announcement-topline">
          <span className={`category-pill ${item.type}`}>{item.type === "don" ? "Don" : "Demande"}</span>
          {item.demo && <span className="demo-pill">Exemple</span>}
        </div>
        {item.imageUrl && (
          <div className="announcement-image">
            <img alt={`Photo : ${item.titre}`} loading="lazy" src={item.imageUrl} />
          </div>
        )}
        <h3>{item.titre}</h3>
        <p className="announcement-description">{item.description}</p>
        <div className="announcement-meta">
          <span>{own ? "Votre annonce" : item.estAnonyme ? "Membre anonyme AEBB" : item.auteurAffiche || "Membre AEBB"}</span>
          <span>{item.demo ? "Annonce fictive" : formatDate(item.createdAt)}</span>
        </div>
        <button
          className="text-button announcement-details-button"
          onClick={() => setSelectedAnnouncement(item)}
          type="button"
        >
          {own ? "Voir les détails" : "Voir les détails et le contact"}
        </button>
        {whatsapp && !own && (
          <a className="contact-link" href={whatsapp} rel="noreferrer" target="_blank">
            Contacter sur WhatsApp <span aria-hidden="true">↗</span>
          </a>
        )}
      </article>
    );
  }

  function navigateLink(destination) {
    return (event) => {
      event.preventDefault();
      onNavigate(destination);
    };
  }

  return (
    <main className="page-shell public-shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Accueil AEBB" onClick={navigateLink("/")}>
          <span className="brand-mark small" aria-hidden="true">A</span>
          Portail solidaire
        </a>
        <div className="public-actions">
          {isAuthenticated ? (
            <button className="button button-small button-primary" onClick={joinAction} type="button">
              Mon tableau de bord
            </button>
          ) : (
            <>
              <button className="text-button" onClick={onLogin} type="button">Connexion</button>
              <button className="button button-small button-primary" onClick={onSignup} type="button">Rejoindre</button>
            </>
          )}
        </div>
      </header>
      <nav className="public-nav" aria-label="Navigation publique">
        <a aria-current={page === "/" ? "page" : undefined} className={page === "/" ? "active" : ""} href="/" onClick={navigateLink("/")}>Accueil</a>
        <a aria-current={page === "/entraide" ? "page" : undefined} className={page === "/entraide" ? "active" : ""} href="/entraide" onClick={navigateLink("/entraide")}>Dons & demandes</a>
        <a aria-current={page === "/ecoute" ? "page" : undefined} className={page === "/ecoute" ? "active" : ""} href="/ecoute" onClick={navigateLink("/ecoute")}>La commission</a>
        <a aria-current={page === "/infos-utiles" ? "page" : undefined} className={page === "/infos-utiles" ? "active" : ""} href="/infos-utiles" onClick={navigateLink("/infos-utiles")}>Infos utiles</a>
      </nav>

      {page === "/" && (
        <>
          <PublicHeroCarousel
            onExplore={() => navigateToSection("annonces")}
            onSignup={joinAction}
          />
          <div className="public-feature-row">
            <article><span aria-hidden="true">♡</span><h2>Entraide</h2><p>Objets, services et coups de main partagés entre étudiants.</p></article>
            <article><span aria-hidden="true">◌</span><h2>Écoute</h2><p>Une commission disponible pour accompagner chacun avec bienveillance.</p></article>
            <article><span aria-hidden="true">⌕</span><h2>Confidentialité</h2><p>Les données personnelles et l’annuaire restent protégés.</p></article>
          </div>
          <section className="public-section public-listing">
            <PanelHeading
              eyebrow="Consultation libre"
              title="Dernières annonces"
              description="Parcourez les dons et demandes publiés par la communauté."
              action={<a className="text-button" href="/entraide" onClick={navigateLink("/entraide")}>Tout voir →</a>}
            />
            {error && <FormError>{error}</FormError>}
            {publicAnnouncements.length ? (
              <div className="announcement-grid">
                {publicAnnouncements.slice(0, 3).map(renderPublicAnnouncement)}
              </div>
            ) : (
              <EmptyState title="Aucune annonce pour le moment" text="Revenez bientôt ou créez un compte pour lancer un premier échange." />
            )}
          </section>
          <div className="public-shortcuts">
            <a href="/ecoute" onClick={navigateLink("/ecoute")}>
              <span className="eyebrow">À votre écoute</span>
              <strong>Rencontrer la commission</strong>
              <span aria-hidden="true">→</span>
            </a>
            <a href="/infos-utiles" onClick={navigateLink("/infos-utiles")}>
              <span className="eyebrow">Besançon</span>
              <strong>Consulter les infos utiles</strong>
              <span aria-hidden="true">→</span>
            </a>
          </div>
          <section className="public-callout">
            <div><p className="eyebrow">Rejoindre l’entraide</p><h2>Pour publier, proposer votre aide ou discuter avec la commission, créez un compte.</h2></div>
            <button className="button button-secondary" onClick={joinAction} type="button">
              {isAuthenticated ? "Mon tableau de bord" : "Créer un compte"}
            </button>
          </section>
        </>
      )}

      {page === "/entraide" && (
        <section className="public-section public-listing public-route-content">
          <PanelHeading
            eyebrow="Consultation libre"
            title="Dons & demandes"
            description="Vous pouvez parcourir les annonces sans compte. Pour publier ou gérer une annonce, créez un compte."
            action={<button className="button button-small button-primary" onClick={joinAction} type="button">Participer</button>}
          />
          {error && <FormError>{error}</FormError>}
          {publicAnnouncements.length ? (
            <div className="announcement-grid">
              {publicAnnouncements.map(renderPublicAnnouncement)}
            </div>
          ) : (
            <EmptyState title="Aucune annonce pour le moment" text="Revenez bientôt ou créez un compte pour lancer un premier échange." />
          )}
        </section>
      )}

      {page === "/ecoute" && (
        <section className="public-section public-route-content">
          <PanelHeading
            eyebrow="AEBB · Besançon"
            title="La commission sociale"
            description="Retrouvez les contacts WhatsApp des membres. Sur le site, les messages anonymes arrivent à la commission entière, sans choisir de destinataire."
            action={(
              <button
                className="button button-small button-primary"
                onClick={isAuthenticated ? () => onNavigate("/dashboard/ecoute") : onLogin}
                type="button"
              >
                {isAuthenticated ? "Accéder au chat anonyme" : "Se connecter pour écrire anonymement"}
              </button>
            )}
          />
          {error && <FormError>{error}</FormError>}
          {publicCommission.length ? (
            <div className="commission-grid">
              {publicCommission.map((member) => (
                <article className="commission-card" key={member.id}>
                  {member.photoUrl ? (
                    <img className="commission-portrait" alt={`Portrait de ${member.nom}`} loading="lazy" src={member.photoUrl} />
                  ) : (
                    <div className="avatar-circle" aria-hidden="true">{(member.nom || "A").trim().charAt(0).toUpperCase()}</div>
                  )}
                  <div className="commission-info">
                    <h3>{member.nom}</h3>
                    <p className="muted">{member.fonction}</p>
                  </div>
                  {member.demo ? (
                    <span className="demo-pill commission-demo-tag">Exemple · non joignable</span>
                  ) : (
                    <div className="commission-actions">
                      {phoneToTelephone(member.telephoneWhatsApp) && (
                        <a className="commission-phone" href={phoneToTelephone(member.telephoneWhatsApp)}>
                          {member.telephoneWhatsApp}
                        </a>
                      )}
                      {phoneToWhatsApp(member.telephoneWhatsApp) && (
                        <a className="button button-small button-secondary" href={phoneToWhatsApp(member.telephoneWhatsApp)} rel="noreferrer" target="_blank">Écrire sur WhatsApp</a>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="La commission publiera bientôt ses coordonnées" text="Les informations et numéros d’urgence restent disponibles sans compte." />
          )}
        </section>
      )}

      {page === "/infos-utiles" && (
        <section className="public-section public-resources-section public-route-content">
          <PanelHeading
            eyebrow="Besançon · accès libre"
            title="Besoin d’aide maintenant ?"
            description="Les numéros d’urgence et les ressources essentielles restent accessibles sans compte."
          />
          <PublicResourceContent />
        </section>
      )}

      <AnnouncementDetailsDialog
        isOwn={Boolean(selectedAnnouncement && !selectedAnnouncement.demo && myAnnouncementIds.includes(selectedAnnouncement.id))}
        item={selectedAnnouncement}
        onClose={() => setSelectedAnnouncement(null)}
        onNavigate={onNavigate}
      />
      <footer className="portal-footer">
        <span>AEBB · Besançon</span>
        <span>Consultation libre · Participation avec compte.</span>
      </footer>
    </main>
  );
}

export default function Portal({
  user,
  profile,
  route,
  onNavigate,
  onSignOut,
  members,
  membersError,
  membersLoading,
  onRoleChange,
}) {
  const routeTab = route === "/dashboard"
    ? "accueil"
    : route.replace(/^\/dashboard\//, "");
  const activeTab = tabs.some((tab) => tab.id === routeTab) ? routeTab : "accueil";
  const [announcements, setAnnouncements] = useState([]);
  const [ownedAnnouncements, setOwnedAnnouncements] = useState([]);
  const [demoAnnouncementRecords, setDemoAnnouncementRecords] = useState([]);
  const [myAnnouncementIds, setMyAnnouncementIds] = useState([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(true);
  const [announcementsError, setAnnouncementsError] = useState("");
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [resolutionItem, setResolutionItem] = useState(null);
  const [resolutionPerson, setResolutionPerson] = useState("");
  const [memberForm, setMemberForm] = useState({
    prenom: profile.prenom || "",
    nom: profile.nom || "",
  });
  const [privateContacts, setPrivateContacts] = useState({});
  const [privateContactsError, setPrivateContactsError] = useState("");
  const [privateContactsLoading, setPrivateContactsLoading] = useState(true);
  const [commissionProfiles, setCommissionProfiles] = useState([]);
  const [demoCommissionRecords, setDemoCommissionRecords] = useState([]);
  const [demoEnabled, setDemoEnabled] = useState(true);
  const [commissionProfilesError, setCommissionProfilesError] = useState("");
  const [chats, setChats] = useState([]);
  const [chatsError, setChatsError] = useState("");
  const [chatsLoading, setChatsLoading] = useState(true);
  const [selectedChatId, setSelectedChatId] = useState("");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [messagesError, setMessagesError] = useState("");
  const [messagesLoadError, setMessagesLoadError] = useState("");
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesLoadedChatId, setMessagesLoadedChatId] = useState("");
  const [messageSending, setMessageSending] = useState(false);
  const messageListRef = useRef(null);
  const [directoryEntries, setDirectoryEntries] = useState([]);
  const [myDirectoryEntries, setMyDirectoryEntries] = useState([]);
  const [directoryError, setDirectoryError] = useState("");
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [announcementType, setAnnouncementType] = useState("all");
  const [directoryTypeFilter, setDirectoryTypeFilter] = useState("all");
  const [announcementImageFile, setAnnouncementImageFile] = useState(null);
  const [announcementImagePreview, setAnnouncementImagePreview] = useState("");
  const [announcementImageError, setAnnouncementImageError] = useState("");
  const announcementImageInput = useRef(null);
  const [commissionPhotoFile, setCommissionPhotoFile] = useState(null);
  const [commissionPhotoPreview, setCommissionPhotoPreview] = useState("");
  const [commissionPhotoError, setCommissionPhotoError] = useState("");
  const commissionPhotoInput = useRef(null);
  const [announcementForm, setAnnouncementForm] = useState({
    titre: "",
    type: "don",
    description: "",
    estAnonyme: false,
  });
  const [commissionForm, setCommissionForm] = useState({
    nom: "",
    fonction: "",
    telephoneWhatsApp: "",
    photoUrl: "",
    photoId: "",
  });
  const [directoryForm, setDirectoryForm] = useState({
    type: "hebergement",
    nom: "",
    telephone: "",
    quartier: "",
    details: "",
    disponible: true,
  });
  const readReceiptInFlight = useRef(new Set());
  const [messageDraft, setMessageDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const demoAnnouncements = demoEnabled
    ? getDemoAnnouncements(demoAnnouncementRecords)
    : [];
  const demoCommissionProfiles = demoEnabled
    ? (demoCommissionRecords.length
        ? demoCommissionRecords
        : demoCommissionSeed.map((item) => ({ ...item, demo: true })))
    : [];
  const allCommissionProfiles = [...commissionProfiles, ...demoCommissionProfiles]
    .sort((a, b) => (a.nom || "").localeCompare(b.nom || "", "fr"));
  const isPrivileged = ["commission", "admin"].includes(profile.role);
  const isAdmin = profile.role === "admin";
  const visibleTabs = tabs.filter(
    (tab) => (!tab.private || isPrivileged) && (!tab.admin || isAdmin),
  );
  const selectedChat = chats.find((chat) => chat.id === selectedChatId);

  const unreadChatCount = chats.filter((chat) => isChatUnread(chat, isPrivileged)).length;

  useEffect(() => {
    setMemberForm({
      prenom: profile.prenom || "",
      nom: profile.nom || "",
    });
  }, [profile.prenom, profile.nom]);

  useEffect(() => {
    if (activeTab !== "messagerie") setMobileChatOpen(false);
  }, [activeTab]);

  function setActiveTab(tabId) {
    showActionMessage("");
    setSelectedAnnouncement(null);
    setResolutionItem(null);
    onNavigate(tabId === "accueil" ? "/dashboard" : `/dashboard/${tabId}`);
  }

  useEffect(() => {
    const ownProfile = commissionProfiles.find((item) => item.id === user.uid);
    if (ownProfile) {
      setCommissionForm({
        nom: ownProfile.nom || "",
        fonction: ownProfile.fonction || "",
        telephoneWhatsApp: ownProfile.telephoneWhatsApp || "",
        photoUrl: ownProfile.photoUrl || "",
        photoId: ownProfile.photoId || "",
      });
    }
  }, [commissionProfiles, user.uid]);

  useEffect(() => {
    if (!announcementImageFile) {
      setAnnouncementImagePreview("");
      return undefined;
    }
    const previewUrl = URL.createObjectURL(announcementImageFile);
    setAnnouncementImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [announcementImageFile]);

  useEffect(() => {
    if (!commissionPhotoFile) {
      setCommissionPhotoPreview("");
      return undefined;
    }
    const previewUrl = URL.createObjectURL(commissionPhotoFile);
    setCommissionPhotoPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [commissionPhotoFile]);

  useEffect(() => {
    const announcementsQuery = isPrivileged
      ? collection(db, "annonces")
      : query(collection(db, "annonces"), where("statut", "in", ["actif", "resolu"]));
    const unsubscribe = onSnapshot(
      announcementsQuery,
      (snapshot) => {
        const nextAnnouncements = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort((a, b) => {
            const aTime = a.createdAt?.toMillis?.() || 0;
            const bTime = b.createdAt?.toMillis?.() || 0;
            return bTime - aTime;
          });
        setAnnouncements(nextAnnouncements);
        setAnnouncementsLoading(false);
        setAnnouncementsError("");
      },
      (error) => {
        setAnnouncementsError(errorText(error));
        setAnnouncementsLoading(false);
      },
    );
    return unsubscribe;
  }, [isPrivileged]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "demo_annonces"),
      (snapshot) => setDemoAnnouncementRecords(
        snapshot.docs.map((item) => ({ id: item.id, demo: true, ...item.data() })),
      ),
      (error) => setAnnouncementsError(errorText(error)),
    );
    return unsubscribe;
  }, []);

  useEffect(() => onSnapshot(
    doc(db, "demo_settings", "seed"),
    (snapshot) => setDemoEnabled(!snapshot.exists() || snapshot.data().enabled !== false),
    (error) => setAnnouncementsError(errorText(error)),
  ), []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "users", user.uid, "mes_annonces"),
      (snapshot) => setMyAnnouncementIds(snapshot.docs.map((item) => item.id)),
      (error) => setAnnouncementsError(errorText(error)),
    );
    return unsubscribe;
  }, [user.uid]);

  useEffect(() => {
    if (isPrivileged || myAnnouncementIds.length === 0) {
      setOwnedAnnouncements([]);
      return undefined;
    }

    let cancelled = false;
    Promise.all(
      myAnnouncementIds.map(async (announcementId) => {
        const snapshot = await getDoc(doc(db, "annonces", announcementId));
        return snapshot.exists()
          ? { id: snapshot.id, ...snapshot.data() }
          : null;
      }),
    ).then((items) => {
      if (!cancelled) {
        setOwnedAnnouncements(items.filter(Boolean));
        setAnnouncementsError("");
      }
    }).catch((error) => {
      if (!cancelled) setAnnouncementsError(errorText(error));
    });

    return () => {
      cancelled = true;
    };
  }, [isPrivileged, myAnnouncementIds]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "users", user.uid, "mes_inscriptions"),
      (snapshot) => setMyDirectoryEntries(
        snapshot.docs.map((item) => ({ id: item.id, userId: user.uid, ...item.data() })),
      ),
      (error) => setDirectoryError(errorText(error)),
    );
    return unsubscribe;
  }, [user.uid]);

  useEffect(() => {
    const contactItems = isPrivileged ? announcements : ownedAnnouncements;
    if (contactItems.length === 0) {
      setPrivateContacts({});
      setPrivateContactsError("");
      setPrivateContactsLoading(false);
      return undefined;
    }

    let active = true;
    setPrivateContactsLoading(true);
    Promise.all(
      contactItems.filter((item) => !item.demo).map(async (item) => {
        const snapshot = await getDoc(
          doc(db, "annonces", item.id, "prive", "contact"),
        );
        return [item.id, snapshot.exists() ? snapshot.data() : null];
      }),
    )
      .then((entries) => {
        if (active) {
          setPrivateContacts(Object.fromEntries(entries));
          setPrivateContactsError("");
          setPrivateContactsLoading(false);
        }
      })
      .catch((error) => {
        if (active) {
          setPrivateContactsError(errorText(error));
          setPrivateContactsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [announcements, isPrivileged, ownedAnnouncements]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "commission_public"),
      (snapshot) => {
        setCommissionProfiles(
          snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .sort((a, b) => (a.nom || "").localeCompare(b.nom || "", "fr")),
        );
        setCommissionProfilesError("");
      },
      (error) => setCommissionProfilesError(errorText(error)),
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "demo_commission_public"),
      (snapshot) => setDemoCommissionRecords(
        snapshot.docs.map((item) => ({ id: item.id, demo: true, ...item.data() })),
      ),
      (error) => setCommissionProfilesError(errorText(error)),
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    setChatsLoading(true);
    const chatsQuery = profile.role === "etudiant"
      ? query(collection(db, "chats"), where("etudiantId", "==", user.uid))
      : collection(db, "chats");
    const unsubscribe = onSnapshot(
      chatsQuery,
      (snapshot) => {
        const nextChats = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort((a, b) => {
            const aTime = a.updatedAt?.toMillis?.() || 0;
            const bTime = b.updatedAt?.toMillis?.() || 0;
            return bTime - aTime;
          });
        setChats(nextChats);
        setChatsError("");
        setChatsLoading(false);
        setSelectedChatId((current) =>
          current && nextChats.some((chat) => chat.id === current)
            ? current
            : nextChats[0]?.id || "",
        );
      },
      (error) => {
        setChatsError(errorText(error));
        setChatsLoading(false);
      },
    );
    return unsubscribe;
  }, [isAdmin, profile.role, user.uid]);

  useEffect(() => {
    if (!selectedChatId) {
      setMessages([]);
      setMessagesError("");
      setMessagesLoadError("");
      setMessagesLoadedChatId("");
      return undefined;
    }
    setMessages([]);
    setMessagesError("");
    setMessagesLoadError("");
    setMessagesLoadedChatId("");
    setMessagesLoading(true);
    const messagesQuery = query(
      collection(db, "chats", selectedChatId, "messages"),
      orderBy("createdAt", "asc"),
      limit(100),
    );
    const unsubscribe = onSnapshot(
      messagesQuery,
      (snapshot) => {
        setMessages(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        setMessagesLoadedChatId(selectedChatId);
        setMessagesLoading(false);
      },
      (error) => {
        setMessagesLoadError(errorText(error));
        setMessagesLoading(false);
      },
    );
    return unsubscribe;
  }, [selectedChatId]);

  useEffect(() => {
    const messageList = messageListRef.current;
    if (messageList) messageList.scrollTop = messageList.scrollHeight;
  }, [messages, selectedChatId]);

  useEffect(() => {
    if (
      activeTab !== "messagerie"
      || !selectedChat
      || messagesLoading
      || messagesLoadedChatId !== selectedChat.id
      || messagesLoadError
      || !isChatUnread(selectedChat, isPrivileged)
      || readReceiptInFlight.current.has(selectedChat.id)
    ) return undefined;

    const chatId = selectedChat.id;
    const readField = isPrivileged
      ? "commissionDerniereLectureAt"
      : "etudiantDerniereLectureAt";
    readReceiptInFlight.current.add(chatId);
    updateDoc(doc(db, "chats", chatId), {
      [readField]: serverTimestamp(),
    })
      .catch((error) => {
        setMessagesError(`Impossible de marquer cette conversation comme lue : ${errorText(error)}`);
      })
      .finally(() => readReceiptInFlight.current.delete(chatId));
    return undefined;
  }, [
    activeTab,
    isPrivileged,
    messagesLoadError,
    messagesLoadedChatId,
    messagesLoading,
    selectedChat,
  ]);

  useEffect(() => {
    if (activeTab !== "annuaire" || !isPrivileged) return undefined;
    setDirectoryLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, "annuaire_solidaire"),
      (snapshot) => {
        setDirectoryEntries(
          snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .sort((a, b) => (a.nom || "").localeCompare(b.nom || "", "fr")),
        );
        setDirectoryError("");
        setDirectoryLoading(false);
      },
      (error) => {
        setDirectoryError(errorText(error));
        setDirectoryLoading(false);
      },
    );
    return unsubscribe;
  }, [activeTab, isPrivileged]);

  const announcementById = new Map(
    [...ownedAnnouncements, ...announcements, ...demoAnnouncements]
      .map((item) => [`${item.demo ? "demo" : "live"}-${item.id}`, item]),
  );
  const allAnnouncements = [...announcementById.values()].sort(
    (a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0),
  );
  const activeAnnouncements = allAnnouncements.filter((item) => item.statut === "actif");
  const pendingAnnouncements = announcements.filter((item) => item.statut === "en_attente");
  const filteredAnnouncements = allAnnouncements.filter(
    (item) =>
      (announcementType === "all" || item.type === announcementType) &&
      item.statut === "actif",
  );
  const myAnnouncementIdSet = new Set(myAnnouncementIds);
  const myAnnouncements = allAnnouncements.filter(
    (item) => !item.demo && myAnnouncementIdSet.has(item.id),
  );
  const activeDirectoryEntries = directoryEntries.filter((item) => item.disponible);
  const filteredDirectoryEntries = activeDirectoryEntries.filter(
    (item) => directoryTypeFilter === "all" || item.type === directoryTypeFilter,
  );

  function showActionMessage(message, error = false) {
    setActionNotice(error ? "" : message);
    setActionError(error ? message : "");
  }

  async function saveMemberProfile(event) {
    event.preventDefault();
    showActionMessage("");
    const prenom = memberForm.prenom.trim();
    const nom = memberForm.nom.trim();
    if (!prenom || !nom || prenom.length > 80 || nom.length > 80) {
      showActionMessage("Saisissez un prénom et un nom de 80 caractères maximum.", true);
      return;
    }

    setBusy(true);
    try {
      await updateDoc(doc(db, "users", user.uid), { prenom, nom });
      setMemberForm({ prenom, nom });
      showActionMessage("Vos informations ont été enregistrées.");
    } catch (error) {
      showActionMessage(errorText(error), true);
    } finally {
      setBusy(false);
    }
  }

  function selectAnnouncementImage(event) {
    const file = event.currentTarget.files?.[0];
    setAnnouncementImageError("");
    if (!file) {
      setAnnouncementImageFile(null);
      return;
    }
    const validationError = imageFileError(file);
    if (validationError) {
      setAnnouncementImageFile(null);
      event.currentTarget.value = "";
      setAnnouncementImageError(validationError);
      return;
    }
    setAnnouncementImageFile(file);
  }

  async function notifyCommission(eventType, documentId, messageId) {
    const response = await fetch("/api/notify", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await user.getIdToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        eventType,
        documentId,
        ...(messageId ? { messageId } : {}),
      }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.sent !== true) {
      throw new Error(result?.error || "Le courriel de notification n’a pas pu être envoyé.");
    }
  }

  function selectCommissionPhoto(event) {
    const file = event.currentTarget.files?.[0];
    setCommissionPhotoError("");
    if (!file) {
      setCommissionPhotoFile(null);
      return;
    }
    const validationError = imageFileError(file);
    if (validationError) {
      setCommissionPhotoFile(null);
      event.currentTarget.value = "";
      setCommissionPhotoError(validationError);
      return;
    }
    setCommissionPhotoFile(file);
  }

  function removeAnnouncementImage() {
    setAnnouncementImageFile(null);
    setAnnouncementImageError("");
    if (announcementImageInput.current) announcementImageInput.current.value = "";
  }

  function removeCommissionPhoto() {
    setCommissionPhotoFile(null);
    setCommissionPhotoError("");
    if (commissionPhotoInput.current) commissionPhotoInput.current.value = "";
  }

  async function createAnnouncement(event) {
    event.preventDefault();
    showActionMessage("");
    const publicName = memberFullName(profile);
    if (!announcementForm.estAnonyme && !publicName) {
      showActionMessage(
        "Ajoutez votre prénom et votre nom dans Mon espace, ou choisissez le mode anonyme.",
        true,
      );
      return;
    }
    if (announcementImageError) {
      showActionMessage(announcementImageError, true);
      return;
    }
    setBusy(true);
    let uploadedImageId = null;
    try {
      const announcementRef = doc(collection(db, "annonces"));
      let imageUrl = "";
      if (announcementImageFile) {
        imageUrl = await uploadCloudinaryImage(
          user,
          announcementImageFile,
          "announcement",
          announcementRef.id,
        );
        uploadedImageId = announcementRef.id;
      }
      const batch = writeBatch(db);
      batch.set(announcementRef, {
        titre: announcementForm.titre.trim(),
        description: announcementForm.description.trim(),
        type: announcementForm.type,
        estAnonyme: announcementForm.estAnonyme,
        statut: "en_attente",
        auteurAffiche: announcementForm.estAnonyme
          ? "Membre anonyme AEBB"
          : publicName,
        contactPublic: announcementForm.estAnonyme ? null : profile.telephone,
        createdAt: serverTimestamp(),
        ...(imageUrl ? { imageUrl } : {}),
      });
      batch.set(doc(db, "annonces", announcementRef.id, "prive", "contact"), {
        auteurId: user.uid,
        telephoneReel: profile.telephone,
      });
      batch.set(doc(db, "users", user.uid, "mes_annonces", announcementRef.id), {
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      setAnnouncementForm({
        titre: "",
        type: "don",
        description: "",
        estAnonyme: false,
      });
      removeAnnouncementImage();
      try {
        await notifyCommission("new-announcement", announcementRef.id);
        showActionMessage("Annonce envoyée. Elle sera visible après validation.");
      } catch (notificationError) {
        showActionMessage(
          `Votre annonce est enregistrée et en attente de validation, mais le courriel n’a pas été envoyé : ${errorText(notificationError)}`,
          true,
        );
      }
    } catch (error) {
      let message = errorText(error);
      if (uploadedImageId) {
        try {
          await deleteCloudinaryImage(user, "announcement", uploadedImageId);
        } catch (cleanupError) {
          message = `${message} Le nettoyage de l’image temporaire a aussi échoué : ${errorText(cleanupError)}`;
        }
      }
      showActionMessage(message, true);
    } finally {
      setBusy(false);
    }
  }

  async function updateAnnouncementStatus(item, status) {
    showActionMessage("");
    if (status !== "actif") {
      showActionMessage("Une annonce doit être clôturée avec son suivi.", true);
      return;
    }
    try {
      await updateDoc(doc(db, "annonces", item.id), { statut: status });
      showActionMessage(
        item.statut === "en_attente"
          ? "Annonce validée et publiée."
          : "Annonce réactivée.",
      );
    } catch (error) {
      showActionMessage(errorText(error), true);
    }
  }

  async function saveAnnouncementResolution(event) {
    event.preventDefault();
    showActionMessage("");
    if (!resolutionItem) return;
    const person = resolutionPerson.trim();
    if (!person || person.length > 100) {
      showActionMessage("Indiquez qui a reçu le don ou apporté l’aide.", true);
      return;
    }
    const contact = privateContacts[resolutionItem.id];
    const isBackfill = resolutionItem.statut === "resolu" && !contact?.suiviPersonne;
    if (resolutionItem.statut === "resolu" && !isBackfill) {
      showActionMessage("Le suivi de cette annonce est déjà enregistré.", true);
      return;
    }

    setBusy(true);
    try {
      const batch = writeBatch(db);
      if (!isBackfill) {
        batch.update(doc(db, "annonces", resolutionItem.id), { statut: "resolu" });
      }
      batch.update(doc(db, "annonces", resolutionItem.id, "prive", "contact"), {
        suiviResultat: resolutionItem.type === "don" ? "don_effectue" : "aide_recue",
        suiviPersonne: person,
        suiviPar: user.uid,
        suiviAt: serverTimestamp(),
      });
      await batch.commit();
      setResolutionItem(null);
      setResolutionPerson("");
      showActionMessage(isBackfill
        ? "Le suivi manquant a été ajouté."
        : "L’annonce est clôturée et le suivi a été enregistré.");
    } catch (error) {
      showActionMessage(errorText(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function deleteAnnouncement(item) {
    if (item.demo || !myAnnouncementIdSet.has(item.id)) {
      showActionMessage("Vous ne pouvez supprimer que vos propres annonces.", true);
      return;
    }
    if (!window.confirm(`Supprimer définitivement « ${item.titre} » ?`)) return;
    showActionMessage("");
    setBusy(true);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, "annonces", item.id));
      batch.delete(doc(db, "annonces", item.id, "prive", "contact"));
      batch.delete(doc(db, "users", user.uid, "mes_annonces", item.id));
      await batch.commit();
      setPrivateContacts((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      setSelectedAnnouncement(null);
      if (isCloudinaryImageUrl(item.imageUrl)) {
        try {
          await deleteCloudinaryImage(user, "announcement", item.id);
        } catch (error) {
          showActionMessage(
            `L’annonce a été supprimée, mais sa photo n’a pas pu l’être : ${errorText(error)}`,
            true,
          );
          return;
        }
      }
      showActionMessage("Votre annonce a été supprimée.");
    } catch (error) {
      showActionMessage(errorText(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function startChat() {
    showActionMessage("");
    if (profile.role !== "etudiant") {
      showActionMessage("Seuls les comptes étudiants peuvent démarrer une conversation anonyme.", true);
      return;
    }

    setBusy(true);
    try {
      const chatRef = doc(collection(db, "chats"));
      await setDoc(chatRef, {
        etudiantId: user.uid,
        etudiantPseudo: profile.pseudoAnonyme,
        createdAt: serverTimestamp(),
        destinataireType: "commission",
        referentId: null,
        referentNom: "Commission sociale",
        identiteRevelee: false,
        telephoneRevele: null,
        dernierMessage: "",
        dernierMessageAt: null,
        dernierMessageId: null,
        dernierExpediteur: null,
        etudiantDerniereLectureAt: serverTimestamp(),
        commissionDerniereLectureAt: null,
        updatedAt: serverTimestamp(),
      });
      setSelectedChatId(chatRef.id);
      setMobileChatOpen(true);
      setActiveTab("messagerie");
      showActionMessage("Conversation créée. Envoyez votre message pour prévenir la commission par courriel.");
    } catch (error) {
      const message = error.code === "permission-denied"
        ? "Firebase a refusé la création. Vérifiez que le compte étudiant possède un profil Firestore et que les règles Firestore sont publiées sur le projet aebb-78847."
        : errorText(error);
      showActionMessage(message, true);
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    if (!selectedChat || !messageDraft.trim()) return;
    if (messageSending) return;
    if (messagesLoadError) return;
    if (messagesLoading || messagesLoadedChatId !== selectedChat.id) {
      setMessagesError("Attendez le chargement de la conversation avant d’envoyer votre message.");
      return;
    }
    const text = messageDraft.trim();
    if (text.length > 4000) {
      setMessagesError("Votre message ne peut pas dépasser 4 000 caractères.");
      return;
    }
    const shouldNotifyCommission = profile.role === "etudiant" && messages.length === 0;
    setMessagesError("");
    setMessageDraft("");
    setMessageSending(true);
    try {
      const batch = writeBatch(db);
      const messageRef = doc(collection(db, "chats", selectedChat.id, "messages"));
      const messageData = {
        senderType: profile.role === "etudiant" ? "etudiant" : "commission",
        texte: text,
        createdAt: serverTimestamp(),
      };
      if (profile.role === "etudiant") messageData.senderId = user.uid;
      batch.set(messageRef, messageData);
      batch.update(doc(db, "chats", selectedChat.id), {
        dernierMessage: text,
        dernierMessageAt: serverTimestamp(),
        dernierMessageId: messageRef.id,
        dernierExpediteur: messageData.senderType,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      if (shouldNotifyCommission) {
        try {
          await notifyCommission("new-message", selectedChat.id, messageRef.id);
        } catch (notificationError) {
          setMessagesError(
            `Votre message est envoyé, mais le courriel de notification n’a pas été envoyé : ${errorText(notificationError)}`,
          );
        }
      }
    } catch (error) {
      setMessageDraft(text);
      setMessagesError(errorText(error));
    } finally {
      setMessageSending(false);
    }
  }

  async function revealIdentity() {
    if (!selectedChat) return;
    setMessagesError("");
    try {
      await updateDoc(doc(db, "chats", selectedChat.id), {
        identiteRevelee: true,
        telephoneRevele: profile.telephone,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      setMessagesError(errorText(error));
    }
  }

  async function saveCommissionProfile(event) {
    event.preventDefault();
    showActionMessage("");
    if (commissionPhotoError) {
      showActionMessage(commissionPhotoError, true);
      return;
    }
    if (!commissionPhotoFile && !commissionForm.photoUrl) {
      showActionMessage("Ajoutez un portrait pour publier votre fiche de contact.", true);
      return;
    }
    setBusy(true);
    let uploadedPhotoId = null;
    let photoUrl = commissionForm.photoUrl;
    let photoId = commissionForm.photoId;
    try {
      if (commissionPhotoFile) {
        photoId = doc(collection(db, "commission_public")).id;
        photoUrl = await uploadCloudinaryImage(
          user,
          commissionPhotoFile,
          "commission",
          photoId,
        );
        uploadedPhotoId = photoId;
      }
      await setDoc(doc(db, "commission_public", user.uid), {
        nom: commissionForm.nom.trim(),
        fonction: commissionForm.fonction.trim(),
        telephoneWhatsApp: commissionForm.telephoneWhatsApp.trim(),
        photoUrl,
        photoId,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      let message = errorText(error);
      if (uploadedPhotoId) {
        try {
          await deleteCloudinaryImage(user, "commission", uploadedPhotoId);
        } catch (cleanupError) {
          message = `${message} Le nettoyage du nouveau portrait a aussi échoué : ${errorText(cleanupError)}`;
        }
      }
      setBusy(false);
      showActionMessage(message, true);
      return;
    }

    const previousProfile = commissionProfiles.find((item) => item.id === user.uid);
    const previousPhotoId = previousProfile?.photoId;
    setCommissionForm((current) => ({ ...current, photoUrl, photoId }));
    setCommissionPhotoFile(null);
    if (commissionPhotoInput.current) commissionPhotoInput.current.value = "";

    if (previousPhotoId
      && previousPhotoId !== photoId
      && isCloudinaryImageUrl(previousProfile?.photoUrl)) {
      try {
        await deleteCloudinaryImage(user, "commission", previousPhotoId);
      } catch (error) {
        setBusy(false);
        showActionMessage(
          `La fiche est publiée, mais l’ancien portrait n’a pas pu être supprimé : ${errorText(error)}`,
          true,
        );
        return;
      }
    }
    setBusy(false);
    showActionMessage("Votre fiche de contact est publiée.");
  }

  async function seedDemoData() {
    showActionMessage("");
    setBusy(true);
    try {
      const batch = writeBatch(db);
      demoAnnouncementSeed.forEach(({ id, ...announcement }) => {
        const announcementData = { ...announcement };
        delete announcementData.imageUrl;
        batch.set(doc(db, "demo_annonces", id), {
          ...announcementData,
          demo: true,
          createdAt: serverTimestamp(),
        });
      });
      demoCommissionSeed.forEach(({ id, ...member }) => {
        batch.set(doc(db, "demo_commission_public", id), {
          ...member,
          demo: true,
        });
      });
      batch.set(doc(db, "demo_settings", "seed"), {
        enabled: true,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      showActionMessage("Les exemples de démonstration sont en ligne.");
    } catch (error) {
      showActionMessage(errorText(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function clearDemoData() {
    showActionMessage("");
    setBusy(true);
    try {
      const [announcementSnapshot, commissionSnapshot] = await Promise.all([
        getDocs(collection(db, "demo_annonces")),
        getDocs(collection(db, "demo_commission_public")),
      ]);
      const demoDocs = [
        ...announcementSnapshot.docs.filter((item) => item.data().demo === true),
        ...commissionSnapshot.docs.filter((item) => item.data().demo === true),
      ];
      const batch = writeBatch(db);
      demoDocs.forEach((item) => batch.delete(item.ref));
      batch.set(doc(db, "demo_settings", "seed"), {
        enabled: false,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      showActionMessage("Les exemples ont été supprimés et masqués sur le portail.");
    } catch (error) {
      showActionMessage(errorText(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function submitDirectoryEntry(event) {
    event.preventDefault();
    showActionMessage("");
    setBusy(true);
    try {
      const entryRef = doc(collection(db, "annuaire_solidaire"));
      const entry = {
        ...directoryForm,
        nom: directoryForm.nom.trim(),
        telephone: profile.telephone,
        quartier: directoryForm.quartier.trim(),
        details: directoryForm.details.trim(),
        userId: user.uid,
      };
      const batch = writeBatch(db);
      batch.set(entryRef, entry);
      batch.set(doc(db, "users", user.uid, "mes_inscriptions", entryRef.id), {
        type: entry.type,
        quartier: entry.quartier,
        details: entry.details,
        disponible: entry.disponible,
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      setDirectoryForm({
        type: "hebergement",
        nom: "",
        telephone: "",
        quartier: "",
        details: "",
        disponible: true,
      });
      showActionMessage("Votre proposition a été transmise à la commission.");
    } catch (error) {
      showActionMessage(errorText(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function toggleDirectoryEntry(entry) {
    setDirectoryError("");
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "annuaire_solidaire", entry.id), {
        disponible: !entry.disponible,
      });
      if (entry.userId === user.uid) {
        batch.update(doc(db, "users", user.uid, "mes_inscriptions", entry.id), {
          disponible: !entry.disponible,
        });
      }
      await batch.commit();
    } catch (error) {
      setDirectoryError(errorText(error));
    }
  }

  async function deleteDirectoryEntry(entry) {
    if (!window.confirm("Supprimer cette fiche de l’annuaire ?")) return;
    setDirectoryError("");
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, "annuaire_solidaire", entry.id));
      batch.delete(doc(db, "users", user.uid, "mes_inscriptions", entry.id));
      await batch.commit();
    } catch (error) {
      setDirectoryError(errorText(error));
    }
  }

  function renderAnnouncementCard(item, own = false) {
    const isOwn = own || (!item.demo && myAnnouncementIdSet.has(item.id));
    const whatsapp = item.estAnonyme
      ? null
      : phoneToWhatsApp(item.contactPublic);
    const mayManage = !item.demo
      && (isPrivileged || (isOwn && item.statut !== "en_attente"));
    const reservedContact = privateContacts[item.id]?.telephoneReel;
    const followup = privateContacts[item.id];
    return (
      <article className="announcement-card" key={`${item.demo ? "demo" : "annonce"}-${item.id}`}>
        <div className="announcement-topline">
          <span className={`category-pill ${item.type}`}>
            {item.type === "don" ? "Don" : "Demande"}
          </span>
          {item.demo && <span className="demo-pill">Exemple</span>}
          <span className={`status-pill ${item.statut}`}>
            {item.statut === "en_attente"
              ? "En attente de validation"
              : item.statut === "resolu"
                ? "Résolu"
                : "Disponible"}
          </span>
        </div>
        {item.imageUrl && (
          <div className="announcement-image">
            <img alt={`Photo : ${item.titre}`} loading="lazy" src={item.imageUrl} />
          </div>
        )}
        <h3>{item.titre}</h3>
        <p className="announcement-description">{item.description}</p>
        <div className="announcement-meta">
          <span>{isOwn ? "Votre annonce" : item.estAnonyme ? "Membre anonyme AEBB" : item.auteurAffiche || "Membre AEBB"}</span>
          <span>{item.demo ? "Annonce fictive" : formatDate(item.createdAt)}</span>
        </div>
        {followup?.suiviPersonne && (
          <div className="announcement-followup">
            <strong>Dernier suivi enregistré</strong>
            <span>
              {item.type === "don" ? "Don remis à" : "Aide reçue de"}{" "}
              {followup.suiviPersonne}
            </span>
            {followup.suiviAt && <small>Clôturé le {formatDate(followup.suiviAt)}</small>}
          </div>
        )}
        <button
          className="text-button announcement-details-button"
          onClick={() => setSelectedAnnouncement(item)}
          type="button"
        >
          {own ? "Voir les détails" : "Voir les détails et le contact"}
        </button>
        {isPrivileged && item.estAnonyme && reservedContact && (
          <div className="reserved-contact">
            <span>Contact réservé à la commission</span>
            <a href={`tel:${reservedContact}`}>{reservedContact}</a>
            {phoneToWhatsApp(reservedContact) && (
              <a
                href={phoneToWhatsApp(reservedContact)}
                rel="noreferrer"
                target="_blank"
              >
                WhatsApp
              </a>
            )}
          </div>
        )}
        {!item.estAnonyme && whatsapp && item.statut !== "resolu" && (
          <a className="contact-link" href={whatsapp} rel="noreferrer" target="_blank">
            Contacter sur WhatsApp <span aria-hidden="true">↗</span>
          </a>
        )}
        {mayManage && (
          <div className="card-actions">
            {item.statut === "en_attente" ? (
              <button
                className="button button-small button-primary"
                onClick={() => updateAnnouncementStatus(item, "actif")}
                type="button"
              >
                Valider et publier
              </button>
            ) : item.statut === "resolu" ? (
              <>
                {!followup?.suiviPersonne && !privateContactsLoading && !privateContactsError && (
                  <button
                    className="button button-small button-primary"
                    onClick={() => {
                      setResolutionItem(item);
                      setResolutionPerson("");
                      showActionMessage("");
                    }}
                    type="button"
                  >
                    Ajouter le suivi manquant
                  </button>
                )}
                <button
                  className="button button-small button-secondary"
                  onClick={() => updateAnnouncementStatus(item, "actif")}
                  type="button"
                >
                  Réactiver
                </button>
              </>
            ) : (
              <button
                className="button button-small button-secondary"
                onClick={() => {
                  setResolutionItem(item);
                  setResolutionPerson("");
                  showActionMessage("");
                }}
                type="button"
              >
                Clôturer avec suivi
              </button>
            )}
          </div>
        )}
        {own && (
          <div className="card-actions">
            <button
              className="text-button danger-button"
              disabled={busy}
              onClick={() => deleteAnnouncement(item)}
              type="button"
            >
              Supprimer l’annonce
            </button>
          </div>
        )}
      </article>
    );
  }

  function renderAnnouncements() {
    return (
      <div className="page-content">
        <PanelHeading
          eyebrow="Mur d’entraide"
          title="Dons & demandes"
          description="Un objet, un coup de main ou un besoin ? La communauté est là."
          action={<span className="count-pill">{activeAnnouncements.length} annonce(s)</span>}
        />
        {privateContactsError && <FormError>{privateContactsError}</FormError>}
        {isPrivileged && (
          <section className="card space-section moderation-queue">
            <div className="space-section-heading">
              <div>
                <h3>Annonces en attente de validation</h3>
                <span className="muted">{pendingAnnouncements.length} à examiner</span>
              </div>
            </div>
            {pendingAnnouncements.length ? (
              <div className="announcement-grid">
                {pendingAnnouncements.map((item) => renderAnnouncementCard(item))}
              </div>
            ) : (
              <p className="muted">Aucune annonce à valider pour le moment.</p>
            )}
          </section>
        )}
        <section className="card form-card">
          <h3>Partager avec la communauté</h3>
          <form className="portal-form" onSubmit={createAnnouncement}>
            <label>
              Titre
              <input
                maxLength={100}
                onChange={(event) => setAnnouncementForm({ ...announcementForm, titre: event.target.value })}
                placeholder="Ex. Vaisselle à donner"
                required
                value={announcementForm.titre}
              />
            </label>
            <label>
              Type d’annonce
              <select
                onChange={(event) => setAnnouncementForm({ ...announcementForm, type: event.target.value })}
                value={announcementForm.type}
              >
                <option value="don">Je propose un don</option>
                <option value="demande">Je cherche de l’aide / un objet</option>
              </select>
            </label>
            <p className="muted">
              Toutes les annonces, dons comme demandes, seront visibles après validation par un membre habilité.
            </p>
            <label>
              Description
              <textarea
                maxLength={2000}
                onChange={(event) => setAnnouncementForm({ ...announcementForm, description: event.target.value })}
                placeholder="Donnez quelques détails utiles…"
                required
                rows={4}
                value={announcementForm.description}
              />
            </label>
            <label className="image-upload-label">
              Photo du bien (facultative)
              <input
                accept="image/jpeg,image/png,image/webp"
                onChange={selectAnnouncementImage}
                ref={announcementImageInput}
                type="file"
              />
              <small>JPG, PNG ou WebP · 5 Mo maximum. La photo sera publique, même pour une annonce anonyme.</small>
            </label>
            {announcementImageError && <FormError>{announcementImageError}</FormError>}
            {announcementImagePreview && (
              <div className="announcement-image-preview">
                <img alt="Aperçu de la photo choisie" src={announcementImagePreview} />
                <button className="text-button" onClick={removeAnnouncementImage} type="button">Retirer la photo</button>
              </div>
            )}
            <label className="checkbox-row">
              <input
                checked={announcementForm.estAnonyme}
                onChange={(event) => setAnnouncementForm({ ...announcementForm, estAnonyme: event.target.checked })}
                type="checkbox"
              />
              <span>
                <strong>Publier en mode anonyme</strong>
                <small>Votre numéro restera visible uniquement par la commission.</small>
              </span>
            </label>
            <FormError>{actionError}</FormError>
            {actionNotice && <p className="success-message" role="status">{actionNotice}</p>}
            <button className="button button-primary" disabled={busy} type="submit">
              {busy ? "Envoi…" : "Envoyer pour validation"}
            </button>
          </form>
        </section>

        <div className="filter-row">
          <span className="filter-label">Afficher</span>
          {[
            ["all", "Tout"],
            ["don", "Dons"],
            ["demande", "Demandes"],
          ].map(([value, label]) => (
            <button
              className={`filter-button ${announcementType === value ? "selected" : ""}`}
              key={value}
              onClick={() => setAnnouncementType(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        {announcementsError && <FormError>{announcementsError}</FormError>}
        {announcementsLoading ? (
          <p className="muted">Chargement des annonces…</p>
        ) : filteredAnnouncements.length ? (
          <div className="announcement-grid">
            {filteredAnnouncements.map((item) => renderAnnouncementCard(item))}
          </div>
        ) : (
          <EmptyState title="Pas encore d’annonce" text="Soyez la première personne à proposer ou demander un coup de main." />
        )}
      </div>
    );
  }

  function renderEcoute() {
    const ownPublicProfile = commissionProfiles.find((item) => item.id === user.uid);
    return (
      <div className="page-content">
        <PanelHeading
          eyebrow="Un espace pour parler"
          title="Coin écoute"
          description="Les coordonnées des membres servent aux contacts directs. Les messages envoyés ici arrivent à la commission entière, sans destinataire nominatif."
          action={profile.role === "etudiant" ? (
            <button
              className="button button-small button-primary"
              disabled={busy}
              onClick={startChat}
              type="button"
            >
              {busy ? "Création…" : "Démarrer une nouvelle conversation anonyme"}
            </button>
          ) : null}
        />
        {commissionProfilesError && <FormError>{commissionProfilesError}</FormError>}
        {profile.role === "etudiant" && (
          <div className="notice-card">
            <strong>Une boîte anonyme, partagée avec la commission.</strong>
            <p>
              Votre pseudo étudiant sera visible par les membres habilités, mais
              pas votre nom ni votre numéro, sauf si vous choisissez de le révéler.
              N’importe quel membre de la commission pourra répondre sous le nom
              « Commission sociale ». Pour joindre une personne précise, utilisez
              son contact WhatsApp sur sa fiche.
            </p>
          </div>
        )}
        {(profile.role === "commission" || isAdmin) && !ownPublicProfile && (
          <div className="notice-card">
            <strong>Votre fiche publique est facultative pour répondre aux chats.</strong>
            <p>
              Enregistrez votre nom, votre rôle, votre contact et votre portrait
              ci-dessous si vous souhaitez apparaître dans l’annuaire et être
              contacté directement sur WhatsApp.
            </p>
          </div>
        )}
        {profile.role === "commission" || isAdmin ? (
          <section className="card form-card commission-setup">
            <h3>{ownPublicProfile ? "Mettre à jour ma fiche publique" : "Créer ma fiche de contact"}</h3>
            <p className="muted">Votre nom, votre portrait et votre numéro WhatsApp seront visibles publiquement.</p>
            <form className="portal-form" onSubmit={saveCommissionProfile}>
              <label>
                Prénom / nom affiché
                <input
                  onChange={(event) => setCommissionForm({ ...commissionForm, nom: event.target.value })}
                  placeholder="Ex. Aïcha"
                  required
                  value={commissionForm.nom}
                />
              </label>
              <label>
                Rôle dans la commission
                <input
                  onChange={(event) => setCommissionForm({ ...commissionForm, fonction: event.target.value })}
                  placeholder="Ex. Référente logement"
                  required
                  value={commissionForm.fonction}
                />
              </label>
              <label className="image-upload-label">
                Portrait de la commission
                <input
                  accept="image/jpeg,image/png,image/webp"
                  onChange={selectCommissionPhoto}
                  ref={commissionPhotoInput}
                  type="file"
                />
                <small>Obligatoire pour publier la fiche. JPG, PNG ou WebP · 5 Mo maximum. La photo sera publique.</small>
              </label>
              {commissionPhotoError && <FormError>{commissionPhotoError}</FormError>}
              {(commissionPhotoPreview || commissionForm.photoUrl) && (
                <div className="announcement-image-preview">
                  <img
                    className="commission-photo-preview"
                    alt="Aperçu du portrait"
                    src={commissionPhotoPreview || commissionForm.photoUrl}
                  />
                  {commissionPhotoPreview && (
                    <button className="text-button" onClick={removeCommissionPhoto} type="button">
                      Annuler le nouveau portrait
                    </button>
                  )}
                </div>
              )}
              <label>
                Numéro WhatsApp de contact
                <input
                  autoComplete="tel"
                  inputMode="tel"
                  onChange={(event) => setCommissionForm({ ...commissionForm, telephoneWhatsApp: event.target.value })}
                  placeholder="06 12 34 56 78"
                  required
                  value={commissionForm.telephoneWhatsApp}
                />
              </label>
              <FormError>{actionError}</FormError>
              {actionNotice && <p className="success-message" role="status">{actionNotice}</p>}
              <button className="button button-primary" disabled={busy} type="submit">
                {busy ? "Enregistrement…" : "Enregistrer ma fiche"}
              </button>
            </form>
          </section>
        ) : null}
        {allCommissionProfiles.length ? (
          <div className="commission-grid">
            {allCommissionProfiles.map((member) => {
              const whatsapp = phoneToWhatsApp(member.telephoneWhatsApp);
              const telephone = phoneToTelephone(member.telephoneWhatsApp);
              return (
                <article className="commission-card" key={member.id}>
                  {member.photoUrl ? (
                    <img className="commission-portrait" alt={`Portrait de ${member.nom}`} loading="lazy" src={member.photoUrl} />
                  ) : (
                    <div className="avatar-circle" aria-hidden="true">
                      {(member.nom || "A").trim().charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="commission-info">
                    <h3>{member.nom}</h3>
                    <p className="muted">{member.fonction}</p>
                  </div>
                  <div className="commission-actions">
                    {member.demo && <small className="muted">Exemple fictif · non joignable</small>}
                    {telephone && (
                      <a className="commission-phone" href={telephone}>
                        {member.telephoneWhatsApp}
                      </a>
                    )}
                    {whatsapp && !isOwn && (
                      <a className="button button-small button-secondary" href={whatsapp} rel="noreferrer" target="_blank">
                        Écrire sur WhatsApp
                      </a>
                    )}
                    {isAdmin && member.id !== user.uid && !member.demo && (
                      <button
                        className="text-button danger-button"
                        onClick={async () => {
                          try {
                            await deleteDoc(doc(db, "commission_public", member.id));
                          } catch (error) {
                            setCommissionProfilesError(errorText(error));
                          }
                        }}
                        type="button"
                      >
                        Retirer la fiche
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="La commission arrive bientôt"
            text="Aucun membre n’a encore publié sa fiche de contact. Pour une aide urgente, consultez les ressources utiles."
          />
        )}
      </div>
    );
  }

  function renderMessages() {
    return (
      <div className="page-content">
        <PanelHeading
          eyebrow={isPrivileged ? "Commission sociale" : "Votre suivi"}
          title={isPrivileged ? "Boîte de réception" : "Messagerie"}
          description={isPrivileged
            ? "Les conversations anonymes des étudiants arrivent ici. Toute la commission peut les consulter et y répondre."
            : "Votre conversation privée avec la commission sociale."}
          action={profile.role === "etudiant" ? (
            <button className="button button-small button-primary" disabled={busy} onClick={startChat} type="button">
              {busy ? "Création…" : "Nouvelle conversation anonyme"}
            </button>
          ) : <span className="role-pill">Accès commission</span>}
        />
        <section className="card space-section">
          <div className="space-section-heading">
            <div>
              <h3>{isPrivileged ? "Conversations étudiantes" : "Ma conversation"}</h3>
              <span className="muted">{chats.length} conversation(s)</span>
            </div>
          </div>
          <FormError>{chatsError}</FormError>
          {chatsLoading ? (
            <p className="muted">Chargement des conversations…</p>
          ) : chats.length === 0 ? (
            <p className="muted">
              {isPrivileged
                ? "Aucune conversation reçue pour le moment."
                : "Aucune conversation pour le moment. Utilisez « Écrire anonymement » pour contacter la commission."}
            </p>
          ) : (
            <div className={`chat-layout ${mobileChatOpen ? "mobile-chat-open" : ""}`}>
              <div aria-label="Liste des conversations" className="chat-list" role="region">
                {chats.map((chat) => (
                  <button
                    className={`chat-list-item ${selectedChatId === chat.id ? "selected" : ""}`}
                    key={chat.id}
                    onClick={() => {
                      setSelectedChatId(chat.id);
                      setMobileChatOpen(true);
                    }}
                    type="button"
                  >
                    <span className="chat-avatar" aria-hidden="true">
                      {isPrivileged ? chatAvatarLabel(chat.etudiantPseudo) : "A"}
                    </span>
                    <span className="chat-list-item-content">
                      <span className="chat-list-item-heading">
                        <strong>{isPrivileged ? chat.etudiantPseudo : "Commission sociale"}</strong>
                        {isChatUnread(chat, isPrivileged) && <span className="chat-unread-badge">Nouveau</span>}
                      </span>
                      <span className="chat-list-preview">{chat.dernierMessage || "Conversation démarrée"}</span>
                      <small>{formatDate(chat.updatedAt)}</small>
                    </span>
                  </button>
                ))}
              </div>
              {selectedChat ? (
                <div className="chat-window">
                  <div className="chat-window-heading">
                    <button
                      aria-label="Revenir à la liste des conversations"
                      className="chat-back-button"
                      onClick={() => setMobileChatOpen(false)}
                      type="button"
                    >
                      ‹ <span>Conversations</span>
                    </button>
                    <span className="chat-avatar chat-window-avatar" aria-hidden="true">
                      {isPrivileged ? chatAvatarLabel(selectedChat.etudiantPseudo) : "A"}
                    </span>
                    <div>
                      <strong>{isPrivileged ? selectedChat.etudiantPseudo : "Commission sociale"}</strong>
                      <small>{selectedChat.identiteRevelee ? `Identité révélée · ${selectedChat.telephoneRevele}` : "Conversation anonyme"}</small>
                    </div>
                    {profile.role === "etudiant" && !selectedChat.identiteRevelee && (
                      <button className="text-button" onClick={revealIdentity} type="button">Révéler mon numéro</button>
                    )}
                  </div>
                  {isPrivileged && selectedChat.identiteRevelee && (
                    <p className="revealed-notice">Numéro communiqué avec l’accord de l’étudiant : {selectedChat.telephoneRevele}</p>
                  )}
                  <div aria-live="polite" className="message-list" ref={messageListRef}>
                    {messagesLoading && <p className="muted">Chargement des messages…</p>}
                    {!messagesLoading && messages.length === 0 && (
                      <p className="muted">
                        {isPrivileged
                          ? "Répondez à l’étudiant sous le nom « Commission sociale »."
                          : "Écrivez à la commission. Un membre habilité vous répondra ici."}
                      </p>
                    )}
                    {messages.map((message) => {
                      const senderType = message.senderType
                        || (message.senderId === selectedChat.etudiantId ? "etudiant" : "commission");
                      const isOwnStudentMessage = profile.role === "etudiant"
                        && message.senderId === user.uid;
                      const senderLabel = isOwnStudentMessage
                        ? "Vous"
                        : senderType === "etudiant"
                          ? selectedChat.etudiantPseudo
                          : "Commission sociale";
                      const isOwnMessage = profile.role === "etudiant"
                        ? isOwnStudentMessage
                        : senderType === "commission";
                      return (
                        <div className={`message-bubble ${isOwnMessage ? "mine" : ""}`} key={message.id}>
                          {isPrivileged && <span>{isOwnMessage ? "Vous · Commission" : senderLabel}</span>}
                          <p>{message.texte}</p>
                          <small>{formatMessageTime(message.createdAt)}</small>
                        </div>
                      );
                    })}
                  </div>
                  <FormError>{messagesLoadError || messagesError}</FormError>
                  <form className="message-form" onSubmit={sendMessage}>
                    <label className="sr-only" htmlFor="chat-message">Votre message</label>
                    <textarea
                      id="chat-message"
                      maxLength={4000}
                      onChange={(event) => setMessageDraft(event.target.value)}
                      placeholder="Écrivez votre message…"
                      required
                      rows={1}
                      value={messageDraft}
                    />
                    <button
                      className="button button-primary"
                      disabled={messageSending
                        || messagesLoading
                        || messagesLoadedChatId !== selectedChat.id
                        || Boolean(messagesLoadError)
                        || !messageDraft.trim()}
                      type="submit"
                    >
                      <span className="send-button-label">{messageSending ? "Envoi…" : "Envoyer"}</span>
                      <span aria-hidden="true" className="send-button-icon">➤</span>
                    </button>
                  </form>
                </div>
              ) : (
                <div className="chat-placeholder"><p className="muted">Sélectionnez une conversation pour afficher les messages.</p></div>
              )}
            </div>
          )}
        </section>
      </div>
    );
  }

  function renderMySpace() {
    return (
      <div className="page-content">
        <PanelHeading
          eyebrow="Votre suivi"
          title="Mon espace"
          description="Modifiez vos informations et retrouvez vos annonces et propositions solidaires."
          action={<button className="button button-small button-primary" onClick={() => setActiveTab("messagerie")} type="button">
            Ouvrir la messagerie
          </button>}
        />
        {privateContactsError && <FormError>{privateContactsError}</FormError>}
        <section className="card space-section">
          <div className="space-section-heading">
            <div>
              <h3>Mes informations</h3>
              <span className="muted">Ces informations servent à vous reconnaître et à signer vos annonces publiques.</span>
            </div>
          </div>
          <form className="portal-form profile-form" onSubmit={saveMemberProfile}>
            <label>
              Prénom
              <input
                autoComplete="given-name"
                maxLength={80}
                onChange={(event) => setMemberForm({ ...memberForm, prenom: event.target.value })}
                required
                value={memberForm.prenom}
              />
            </label>
            <label>
              Nom
              <input
                autoComplete="family-name"
                maxLength={80}
                onChange={(event) => setMemberForm({ ...memberForm, nom: event.target.value })}
                required
                value={memberForm.nom}
              />
            </label>
            {actionNotice && <p className="success-message" role="status">{actionNotice}</p>}
            <button className="button button-primary" disabled={busy} type="submit">
              {busy ? "Enregistrement…" : "Enregistrer mes informations"}
            </button>
          </form>
        </section>
        <section className="card space-section">
          <div className="space-section-heading">
            <div><h3>Mes annonces</h3><span className="muted">{myAnnouncements.length} au total</span></div>
            <button className="text-button" onClick={() => setActiveTab("entraide")} type="button">Nouvelle annonce →</button>
          </div>
          {myAnnouncements.length ? (
            <div className="announcement-grid">
              {myAnnouncements.map((item) => renderAnnouncementCard(item, true))}
            </div>
          ) : (
            <p className="muted">Vous n’avez pas encore publié d’annonce.</p>
          )}
        </section>

        <section className="card space-section">
          <div className="space-section-heading">
            <div>
              <h3>Messagerie</h3>
              <span className="muted">{chats.length} conversation(s)</span>
            </div>
            <button className="button button-small button-secondary" onClick={() => setActiveTab("messagerie")} type="button">
              Ouvrir les messages
            </button>
          </div>
          {chatsError && <FormError>{chatsError}</FormError>}
          {!chatsError && chats.length === 0 && (
            <p className="muted">
              {isPrivileged
                ? "Les messages anonymes des étudiants apparaîtront ici."
                : "Votre conversation avec la commission apparaîtra ici."}
            </p>
          )}
        </section>

        <section className="card privacy-callout">
          <div>
            <h3>Mes propositions solidaires</h3>
            <p className="muted">Vos coordonnées ne sont consultables que par la commission. Vous pouvez suspendre une fiche à tout moment.</p>
            {myDirectoryEntries.length ? (
              <div className="my-entry-list">
                {myDirectoryEntries.map((entry) => (
                  <div className="my-entry-row" key={entry.id}>
                    <div>
                      <strong>{directoryCategoryLabel(entry.type)}</strong>
                      <span>{entry.quartier || "Besançon"} · {entry.disponible ? "Disponible" : "Suspendue"}</span>
                      <small>{entry.details}</small>
                    </div>
                    <button className="text-button" onClick={() => toggleDirectoryEntry(entry)} type="button">
                      {entry.disponible ? "Suspendre" : "Réactiver"}
                    </button>
                  </div>
                ))}
              </div>
            ) : <p className="muted">Aucune proposition envoyée pour le moment.</p>}
          </div>
          <button className="button button-secondary" onClick={() => setActiveTab("annuaire")} type="button">Proposer une aide / un besoin</button>
        </section>
      </div>
    );
  }

  function renderDirectory() {
    return (
      <div className="page-content">
        <PanelHeading
          eyebrow={isPrivileged ? "Confidentiel · commission" : "Votre proposition"}
          title={isPrivileged ? "Annuaire solidaire" : "Proposer mon aide"}
          description={isPrivileged
            ? "Les coordonnées et détails des volontaires sont réservés aux membres habilités."
            : "Transmettez vos disponibilités à la commission. Votre fiche et vos coordonnées ne seront pas visibles par les autres étudiants."}
          action={isPrivileged ? <span className="role-pill">Accès commission</span> : null}
        />
        <section className="card form-card">
          <h3>Proposer une aide ou signaler un besoin</h3>
          <p className="muted">Votre fiche sera consultable uniquement par la commission. Ne partagez que les informations nécessaires.</p>
          <form className="portal-form" onSubmit={submitDirectoryEntry}>
            <label>
              Type de proposition
              <select onChange={(event) => setDirectoryForm((current) => ({ ...current, type: event.target.value }))} value={directoryForm.type}>
                <option value="hebergement">Hébergement temporaire</option>
                <option value="colocation">Colocation / logement</option>
                <option value="emploi">Recherche de job étudiant</option>
              </select>
            </label>
            <label>
              Prénom / nom
              <input onChange={(event) => setDirectoryForm((current) => ({ ...current, nom: event.target.value }))} required value={directoryForm.nom} />
            </label>
            <label>
              Téléphone associé à votre compte
              <input autoComplete="tel" readOnly value={profile.telephone} />
            </label>
            <label>
              Quartier ou secteur (facultatif)
              <input onChange={(event) => setDirectoryForm((current) => ({ ...current, quartier: event.target.value }))} value={directoryForm.quartier} />
            </label>
            <label>
              Détails utiles
              <textarea
                maxLength={2000}
                onChange={(event) => setDirectoryForm((current) => ({ ...current, details: event.target.value }))}
                placeholder="Disponibilités, durée, compétences, horaires…"
                required
                rows={4}
                value={directoryForm.details}
              />
            </label>
            <label className="checkbox-row">
              <input checked={directoryForm.disponible} onChange={(event) => setDirectoryForm((current) => ({ ...current, disponible: event.target.checked }))} type="checkbox" />
              <span><strong>Je suis disponible</strong><small>Vous pourrez suspendre votre fiche depuis Mon espace.</small></span>
            </label>
            <FormError>{actionError}</FormError>
            {actionNotice && <p className="success-message" role="status">{actionNotice}</p>}
            <button className="button button-primary" disabled={busy} type="submit">{busy ? "Envoi…" : "Transmettre à la commission"}</button>
          </form>
        </section>

        {isPrivileged && <section className="card directory-list-card">
          <div className="space-section-heading">
            <div><h3>Fiches disponibles</h3><span className="muted">{filteredDirectoryEntries.length} fiche(s) affichée(s)</span></div>
          </div>
          <FormError>{directoryError}</FormError>
          {directoryLoading ? <p className="muted">Chargement de l’annuaire…</p> : activeDirectoryEntries.length ? (
            <>
              <div aria-label="Filtrer les fiches par catégorie" className="directory-filters" role="group">
                <button
                  aria-pressed={directoryTypeFilter === "all"}
                  className={directoryTypeFilter === "all" ? "directory-filter active" : "directory-filter"}
                  onClick={() => setDirectoryTypeFilter("all")}
                  type="button"
                >
                  Toutes ({activeDirectoryEntries.length})
                </button>
                {directoryCategories.map((category) => {
                  const count = activeDirectoryEntries.filter((entry) => entry.type === category.id).length;
                  return (
                    <button
                      aria-pressed={directoryTypeFilter === category.id}
                      className={directoryTypeFilter === category.id ? "directory-filter active" : "directory-filter"}
                      key={category.id}
                      onClick={() => setDirectoryTypeFilter(category.id)}
                      type="button"
                    >
                      {category.label} ({count})
                    </button>
                  );
                })}
              </div>
              {filteredDirectoryEntries.length ? <div className="directory-grid">
              {filteredDirectoryEntries.map((entry) => (
                <article className="directory-entry" key={entry.id}>
                  <div className="announcement-topline">
                    <span className="category-pill">{directoryCategoryLabel(entry.type)}</span>
                    {entry.quartier && <span className="muted">{entry.quartier}</span>}
                  </div>
                  <h3>{entry.nom}</h3>
                  <p>{entry.details}</p>
                  <a className="contact-link" href={`tel:${entry.telephone}`}>{entry.telephone}</a>
                  {entry.userId === user.uid && (
                    <div className="card-actions">
                      <button className="button button-small button-secondary" onClick={() => toggleDirectoryEntry(entry)} type="button">Suspendre ma fiche</button>
                      <button className="text-button danger-button" onClick={() => deleteDirectoryEntry(entry)} type="button">Supprimer</button>
                    </div>
                  )}
                </article>
              ))}
              </div> : (
                <EmptyState
                  title="Aucune fiche dans cette catégorie"
                  text="Choisissez une autre catégorie ou affichez toutes les fiches."
                />
              )}
            </>
          ) : (
            <EmptyState title="Aucune fiche disponible" text="Les propositions apparaîtront ici pour les membres de la commission." />
          )}
        </section>}
      </div>
    );
  }

  function renderAdmin() {
    return (
      <div className="page-content">
        <PanelHeading
          eyebrow="Administration"
          title="Gestion des accès"
          description="Réservez les rôles habilités aux membres qui en ont réellement besoin."
          action={<span className="role-pill">Administrateur</span>}
        />
        <section className="card space-section">
          <div className="space-section-heading">
            <div>
              <h3>À traiter</h3>
              <p className="muted">Accès direct aux annonces à valider et à la boîte de réception anonyme.</p>
            </div>
          </div>
          <div className="card-actions">
            <button className="button button-small button-primary" onClick={() => setActiveTab("entraide")} type="button">
              Annonces à valider ({pendingAnnouncements.length})
            </button>
            <button className="button button-small button-secondary" onClick={() => setActiveTab("messagerie")} type="button">
              Ouvrir la messagerie ({chats.length})
            </button>
          </div>
        </section>
        <section className="card admin-card">
          <div className="space-section-heading">
            <div>
              <h3>Comptes utilisateurs</h3>
              <span className="muted">{members.length} compte(s), actualisés en direct</span>
            </div>
          </div>
          {membersError && <FormError>{membersError}</FormError>}
          {membersLoading ? <p className="muted">Chargement des comptes…</p> : (
            <div className="member-list">
              {members.map((member) => (
                <div className="member-row" key={member.id}>
                  <div className="member-identity">
                    <span aria-hidden="true" className="member-avatar">{memberInitials(member)}</span>
                    <div className="member-identity-copy">
                      <strong className="member-name">{memberFullName(member) || "Nom à compléter"}</strong>
                      <span className="member-contact">{member.telephone || "Compte sans numéro"}</span>
                      <small className="member-pseudo">{member.pseudoAnonyme || "Identifiant anonyme non renseigné"}</small>
                    </div>
                  </div>
                  <div className="member-role-control">
                    <span className="member-role-label">Rôle</span>
                    {member.id === user.uid ? (
                      <span className="role-pill">{roleLabels[member.role] || member.role}</span>
                    ) : (
                      <label className="role-select-label">
                        <span className="sr-only">Rôle de {memberFullName(member) || member.telephone || "ce compte"}</span>
                        <select value={member.role || "etudiant"} onChange={(event) => onRoleChange(member.id, event.target.value)}>
                          {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                    )}
                  </div>
                </div>
              ))}
              {!members.length && <p className="muted">Aucun compte utilisateur trouvé.</p>}
            </div>
          )}
        </section>
        <section className="card admin-guidance">
          <h3>Fiches publiques de la commission</h3>
          <p className="muted">Les membres avec le rôle Commission peuvent publier leur fiche et la retirer depuis le Coin écoute. Les coordonnées de ces fiches sont visibles publiquement.</p>
        </section>
        <section className="card demo-seeder-card">
          <div className="space-section-heading">
            <div>
              <p className="eyebrow">Aperçu du site</p>
              <h3>Exemples de démonstration</h3>
              <p className="muted">
                Ajoute des annonces et fiches fictives clairement marquées « Exemple ».
                Elles n’ont ni vrai numéro ni compte Firebase associé. Les exemples locaux
                s’affichent dès l’ouverture du site; cette action les enregistre dans Firestore.
              </p>
            </div>
            <span className="count-pill">
              {demoAnnouncements.length + demoCommissionProfiles.length} élément(s)
            </span>
          </div>
          {actionNotice && <p className="success-message" role="status">{actionNotice}</p>}
          {actionError && <FormError>{actionError}</FormError>}
          <div className="card-actions">
            <button className="button button-small button-primary" disabled={busy} onClick={seedDemoData} type="button">
              {busy ? "Traitement…" : "Ajouter / réinitialiser les exemples"}
            </button>
            <button className="button button-small button-secondary" disabled={busy} onClick={clearDemoData} type="button">
              Supprimer et masquer les exemples
            </button>
          </div>
        </section>
      </div>
    );
  }

  function renderResources() {
    return (
      <div className="page-content">
        <PanelHeading
          eyebrow="Besançon · accès libre"
          title="Infos utiles & urgences"
          description="Les numéros et ressources restent accessibles sans compte."
        />
        <PublicResourceContent />
      </div>
    );
  }

  function renderHome() {
    const dashboardStats = isAdmin
      ? [
          { icon: "♙", count: members.length, label: "comptes", tab: "admin" },
          { icon: "♡", count: activeAnnouncements.length, label: "annonces actives", tab: "entraide" },
          { icon: "◷", count: pendingAnnouncements.length, label: "annonces à valider", tab: "entraide" },
          { icon: "▣", count: chats.length, label: "conversations", tab: "messagerie" },
        ]
      : isPrivileged
        ? [
            { icon: "▣", count: chats.length, label: "conversations à suivre", tab: "messagerie" },
            { icon: "◷", count: pendingAnnouncements.length, label: "annonces à valider", tab: "entraide" },
          ]
        : [
            { icon: "♡", count: myAnnouncements.length, label: "mes annonces", tab: "espace" },
            { icon: "▣", count: chats.length, label: "mes conversations", tab: "messagerie" },
            { icon: "⌕", count: myDirectoryEntries.length, label: "mes propositions", tab: "espace" },
          ];
    const dashboardDescription = isAdmin
      ? "Gérez les accès, suivez l’activité et gardez le portail à jour."
      : isPrivileged
        ? "Retrouvez les demandes à suivre, les conversations et les propositions confidentielles."
        : "Suivez vos échanges et retrouvez ici les outils pour participer à votre rythme.";
    const dashboardActions = isAdmin
      ? [
          { label: "Gérer les rôles", tab: "admin" },
          { label: "Ouvrir la messagerie", tab: "messagerie" },
          { label: "Ouvrir l’annuaire privé", tab: "annuaire" },
          { label: "Valider les annonces", tab: "entraide" },
        ]
      : isPrivileged
        ? [
            { label: "Ouvrir les conversations", tab: "messagerie" },
            { label: "Consulter l’annuaire privé", tab: "annuaire" },
            { label: "Modérer les annonces", tab: "entraide" },
          ]
        : [
            { label: "Publier une annonce", tab: "entraide" },
            { label: "Proposer mon aide", tab: "annuaire" },
            { label: "Écrire anonymement à la commission", tab: "messagerie" },
          ];

    return (
      <div className="page-content">
        <section className="welcome welcome-dashboard">
          <p className="eyebrow">Tableau de bord · {roleLabels[profile.role] || profile.role}</p>
          <h1>Bonjour, {memberFullName(profile) || profile.pseudoAnonyme || "membre"}.</h1>
          <p>{dashboardDescription}</p>
        </section>
        <div className="quick-stats">
          {dashboardStats.map((stat) => (
            <button className="quick-stat" key={stat.label} onClick={() => setActiveTab(stat.tab)} type="button">
              <span className="stat-icon">{stat.icon}</span><strong>{stat.count}</strong><span>{stat.label}</span>
            </button>
          ))}
        </div>
        <section className="home-actions" aria-label="Actions rapides">
          {dashboardActions.map((action) => (
            <button className="home-action" key={action.label} onClick={() => setActiveTab(action.tab)} type="button">
              <span>{action.label}</span><span aria-hidden="true">→</span>
            </button>
          ))}
        </section>
        <section className="home-section">
          <div className="space-section-heading">
            <div><p className="eyebrow">À découvrir</p><h2>Les dernières annonces</h2></div>
            <button className="text-button" onClick={() => setActiveTab("entraide")} type="button">Tout voir →</button>
          </div>
          {announcementsError && <FormError>{announcementsError}</FormError>}
          {activeAnnouncements.length ? (
            <div className="announcement-grid">
              {activeAnnouncements.slice(0, 3).map((item) => renderAnnouncementCard(item))}
            </div>
          ) : (
            <EmptyState title="Le mur est calme pour le moment" text="Vous pouvez lancer la dynamique en publiant une annonce." />
          )}
        </section>
        <section className="home-callout">
          <div>
            <p className="eyebrow">{isAdmin ? "Pilotage" : isPrivileged ? "Accompagnement" : "Besoin d’échanger ?"}</p>
            <h2>{isAdmin ? "Un portail clair, des accès maîtrisés." : isPrivileged ? "Les demandes confidentielles sont dans vos espaces réservés." : "Un espace d’écoute, en toute confidentialité."}</h2>
            <p>{isAdmin ? "Vérifiez les rôles et les données de démonstration depuis l’administration." : "La commission sociale est là pour vous accompagner sans jugement."}</p>
          </div>
          <button className="button button-light" onClick={() => setActiveTab(isAdmin ? "admin" : isPrivileged ? "annuaire" : "ecoute")} type="button">
            {isAdmin ? "Ouvrir l’administration" : isPrivileged ? "Ouvrir l’annuaire" : "Contacter la commission"}
          </button>
        </section>
      </div>
    );
  }

  function renderContent() {
    if (activeTab === "entraide") return renderAnnouncements();
    if (activeTab === "ecoute") return renderEcoute();
    if (activeTab === "messagerie") return renderMessages();
    if (activeTab === "espace") return renderMySpace();
    if (activeTab === "annuaire") return renderDirectory();
    if (activeTab === "admin" && isAdmin) return renderAdmin();
    if (activeTab === "ressources") return renderResources();
    return renderHome();
  }

  return (
    <main className="page-shell dashboard-shell portal-shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Accueil AEBB" onClick={(event) => {
          event.preventDefault();
          onNavigate("/");
        }}>
          <span className="brand-mark small" aria-hidden="true">A</span>
          Portail solidaire
        </a>
        <div className="topbar-right">
          <span className="role-pill">{roleLabels[profile.role] || profile.role}</span>
          <button className="text-button" onClick={onSignOut} type="button">Déconnexion</button>
        </div>
      </header>
      <div className="portal-layout">
        <aside className="portal-sidebar">
          <div className="sidebar-profile">
            <span className="sidebar-avatar" aria-hidden="true">
              {(memberFullName(profile) || profile.pseudoAnonyme || "A").trim().charAt(0).toUpperCase()}
            </span>
            <div>
              <strong>{memberFullName(profile) || profile.pseudoAnonyme || "Membre AEBB"}</strong>
              <span>{roleLabels[profile.role] || profile.role}</span>
            </div>
          </div>
          <p className="sidebar-caption">ESPACE MEMBRE</p>
          <nav className="portal-nav" aria-label="Navigation du tableau de bord">
            {visibleTabs.map((tab) => (
              <a
                aria-current={activeTab === tab.id ? "page" : undefined}
                className={`nav-item ${activeTab === tab.id ? "active" : ""}`}
                href={tab.id === "accueil" ? "/dashboard" : `/dashboard/${tab.id}`}
                key={tab.id}
                onClick={(event) => {
                  event.preventDefault();
                  setActiveTab(tab.id);
                }}
              >
                <span aria-hidden="true">{tab.icon}</span>
                <span>{tab.id === "annuaire" && !isPrivileged ? "Proposer mon aide" : tab.label}</span>
                {tab.id === "messagerie" && unreadChatCount > 0 && (
                  <span
                    aria-label={`${unreadChatCount} conversation(s) non lue(s)`}
                    className="nav-count"
                    title={`${unreadChatCount} conversation(s) avec un nouveau message`}
                  >
                    {unreadChatCount}
                  </span>
                )}
              </a>
            ))}
          </nav>
          <a className="sidebar-public-link" href="/" onClick={(event) => {
            event.preventDefault();
            onNavigate("/");
          }}>
            ← Retour au portail public
          </a>
        </aside>
        <div className="portal-main">
          {actionError && <div className="global-action-error"><FormError>{actionError}</FormError></div>}
          {renderContent()}
        </div>
      </div>
      <AnnouncementDetailsDialog
        isPrivileged={isPrivileged}
        isOwn={Boolean(selectedAnnouncement && !selectedAnnouncement.demo && myAnnouncementIdSet.has(selectedAnnouncement.id))}
        item={selectedAnnouncement}
        onClose={() => setSelectedAnnouncement(null)}
        onNavigate={onNavigate}
        reservedContact={selectedAnnouncement ? privateContacts[selectedAnnouncement.id]?.telephoneReel : ""}
      />
      <AnnouncementResolutionDialog
        busy={busy}
        error={actionError}
        isBackfill={resolutionItem?.statut === "resolu" && !privateContacts[resolutionItem.id]?.suiviPersonne}
        item={resolutionItem}
        onClose={() => {
          setResolutionItem(null);
          setResolutionPerson("");
          showActionMessage("");
        }}
        onPersonChange={setResolutionPerson}
        onSubmit={saveAnnouncementResolution}
        person={resolutionPerson}
      />
      <footer className="portal-footer">
        <span>AEBB · Besançon</span><span>Solidarité, écoute et confidentialité.</span>
      </footer>
    </main>
  );
}

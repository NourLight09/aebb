import { useCallback, useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "./firebase.js";
import Portal, { PublicPortal } from "./Portal.jsx";

function phoneToEmail(value) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("33") && digits.length === 11) {
    digits = `0${digits.slice(2)}`;
  }
  if (digits.length !== 10 || !digits.startsWith("0")) {
    throw new Error("Saisissez un numéro français valide de 10 chiffres.");
  }
  return `${digits}@aebb.local`;
}

function getErrorMessage(error) {
  const messages = {
    "auth/email-already-in-use": "Ce numéro possède déjà un compte.",
    "auth/invalid-credential": "Numéro ou mot de passe incorrect.",
    "auth/weak-password": "Le mot de passe doit contenir au moins 6 caractères.",
    "auth/too-many-requests":
      "Trop de tentatives. Réessayez plus tard ou contactez la commission.",
    "permission-denied": "Accès refusé par les règles de sécurité Firebase.",
  };
  return messages[error.code] || error.message || "Une erreur est survenue.";
}

export default function App() {
  const [path, setPath] = useState(() => window.location.pathname);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(Boolean(auth));
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState([]);
  const [membersError, setMembersError] = useState("");
  const [membersLoading, setMembersLoading] = useState(false);
  const currentPath = path.replace(/\/+$/, "") || "/";
  const mode = currentPath === "/inscription" ? "signup" : "login";
  const isDashboardPath = currentPath === "/dashboard"
    || currentPath.startsWith("/dashboard/");
  const isAuthRoute = currentPath === "/connexion" || currentPath === "/inscription";
  const isPublicRoute = ["/", "/entraide", "/ecoute", "/infos-utiles"].includes(currentPath);

  const navigate = useCallback((nextPath, replace = false) => {
    if (window.location.pathname !== nextPath) {
      if (replace) {
        window.history.replaceState({}, "", nextPath);
      } else {
        window.history.pushState({}, "", nextPath);
      }
    }
    setPath(nextPath);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      return undefined;
    }
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setProfile(null);
      setProfileError("");
      setProfileLoading(Boolean(nextUser));
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (isDashboardPath && auth && !user) {
      navigate("/connexion", true);
    } else if (isAuthRoute && user && profile) {
      navigate("/dashboard", true);
    } else if (!isDashboardPath && !isAuthRoute && !isPublicRoute) {
      navigate("/", true);
    } else if (
      currentPath === "/dashboard/admin"
      && profile
      && profile.role !== "admin"
    ) {
      navigate("/dashboard", true);
    }
  }, [
    authLoading,
    auth,
    currentPath,
    isAuthRoute,
    isDashboardPath,
    isPublicRoute,
    navigate,
    profile,
    user,
  ]);

  useEffect(() => {
    if (!user || !db) {
      setProfile(null);
      setProfileLoading(false);
      setProfileError("");
      return undefined;
    }

    setProfileLoading(true);
    setProfileError("");
    return onSnapshot(
      doc(db, "users", user.uid),
      (snapshot) => {
        if (!snapshot.exists()) {
          setProfile(null);
          setProfileError(
            "Votre compte existe, mais son profil est introuvable. Contactez un administrateur.",
          );
          setProfileLoading(false);
          return;
        }
        setProfile(snapshot.data());
        setProfileError("");
        setProfileLoading(false);
      },
      (error) => {
        setProfileError(getErrorMessage(error));
        setProfileLoading(false);
      },
    );
  }, [user]);

  useEffect(() => {
    if (!profile || profile.role !== "admin" || !db) {
      setMembers([]);
      setMembersError("");
      setMembersLoading(false);
      return undefined;
    }

    setMembersLoading(true);
    setMembersError("");
    return onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        setMembers(
          snapshot.docs
            .map((memberDoc) => ({ id: memberDoc.id, ...memberDoc.data() }))
            .sort((a, b) => (a.telephone || "").localeCompare(b.telephone || "")),
        );
        setMembersError("");
        setMembersLoading(false);
      },
      (error) => {
        setMembersError(getErrorMessage(error));
        setMembersLoading(false);
      },
    );
  }, [profile]);

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError("");
    setBusy(true);
    try {
      const email = phoneToEmail(phone);
      if (password.length < 6) {
        throw new Error("Le mot de passe doit contenir au moins 6 caractères.");
      }

      if (mode === "signup") {
        const credential = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );
        const newProfile = {
          telephone: email.split("@")[0],
          role: "etudiant",
          pseudoAnonyme: `Étudiant #${credential.user.uid.slice(-4)}`,
          createdAt: serverTimestamp(),
        };
        try {
          await setDoc(doc(db, "users", credential.user.uid), newProfile);
        } catch (error) {
          await signOut(auth);
          throw new Error(
            `Compte créé, mais profil non enregistré (${getErrorMessage(error)}). Contactez un administrateur.`,
          );
        }
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      setPassword("");
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleRoleChange(memberId, role) {
    setMembersError("");
    try {
      await updateDoc(doc(db, "users", memberId), { role });
      setMembers((current) =>
        current.map((member) =>
          member.id === memberId ? { ...member, role } : member,
        ),
      );
    } catch (error) {
      setMembersError(getErrorMessage(error));
    }
  }

  async function handleSignOut() {
    try {
      await signOut(auth);
      navigate("/");
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  }

  if (isPublicRoute) {
    return (
      <PublicPortal
        page={currentPath}
        isAuthenticated={Boolean(user)}
        onNavigate={navigate}
        onLogin={() => navigate("/connexion")}
        onSignup={() => navigate("/inscription")}
      />
    );
  }

  if (!isFirebaseConfigured && (isDashboardPath || isAuthRoute)) {
    return (
      <main className="page-shell">
        <section className="card notice-card">
          <div className="brand-mark" aria-hidden="true">A</div>
          <p className="eyebrow">AEBB · Besançon</p>
          <h1>Le portail solidaire commence ici.</h1>
          <p>
            Ajoutez les clés de votre projet Firebase dans le fichier{" "}
            <code>.env.local</code> pour activer l’inscription et la connexion.
          </p>
          <p className="muted">
            Les étapes de configuration sont détaillées dans le README.
          </p>
          <button
            className="button button-secondary"
            onClick={() => navigate("/infos-utiles")}
            type="button"
          >
            Voir les ressources d’urgence
          </button>
        </section>
      </main>
    );
  }

  if (authLoading && (isDashboardPath || isAuthRoute)) {
    return <main className="page-shell"><p className="muted">Vérification de votre session…</p></main>;
  }

  if (user) {
    if (profileLoading) {
      return <main className="page-shell"><p className="muted">Chargement de votre espace…</p></main>;
    }
    if (profileError) {
      return (
        <main className="page-shell">
          <section className="card">
            <p className="eyebrow">AEBB · Besançon</p>
            <h1>Profil indisponible</h1>
            <p className="error-message">{profileError}</p>
            <button className="button button-secondary" onClick={handleSignOut}>
              Se déconnecter
            </button>
          </section>
        </main>
      );
    }

    return (
      <Portal
        user={user}
        profile={profile}
        route={currentPath}
        onNavigate={navigate}
        onSignOut={handleSignOut}
        members={members}
        membersError={membersError}
        membersLoading={membersLoading}
        onRoleChange={handleRoleChange}
      />
    );
  }

  if (isDashboardPath) {
    return <main className="page-shell"><p className="muted">Redirection vers la connexion…</p></main>;
  }

  return (
    <main className="page-shell auth-shell">
      <section className="hero-panel">
        <div className="hero-topline">
          <span className="brand-mark" aria-hidden="true">A</span>
          <span>AEBB · Besançon</span>
        </div>
        <div className="hero-copy">
          <p className="eyebrow">Un réseau, une solidarité</p>
          <h1>On avance mieux quand on s’entraide.</h1>
          <p>
            Retrouvez un espace bienveillant pour demander de l’aide, partager
            et rester en lien avec la communauté étudiante béninoise.
          </p>
        </div>
        <p className="hero-footnote">Entraide · Écoute · Confidentialité</p>
      </section>

      <section className="auth-panel">
        <button
          className="text-button auth-back-button"
          onClick={() => navigate("/")}
          type="button"
        >
          ← Retour à l’accueil
        </button>
        <div className="auth-heading">
          <p className="eyebrow">Votre espace AEBB</p>
          <h2>{mode === "login" ? "Content de vous retrouver." : "Rejoindre la communauté."}</h2>
          <p className="muted">
            Connectez-vous avec votre numéro de téléphone et votre mot de passe.
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="phone">Numéro de téléphone</label>
          <input
            autoComplete="tel"
            id="phone"
            inputMode="tel"
            onChange={(event) => setPhone(event.target.value)}
            placeholder="06 12 34 56 78"
            required
            value={phone}
          />
          <label htmlFor="password">Mot de passe</label>
          <input
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            id="password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="6 caractères minimum"
            required
            type="password"
            value={password}
          />
          {formError && <p className="error-message">{formError}</p>}
          <button className="button button-primary" disabled={busy} type="submit">
            {busy
              ? "Veuillez patienter…"
              : mode === "login"
                ? "Se connecter"
                : "Créer mon compte"}
          </button>
        </form>

        <p className="switch-mode">
          {mode === "login" ? "Pas encore de compte ?" : "Déjà membre ?"}{" "}
          <button
            className="inline-button"
            onClick={() => {
              setFormError("");
              navigate(mode === "login" ? "/inscription" : "/connexion");
            }}
            type="button"
          >
            {mode === "login" ? "Créer un compte" : "Se connecter"}
          </button>
        </p>
        {mode === "login" && (
          <p className="forgot-password">
            Mot de passe oublié ?{" "}
            {import.meta.env.VITE_SUPPORT_WHATSAPP ? (
              <a
                href={`https://wa.me/${String(import.meta.env.VITE_SUPPORT_WHATSAPP).replace(/\D/g, "")}?text=${encodeURIComponent(`Bonjour, j’ai besoin de réinitialiser mon mot de passe du portail solidaire AEBB. Mon numéro de compte est ${phone || "[à renseigner]"}.`)}`}
                rel="noreferrer"
                target="_blank"
              >
                Contacter l’administrateur sur WhatsApp
              </a>
            ) : (
              <span>Contactez la commission AEBB.</span>
            )}
          </p>
        )}
        <p className="fine-print">
          En créant un compte, vous acceptez que votre numéro soit utilisé pour
          votre connexion et la coordination de l’entraide.
        </p>
        <button
          className="public-resources-link"
          onClick={() => navigate("/infos-utiles")}
          type="button"
        >
          Consulter les numéros et ressources utiles à Besançon
        </button>
      </section>
    </main>
  );
}

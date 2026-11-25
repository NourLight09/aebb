# Portail solidaire AEBB

Portail mobile-first en React, Vite, Tailwind CSS et Firebase. Il comprend
l'inscription/connexion par numéro et mot de passe, les annonces d'entraide, la
messagerie anonyme avec la commission, l'annuaire solidaire, les ressources d'urgence,
les règles Firestore et la gestion des rôles administrateur. Les visiteurs
peuvent consulter séparément les annonces, les fiches publiques de la
commission et les ressources utiles sans compte. Un compte est nécessaire pour
publier, gérer ses annonces ou démarrer une conversation anonyme avec la commission.

## Pages du portail

- `/` : accueil et aperçu des dernières annonces.
- `/entraide`, `/ecoute` et `/infos-utiles` : pages publiques séparées, consultables sans compte.
- `/connexion` et `/inscription` : accès et création de compte.
- `/dashboard` : tableau de bord connecté avec sidebar et pages dédiées pour
  l’entraide, l’écoute, la messagerie, l’espace personnel, l’annuaire, les
  ressources et l’administration selon le rôle.

Les membres de la commission renseignent leur nom, leur rôle, leur numéro de
contact et téléversent leur portrait dans **Tableau de bord → Écoute**. Ces
coordonnées et photos sont affichées publiquement sur `/ecoute`.
Les étudiants peuvent démarrer ou reprendre leur discussion anonyme depuis
**Tableau de bord → Messagerie** ou **Écoute**. Les membres de la commission et
les admins consultent la boîte commune directement dans **Messagerie**. Les
admins disposent également d’un accès depuis **Administration**. Chaque nouveau
message étudiant déclenche un courriel à la commission, mais le contenu du
message n’est jamais inclus dans le courriel.
La liste des utilisateurs (numéro, pseudo et rôle) est réservée au rôle `admin`
et se met à jour en direct.
Les conversations démarrées sur le site sont adressées à la boîte commune
« Commission sociale » : l’étudiant ne choisit pas le membre qui répond, et les
réponses sont affichées sous ce nom générique. Tous les comptes `commission` et
`admin` peuvent consulter et traiter cette boîte. Pour joindre une personne
précise, l’étudiant utilise son contact WhatsApp public.
Les fiches de démonstration restent fictives, sans photo ni contact réel, et ne
peuvent pas être contactées directement. Une fiche publique n’est pas nécessaire
pour répondre dans la boîte anonyme.

## Validation des demandes et notifications

Toutes les nouvelles annonces — dons proposés et demandes — restent privées
avec le statut `en_attente` jusqu’à validation par un compte `commission` ou
`admin`, dans **Tableau de bord → Entraide → Annonces en attente de validation**.
Les annonces déjà publiées avant ce changement ne sont pas retirées
rétroactivement.

Les e-mails passent par une fonction Vercel (`/api/notify`) qui appelle l’API
EmailJS; aucune Cloud Function Firebase ni activation du plan Blaze n’est
nécessaire. Dans EmailJS, reliez un service de messagerie, créez un modèle avec
les variables `subject`, `message` et `portal_url`, et configurez la boîte
commune de la commission comme destinataire fixe du modèle. Dans les variables
d’environnement Vercel, renseignez :

- `EMAILJS_SERVICE_ID` et `EMAILJS_TEMPLATE_ID` : identifiants du service et du modèle.
- `EMAILJS_PUBLIC_KEY` et `EMAILJS_PRIVATE_KEY` : clés du compte; la clé privée reste côté serveur.
- `AEBB_PORTAL_URL` : URL publique du portail, par exemple `https://votre-site.vercel.app`.

Les variables `VITE_FIREBASE_API_KEY` et `VITE_FIREBASE_PROJECT_ID` doivent
également être configurées comme pour l’application. Ne préfixez jamais la clé
privée EmailJS par `VITE_` et ne la commitez pas. Les courriels signalent une
annonce à valider ou un nouveau message étudiant; ils ne contiennent ni le texte
du chat ni le numéro de l’étudiant. Aucun courriel n’est envoyé lorsqu’un
étudiant ouvre simplement une conversation sans encore écrire. Les quotas
dépendent de l’offre EmailJS choisie. Les e-mails ne sont pas envoyés par le
serveur Vite local : ils nécessitent le déploiement de la fonction sur Vercel.

## Démarrer en local

1. Installer Node.js (version 20 ou plus) et npm.
2. Créer un projet Firebase, activer **Authentication → E-mail/Mot de passe**,
   créer la base **Cloud Firestore** et activer **Cloud Storage**.
3. Copier `.env.example` vers `.env.local`, puis remplir les valeurs de
   configuration de l'application Web Firebase. Pour afficher le lien de
   réinitialisation manuelle du mot de passe, ajoutez aussi
   `VITE_SUPPORT_WHATSAPP` avec le numéro WhatsApp d'administration au format
   international (chiffres uniquement, par exemple `33612345678`).
4. Depuis ce dossier, lancer :

   ```sh
   npm install
   npm run dev
   ```

Les numéros français sont normalisés puis convertis en adresse technique
`06XXXXXXXX@aebb.local`. Aucun SMS n'est envoyé. Les mots de passe sont gérés
par Firebase Authentication et ne sont jamais enregistrés dans Firestore.

## Définir le premier administrateur

Le rôle n'est jamais attribué par le formulaire d'inscription : tout nouveau
compte reçoit le rôle `etudiant`. Pour définir le premier admin en toute
sécurité :

1. Créez votre compte depuis l'application.
2. Dans Firebase Console → Authentication, copiez l'UID de ce compte.
3. Dans Firestore, ouvrez `users/{UID}` et remplacez `role: "etudiant"` par
   `role: "admin"` (conservez les autres champs).
4. Déconnectez-vous puis reconnectez-vous. Le tableau **Gestion des rôles**
   permet ensuite d'attribuer à d'autres comptes le rôle `admin` ou
   `commission`.

N'accordez le rôle admin qu'aux personnes habilitées : elles pourront changer
les rôles et accéder aux données réservées.

## Données de démonstration

Des annonces et fiches fictives sont affichées localement dès l’ouverture du
portail pour que la page soit lisible avant le premier seeding. Elles sont
signalées comme exemples, sans compte Firebase Authentication ni numéro de
contact. Dans **Administration → Exemples de démonstration**, un administrateur
peut les enregistrer dans des collections Firestore séparées, les réinitialiser
ou les supprimer et masquer les exemples locaux. Les règles Firestore doivent
être redéployées pour autoriser la lecture publique du réglage
`demo_settings/seed` et sa modification par l’admin.

## Photos du portail et des annonces

Les images de l’en-tête sont servies localement depuis `public/`. Le carrousel
affiche le crédit et la licence de chaque photo. Sources :

- `amazone-sunrise.jpg` — Fawaz.tairou,
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- `amazone-benin.jpg` — Alfrednadjere,
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- `plage-fidjrosse.jpg` — MyLady333,
  [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

Les annonces fictives affichent aussi des images d’exemple, avec leurs sources :

- Vaisselle — Alexandra Constantin, [domaine public](https://commons.wikimedia.org/wiki/File:Glasses_dishes_art.jpg).
- Manteau — Rhode Island School of Design Museum of Art, [CC0](https://commons.wikimedia.org/wiki/File:2017_Thom_Browne_man%27s_coat,_wool_twill_with_multiple_buttons,_Fall-Winter_04.jpg).
- Carton de déménagement — HireAHelper, [CC BY 2.0](https://commons.wikimedia.org/wiki/File:Open_Cardboard_Moving_Box_(32067347137).jpg).
- Bureau d’étude — Shixart1985, [CC BY 2.0](https://commons.wikimedia.org/wiki/File:Cozy_study_space_with_an_open_book,_fresh_apple,_and_laptop_on_a_desk_in_bright_natural_light.jpg).
- Lampe — 14GTR, [CC0](https://commons.wikimedia.org/wiki/File:Table_lamp_by_Omega_Workshops.jpg).

Les membres peuvent joindre une photo JPG, PNG ou WebP de 5 Mo maximum à leurs
annonces et les membres habilités peuvent téléverser leur portrait de la même
façon. Ces photos sont hébergées dans Firebase Storage et visibles publiquement,
y compris si une annonce est anonyme : ne téléversez aucune image contenant des
informations personnelles que vous ne souhaitez pas rendre publiques.
Pour activer l'envoi de photos, activez Cloud Storage dans Firebase et
renseignez `VITE_FIREBASE_STORAGE_BUCKET`. Sans ce réglage, l'authentification
et les annonces sans photo restent disponibles. Les règles Storage autorisent
le portrait uniquement au membre commission/admin concerné; elles consultent
son rôle Firestore.

## Déployer les règles Firestore

Vérifiez que `firebase.json` pointe vers `firestore.rules` et `storage.rules`,
puis déployez les deux jeux de règles avec la Firebase CLI :

```sh
firebase deploy --only firestore:rules,storage
```

Les règles Storage consultent le rôle Firestore avant d’autoriser l’envoi d’un
portrait; acceptez la demande de liaison inter-services si la CLI Firebase la
présente.

Les règles protègent les profils, l'identité et le contact privé associés aux
annonces anonymes, les chats et l'annuaire solidaire. Les identifiants des
auteurs ne sont pas inclus dans les documents d'annonces publics. Les fiches
personnelles de l'annuaire ne sont lisibles que par la commission; chaque
étudiant ne voit dans son espace qu'un récapitulatif privé de ses propres
propositions. La configuration `vercel.json` permet le réacheminement des URL
de l'application React.

## Configuration Vercel

Importez le dépôt dans Vercel et ajoutez chaque variable `VITE_FIREBASE_*`
présente dans `.env.example` aux variables d'environnement du projet. Ajoutez
aussi `VITE_SUPPORT_WHATSAPP` si vous souhaitez activer le lien de réinitialisation.
Vercel construit l'application avec `npm run build` et publie le dossier `dist`.

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
L'inscription demande le prénom et le nom; chaque membre peut ensuite les
modifier dans **Tableau de bord → Mon espace**. L'administration voit ces
informations avec le numéro et le pseudo du compte. La commission dispose
également d’une liste interne des membres, sans pouvoir modifier leurs rôles.
Les annonces publiques affichent le prénom et le nom; les annonces anonymes
masquent toujours l'identité et le numéro aux autres étudiants. Seule la
commission peut voir l’identité de l’auteur et ses coordonnées pour organiser le
contact. Les auteurs peuvent modifier ou supprimer leurs annonces depuis
**Mon espace**; une annonce modifiée retourne en attente de validation.
La commission peut refuser une annonce en attente en la supprimant.
Lorsqu'une annonce est clôturée, l'auteur ou la commission peut indiquer à qui
le don a été remis ou de qui l'aide a été reçue. Le nom saisi dans ce suivi est
stocké séparément et visible uniquement par la commission. L’auteur peut
confirmer qu’il a reçu le bien sans que le nom renseigné soit affiché dans son
espace.
Une annonce déjà résolue sans suivi peut être complétée avec **Ajouter le suivi
manquant** par la commission; le suivi déjà enregistré n'est pas modifiable
depuis cette action.
Tous les comptes — y compris commission et administration — peuvent démarrer
une conversation en tant que membre sous leur pseudo anonyme. Leur conversation
personnelle reste distincte de la boîte de réception partagée de la commission.
Les membres de la commission et les admins consultent et répondent aux autres
conversations sans révéler leur compte personnel. Chaque nouveau fil anonyme
et chaque nouveau compte déclenchent un courriel à la boîte configurée dans
EmailJS; les courriels ne contiennent ni le texte du chat ni les coordonnées du
nouveau membre.
La navigation affiche en vert le nombre de conversations contenant un nouveau
message reçu. Chaque conversation affiche aussi le nombre de messages non lus;
les anciens fils sont comptés à partir du dernier marqueur de lecture. Le
compteur est remis à zéro quand le fil est réellement ouvert. Sur mobile,
revenir à la liste laisse les nouveaux messages non lus jusqu'à la réouverture
du fil.
Sur mobile, la liste des conversations et le fil s'affichent séparément, avec un
bouton de retour à la liste et une zone de saisie dédiée au bas du fil.
La liste des utilisateurs (prénom, nom, numéro, pseudo et rôle) est réservée à
la commission et à l’administration et se met à jour en direct. Seul
l’administrateur peut modifier les rôles ou supprimer un compte.
Dans l'annuaire privé, la commission peut filtrer les fiches par hébergement,
colocation ou emploi; les libellés de catégories restent explicites dans les
fiches et dans l'espace personnel de l'étudiant.
Les conversations démarrées sur le site sont adressées à la boîte commune
« Commission sociale » : le membre ne choisit pas qui répond, et les réponses
sont affichées sous ce nom générique. Tous les comptes `commission` et `admin`
peuvent consulter et traiter cette boîte. Pour joindre une personne précise,
l’étudiant utilise son contact WhatsApp public.
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
annonce à valider, un nouveau compte ou un nouveau message anonyme; ils ne
contiennent ni le texte du chat ni les coordonnées du nouveau membre. Aucun
courriel n’est envoyé lorsqu’un
étudiant ouvre simplement une conversation sans encore écrire. Chaque nouveau
fil est distinct; un seul courriel est envoyé à la commission, après le premier
message étudiant de ce fil. Les messages suivants ne déclenchent pas d’autre
courriel. Les quotas dépendent de l’offre EmailJS choisie. Les e-mails ne sont
pas envoyés par le serveur Vite local : ils nécessitent le déploiement de la
fonction sur Vercel.

## Démarrer en local

1. Installer Node.js (version 20 ou plus) et npm.
2. Créer un projet Firebase, activer **Authentication → E-mail/Mot de passe**,
   puis créer la base **Cloud Firestore**.
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
façon. Les nouvelles photos passent par des envois signés vers Cloudinary; aucun
secret Cloudinary n'est envoyé au navigateur. Les photos sont visibles
publiquement, y compris si une annonce est anonyme : ne téléversez aucune image
contenant des informations personnelles que vous ne souhaitez pas rendre
publiques. Les anciennes URLs Firebase Storage sont conservées et ne sont pas
migrées ni supprimées.

Pour activer l'envoi de photos, créez un compte Cloudinary et un upload preset
signé (par exemple `aebb_images`) limité aux formats JPG, PNG et WebP et à
5 Mo maximum. Ajoutez `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
`CLOUDINARY_API_SECRET` et `CLOUDINARY_UPLOAD_PRESET` aux variables
d'environnement Vercel. La clé secrète doit rester côté serveur : ne la
préfixez jamais par `VITE_` et ne la commitez pas. Les photos nécessitent la
fonction Vercel `/api/cloudinary-image`; elles ne peuvent donc pas être
téléversées depuis le serveur Vite local. Tant que les variables Cloudinary ne
sont pas configurées, les annonces sans photo restent disponibles et
l'application affiche une erreur explicite lors d'un envoi d'image. L'offre
gratuite Cloudinary est soumise à ses quotas et limites en vigueur.

## Déployer les règles Firestore

Vérifiez que `firebase.json` pointe vers `firestore.rules`, puis déployez les
règles Firestore avec la Firebase CLI :

```sh
firebase deploy --only firestore:rules
```

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
Ajoutez également les variables Cloudinary et EmailJS décrites ci-dessus pour
activer les envois de photos et les notifications.
Vercel construit l'application avec `npm run build` et publie le dossier `dist`.

La suppression complète d’un compte utilise Firebase Admin côté serveur.
Ajoutez `FIREBASE_SERVICE_ACCOUNT` comme variable d’environnement secrète
Vercel, avec le JSON du compte de service Firebase du projet. Ce compte doit
avoir les droits d’administration d’Authentication et Firestore. Ne mettez
jamais cette clé dans une variable `VITE_*`, dans le dépôt ou dans le navigateur.
La suppression retire le compte Firebase, ses annonces et fiches, ses
conversations et ses photos Cloudinary; elle est refusée pour le dernier compte
administrateur.

## Installation sur téléphone

Le portail peut être installé comme application depuis un navigateur compatible.
Sur Android et les navigateurs de bureau compatibles, utilisez **Installer**
quand le bouton apparaît, ou l'option d'installation du menu du navigateur.
Sur iPhone/iPad, ouvrez le portail dans Safari, touchez **Partager**, puis
**Sur l’écran d’accueil**. L'installation nécessite le site en HTTPS, comme
sur Vercel. La page et ses ressources déjà chargées restent accessibles hors
ligne, mais la connexion, les annonces et la messagerie Firebase nécessitent
Internet.

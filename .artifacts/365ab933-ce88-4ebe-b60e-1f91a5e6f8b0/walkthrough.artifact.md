# Landing Page & Nouveau Parcours Utilisateur

J'ai remplacé l'accès direct au formulaire de connexion par une page de présentation complète du projet, intégrant les informations clés du GitHub et un accès simplifié aux ressources.

## Changements Principaux

### 1. Landing Page de Présentation
L'application s'ouvre désormais sur une page d'accueil moderne qui :
- **Présente le projet** : "Pilotez avec les données. Gagnez avec la précision."
- **Détaille les fonctionnalités** : Feedback temps réel, analyse thermique/grip et optimisation des suspensions.
- **Guide l'utilisateur** : Une section "Comment ça marche" explique les étapes de configuration (compte, agent, jeu).
- **Propose le téléchargement** : Un lien direct vers la dernière release GitHub de l'Agent Local (v1.1.0).

### 2. Nouveau Flux de Navigation
Le parcours utilisateur a été fluidifié :
- **Accueil** → Bouton **"Créer un compte / Connexion"** → **Formulaire Auth**.
- **Auth** → Bouton **"← Accueil"** pour revenir en arrière.
- **Déconnexion** → Redirection automatique vers l'**Accueil**.
- **Session active** : Si l'utilisateur est déjà connecté, il accède directement au dashboard via le bouton principal de la landing page.

### 3. Design & Responsive
- **Thème Visuel** : Cohérence avec le dashboard (fond sombre, dégradés néons cyan/émeraude).
- **Adaptabilité** : La landing page est entièrement responsive, passant d'une grille à 3 colonnes à une liste verticale sur mobile/petits écrans.
- **Interactivité** : Effets de survol et de flou (backdrop-filter) pour une sensation premium.

## Comment vérifier

1.  **Lancez l'application** : Vous devriez voir la nouvelle page de présentation.
2.  **Testez le bouton principal** : Il doit vous amener au login.
3.  **Vérifiez le lien de téléchargement** : Il pointe bien vers la page des releases GitHub.
4.  **Déconnectez-vous** : Vérifiez que vous revenez bien sur la page de présentation et non sur le login directement.

render_diffs(file:///C:/Users/Thomas/Documents/GitHub/forza-telemetry-project/dashboard-client/src/App.jsx)
render_diffs(file:///C:/Users/Thomas/Documents/GitHub/forza-telemetry-project/dashboard-client/src/App.css)

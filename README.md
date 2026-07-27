# Forza Telemetry Dashboard

Un tableau de bord interactif en temps réel exploitant les données télémétriques de la franchise Forza (Horizon / Motorsport). Ce projet intercepte le flux réseau UDP généré par le jeu, le traite via un serveur relais local et diffuse les métriques vers une application web React hébergée à distance. <br> 
A noter : le projet a été optimisé pour Forza Horizon 6 et peut ne pas fonctionner correctement sur un autre opus.

## 📋 Table des matières
- [Procédure de Mise à Jour et de Déploiement (Dev)](#-procédure-de-mise-à-jour-et-de-déploiement-dev)
  - [Base de données](#1-mise-à-jour-de-la-base-de-données-supabase---superadmin-seulement)
  - [Frontend](#2-déploiement-de-linterface-web-frontend-react---webmaster-et-superadmin-seulement)
  - [Backend](#3-compilation-et-distribution-de-lagent-local-backend-nodejs---nimporte-quel-développeur-backend)
  - [Versionning](#4-versioning)
- [Guide d'installation utilisateur](#-guide-dinstallation-et-dutilisation)
  - [Création de compte](#étape-1--création-de-votre-compte-web)
  - [Installation de l'agent](#étape-2--installation-de-lagent-local)
  - [Liaison au compte](#étape-3--liaison-de-lagent-à-votre-compte)
  - [Configuration du jeu](#étape-4--configuration-dans-forza-horizon--motorsport)
  - [Utilsiation](#étape-5--analyse-en-course-pit-stop)

# 🛠 Procédure de Mise à Jour et de Déploiement (Dev)

Ce document décrit le flux de travail strict à respecter lors du déploiement d'une mise à jour logicielle sur l'infrastructure. L'architecture étant hybride (SaaS web + Agent local), la procédure se divise en trois axes.

## 1. Mise à jour de la Base de Données (Supabase) - Superadmin seulement
*À ne réaliser que si la mise à jour implique une modification du schéma de données.*
1. Connectez-vous au tableau de bord Supabase.
2. Ouvrez le **SQL Editor**.
3. Exécutez vos scripts de migration (ajout de colonnes, modification des politiques RLS).
4. Testez les requêtes RLS pour vous assurer que l'isolation des données entre les utilisateurs (`user_id`) reste hermétique.

## 2. Déploiement de l'Interface Web (Frontend React) - Webmaster et superadmin seulement
*Mise à jour du tableau de bord interactif distant.*
1. Dans Visual Studio Code, ouvrez un terminal pointant sur le dossier `dashboard-client`.
2. Assurez-vous que l'URL locale de développement pointe bien vers l'environnement de production Supabase.
3. Lancez le processus de compilation (Vite) :
   ```bash
   npm run build
   ```
4. Connectez-vous via FTP ou SSH à votre espace d'hébergement Alwaysdata.
5. Accédez au répertoire racine du site de type "Fichiers statiques".
6. Supprimez l'ancien contenu et transférez l'intégralité du nouveau dossier `dist/`.
7. Purgez le cache du navigateur pour vérifier la mise en ligne.

## 3. Compilation et Distribution de l'Agent Local (Backend Node.js) - n'importe quel développeur backend

*Mise à jour du relais UDP/Realtime installé sur les machines Windows des clients.*

1. Dans Visual Studio Code, ouvrez `relay-server/package.json` et incrémentez le numéro de version (ex: `"version": "1.1.0"`).
2. Ouvrez un terminal pointant sur le dossier `relay-server` et compilez l'exécutable autonome pour Windows 11 / 64 bits :
```bash
npm run package:win
```


3. Ouvrez **Inno Setup Compiler** et chargez votre fichier de configuration de l'installeur : le script `forza_installer.iss`.
4. Mettez à jour le numéro de version dans le script Inno Setup.
5. Cliquez sur **Build > Compile** pour générer le nouveau fichier `Setup_Forza_Telemetry.exe`.
6. Hébergez ce nouvel installeur sur via les *Releases* GitHub

## 4. Versioning

1. Validez toutes les modifications dans Git :
```bash
git add .
git commit -m "feat: description de la mise à jour"
git push origin main
```
<br>

## Fin de la procédure de développement
<br>


<br>
<br>

---




# 🏁 Guide d'Installation et d'Utilisation

Bienvenue sur le Dashboard Télémétrique Forza. Ce service vous permet d'analyser les données de votre véhicule en temps réel, comme un véritable ingénieur de piste, grâce à un système hybride couplant un agent d'extraction local et une interface web.

Voici les étapes de configuration à réaliser lors de votre première utilisation.

## Étape 1 : Création de votre compte Web
1. Rendez-vous sur notre plateforme d'analyse web : `theriaud.alwaysdata.net/forza-telemetry`
2. Cliquez sur **S'inscrire** pour créer votre espace personnel et sécurisé (Email / Mot de passe).
3. Une fois connecté, accédez à votre profil et récupérer le fichier d'installation présent dans les releases Github.

## Étape 2 : Installation de l'Agent Local
*L'agent est un programme léger et invisible qui fait le pont entre Forza et votre tableau de bord en ligne.*
1. Exécutez le fichier téléchargé `Setup_Forza_Telemetry.exe`.
2. Suivez les instructions de l'installeur en laissant les paramètres par défaut.
3. À la fin de l'installation, un fichier exécutable **Agent Télémétrie Forza** sera créé..

## Étape 3 : Liaison de l'Agent à votre compte
1. Rechercher ce fichier par nom et exécutez-le..
2. Une console de commande s'ouvre. Il vous sera demandé de lier le logiciel à votre espace en ligne.
3. Saisissez **l'adresse email** et le **mot de passe** utilisés lors de votre inscription (Étape 1).
4. L'agent validera la connexion et affichera : `Authentification réussie. En écoute sur le port UDP 5607`.
*(Note : Cette étape n'est requise qu'une seule fois. L'agent mémorisera votre profil de manière sécurisée pour vos prochaines sessions).*

## Étape 4 : Configuration dans Forza Horizon / Motorsport
1. Lancez votre jeu Forza.
2. Mettez le jeu en pause et accédez aux **Paramètres > Interface (HUD et Gameplay)**.
3. Faites défiler vers le bas jusqu'à la section **Télémétrie / Sortie de données (Data Out)**.
4. Appliquez la configuration suivante :
   * **Activer la sortie des données :** Oui
   * **Adresse IP :** `127.0.0.1`
   * **Port :** `5607`
5. Sauvegardez et retournez sur la route.

## Étape 5 : Analyse en Course (Pit Stop)
1. Ouvrez le tableau de bord web depuis n'importe quel appareil (votre deuxième écran, un smartphone, ou une tablette).
2. Connectez-vous à votre compte.
3. Laissez la console de l'Agent Télémétrie Forza ouverte en arrière-plan sur votre PC de jeu.
4. Prenez le volant. Vos données remonteront instantanément sur l'interface web.
5. Utilisez le bouton d'enregistrement pour analyser vos suspensions, la température de vos pneus et l'étagement de votre boîte de vitesses afin de parfaire vos réglages !

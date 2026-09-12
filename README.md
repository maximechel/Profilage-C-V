# Profil Charge - Vélocité (Ruthene Coach'in)

Application web (statique, sans backend à héberger) qui reproduit le
fonctionnement du fichier Excel *VITRUVE / DATAS / CR VITRUVE* :

- gestion des athlètes (prénom, nom, date de naissance, poids, taille) ;
- import du CSV exporté par l'application **Vitruve** (une ou plusieurs
  séances : le fichier est automatiquement découpé par athlète + exercice
  + date) ;
- calcul automatique du profil charge-vélocité (régression, 1RM estimé,
  puissance maximale, zones d'entraînement) ;
- export PDF correspondant à l'onglet **CR VITRUVE** du fichier d'origine.

Les données (athlètes, séances, séries) sont stockées dans le projet
Supabase **« maximechel's Project »**, dans des tables dédiées préfixées
`vbt_` — complètement séparées de tes tables de gestion de coaching
(`clients`, `factures`, `cycles`...). Voir [`sql/schema.sql`](sql/schema.sql)
pour le détail (déjà appliqué à la base).

## 1. Mettre le code sur GitHub

```bash
# depuis le dossier décompressé
git remote add origin https://github.com/<ton-compte>/<nom-du-repo>.git
git branch -M main
git push -u origin main
```

(Le dépôt est déjà initialisé avec un premier commit.)

## 2. Activer GitHub Pages

Dans le repo GitHub : **Settings → Pages → Source : Deploy from a branch**,
choisir la branche `main` et le dossier `/ (root)`. Au bout d'une minute,
l'app est accessible à `https://<ton-compte>.github.io/<nom-du-repo>/`.

Aucune étape de build n'est nécessaire (HTML/CSS/JS simples, aucun
bundler) — c'est bien un site 100% statique.

## 3. Se connecter

Utilise le **même email/mot de passe** que ton application de coaching
actuelle (`maxime@ruthene-coachin.fr`) : c'est le même compte Supabase.
Aucune inscription supplémentaire n'est nécessaire.

## 4. Utilisation

1. **Athlètes** : créer un athlète (prénom, nom, date de naissance, poids,
   taille). Le poids sert de poids de corps par défaut, modifiable à
   chaque import.
2. **Importer un CSV** : sélectionner le fichier exporté depuis Vitruve.
   L'app détecte chaque séance (athlète + exercice + date), affiche un
   aperçu des séries lues, et propose de rattacher la séance à un athlète
   existant (ou d'en créer un) et de confirmer le seuil MVT à utiliser
   pour l'exercice concerné.
3. **Rapport** : depuis la fiche d'un athlète, ouvrir un test pour voir le
   tableau des séries, la zone d'entraînement, et les métriques avancées
   (1RM absolu/relatif, puissance maximale, V0/L0...). Le bouton
   **Télécharger le PDF** génère un fichier reprenant la mise en page de
   l'onglet CR VITRUVE (logo, tableau des séries, zones d'entraînement).
4. **Réglages** : ajuster les seuils MVT par exercice (valeurs par défaut
   pré-remplies, voir plus bas) et leurs alias de reconnaissance
   automatique dans le CSV Vitruve (ex : `SQUAT`, `BACK SQUAT`).

## Sur le calcul du 1RM (seuil MVT)

Le fichier d'origine estime le 1RM à partir d'une droite de régression
vélocité = f(charge) sur les séries testées, puis en cherchant la charge
correspondant à une vélocité minimale de référence (**MVT**, *minimal
velocity threshold*) propre à l'exercice — c'est la méthode utilisée en
recherche pour éviter de faire tester un vrai 1RM à l'athlète.

Le MVT dépend de l'exercice (et un peu du matériel/de la technique) :
plus le mouvement est "court" et lourd (développé couché), plus le MVT
est bas ; plus il implique une accélération sur une grande amplitude
(rowing), plus il est élevé. Les valeurs pré-remplies dans **Réglages**
sont des estimations médianes tirées de plages publiées dans la
littérature charge-vélocité (repères indicatifs novice → élite, à ±0.05
m/s selon l'athlète et la façon exacte dont la vélocité concentrique
moyenne est mesurée) :

| Exercice | Plage repère (novice → élite) | Valeur pré-remplie |
|---|---|---|
| Squat (back squat) | 0.35 → 0.20 m/s | 0.275 m/s |
| Squat avant | 0.45 → 0.25 m/s | 0.35 m/s |
| Développé couché | 0.30 → 0.15 m/s | 0.225 m/s |
| Développé militaire | 0.35 → 0.20 m/s | 0.275 m/s |
| Soulevé de terre | 0.25 → 0.12 m/s | 0.185 m/s |
| Soulevé de terre sumo | 0.25 → 0.10 m/s | 0.175 m/s |
| Trap bar deadlift | 0.45 → 0.30 m/s | 0.375 m/s |
| Rowing barre | 0.50 → 0.40 m/s | 0.45 m/s |

**Ces valeurs sont un point de départ, pas une vérité absolue** — la
méthode la plus fiable reste de calibrer le MVT toi-même : le jour où un
athlète fait un vrai 1RM sur un exercice, note la vélocité mesurée sur
cette dernière répète et mets à jour le MVT de cet exercice dans
**Réglages** avec cette valeur. Tu peux aussi laisser le champ MVT à la
vélocité minimale mesurée pendant le test (comportement du fichier Excel
d'origine) si tu n'as pas encore de valeur validée.

## Note sur l'import CSV Vitruve

Certains exports Vitruve présentent un décalage d'une colonne à partir de
« Repetition Date » (colonne « Weight (kg) » vide, valeurs réelles
décalées). L'app détecte ce cas automatiquement et corrige le décalage —
un aperçu des séries lues est toujours affiché avant de valider l'import,
pour vérifier que les charges/vélocités semblent cohérentes (charge qui
augmente, vélocité qui diminue série après série).

## Structure du projet

```
index.html          page unique de l'application
css/style.css        styles
js/config.js          URL + clé publique Supabase
js/calc.js            moteur de calcul (régressions, zones d'entraînement)
js/csv-import.js      lecture et correction du CSV Vitruve
js/pdf-report.js       génération du PDF "CR VITRUVE" (jsPDF)
js/main.js             routage, vues, accès aux données
assets/logo.png        logo Ruthene Coach'in
sql/schema.sql          schéma des tables vbt_* (déjà appliqué à Supabase)
```

## Sécurité

La clé Supabase intégrée dans `js/config.js` est la clé **publique**
(anon) — elle ne permet aucun accès sans être connecté : chaque table
`vbt_*` a la Row Level Security activée, avec une règle « un coach ne
voit que ses propres lignes ». C'est la même approche que ton application
de coaching existante.

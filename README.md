# ImmoPilot

Application web statique pour explorer les ventes DVF, simuler une marge avant fiscalité et suivre des opérations immobilières.

Site : https://patyv.github.io/immopilot/

## Connexion aux données

Dans **Marché DVF**, saisir un nom de commune ou un code postal, choisir la commune et cliquer sur **Charger les ventes DVF**. Un raccourci charge Poissy.

- Communes : `https://geo.api.gouv.fr/communes`, sans clé API.
- Ventes : `https://dvf-api.data.gouv.fr/dvf/csv/?com=CODE_INSEE`, service officiel utilisé par l’explorateur data.gouv.fr. Le navigateur récupère le CSV complet de la commune, sans utiliser une première page tronquée.
- Les indicateurs se recalculent localement après chaque filtre : type de bien, surface, date et nom de commune.
- Les lignes strictement identiques sont dédoublonnées. Les mutations sont regroupées par identifiant. Une seule habitation identifiable, éventuellement accompagnée de dépendances sur la même parcelle et disposition, est retenue ; les mutations complexes ou incohérentes sont exclues. Le prix inclut les annexes et la surface correspond à celle de l’habitation. DVF ne distingue pas toujours deux locaux identiques.
- La période affichée vient des dates réellement reçues. La médiane est descriptive, sans correction pour état, quartier ou annexes. Les échantillons de moins de 10 ventes sont signalés comme fragiles.
- Les services publics peuvent être indisponibles et certaines zones ne sont pas couvertes. Le téléchargement s’arrête à 35 Mo ou après 90 secondes ; aucun indicateur partiel n’est alors publié. L’import CSV reste possible pour un extrait plus ciblé.

La recherche de commune et son code INSEE sont transmis aux services publics correspondants. Aucun bien personnel ni note de visite ne leur est transmis. Les ventes ne sont conservées qu’en mémoire (cache de deux communes pendant 10 minutes), jusqu’au rechargement de la page. Les projets personnels restent dans le stockage local du navigateur ; utiliser export/restauration pour les sauvegarder ou les transférer. Aucun service ChatGPT n’est nécessaire.

## Source et licence des données

DGFiP / Etalab — Demandes de valeurs foncières géolocalisées — Licence Ouverte 2.0.
https://www.data.gouv.fr/datasets/demandes-de-valeurs-foncieres-geolocalisees

Code de l’API officielle : https://github.com/datagouv/api-dvf
Les données sont publiées avec un décalage ; les ventes ne sont pas des annonces en cours.

## Développement et vérification

Servir la racine avec un serveur HTTP statique. Aucun outil de compilation ni dépendance externe n’est requis.

```sh
python -m http.server 8000
node tests/dvf-core.test.cjs
node --check app.js
node --check dvf-online.js
```

GitHub Pages publie la branche `main`, dossier racine. Aucun secret n’est nécessaire.



## Version 3 — carte, comparables, lots et transfert privé

### Carte et comparables

- Leaflet 1.9.4 est fourni dans `vendor/` avec sa licence ; seul le fond de carte est demandé à OpenStreetMap, avec attribution visible. Aucun téléchargement de cartes hors connexion n’est effectué.
- Les ventes sont représentées au centre de leur parcelle. Les points sans coordonnées restent dans les statistiques générales et sont exclus lorsqu’un rayon est activé.
- Une référence se choisit dans les adresses DVF, dans le tableau, ou sur la carte. La recherche de rue est entièrement locale : aucune adresse saisie n’est envoyée à un géocodeur tiers.
- Distance géodésique (haversine), filtres de type, dates, surface cible et tolérance se combinent. Le rayon ne couvre que la commune déjà chargée. Le tableau est limité à 200 lignes et la carte à 3 000 points ; les statistiques utilisent tous les résultats retenus.
- Les quartiles décrivent les prix au m² observés. Ils ne corrigent pas l’état du bien et ne constituent pas une expertise immobilière.

### Revente par lots

Le simulateur additionne les prix des lots, ajoute une seule fois les frais de division, recalcule les frais de revente et affiche le seuil de marge nulle avant fiscalité. Les scénarios de baisse affectent le prix de revente et les honoraires proportionnels. Les travaux restent calculés sur la surface totale à rénover. Le détail des lots et toutes les hypothèses peuvent être enregistrés explicitement dans un projet, puis retrouvés avec son bouton **Simuler**.

### Transfert entre appareils

L’onglet **Sauvegardes** crée un instantané chiffré des projets et de leurs études. Il peut être téléchargé en JSON ou placé dans le fragment d’un lien de transfert (limité à 14 000 caractères). La phrase secrète n’est pas incluse dans le lien et doit être transmise séparément.

- Chiffrement local Web Crypto : AES-256-GCM, sel aléatoire de 16 octets, IV aléatoire de 12 octets ; dérivation PBKDF2-SHA-256 avec 600 000 itérations.
- La phrase secrète doit comporter au moins 12 caractères ; elle n’est pas conservée. Aucune récupération du mot de passe n’est proposée.
- Les liens sont déchiffrés localement. Le fragment après `#` n’est pas envoyé par HTTP et est supprimé de l’entrée d’historique de la page après lecture.
- La restauration vérifie la structure, affiche le nombre de projets/études et propose l’ajout de copies ou le remplacement explicite des données locales.
- Maximum 500 projets, 50 lots par étude et 1 Mo de contenu clair par sauvegarde.
- Il s’agit d’un transfert manuel d’une copie, pas d’une synchronisation automatique. GitHub Pages ne fournit pas de base privée multi-utilisateur. Un véritable stockage synchronisé reste à raccorder à un service privé avec authentification.
- Le stockage local des projets sur chaque appareil reste en clair ; seules les copies transférables sont chiffrées. Les exports historiques en clair sont toujours pris en charge.

### Tests

```sh
node tests/dvf-core.test.cjs
node --test tests/optimization.test.cjs
```

Tests : coordonnées invalides, haversine, filtres combinés, quartiles, marges par lots et seuil de revente, migration des anciennes sauvegardes, conservation des études, chiffrement/déchiffrement, mauvais mot de passe, altération et métadonnées de chiffrement invalides. Une recette dans le navigateur vérifie la carte sur Poissy, les filtres locaux, l’enregistrement d’une étude à deux lots et sa restauration par lien.



## Version 4 — objectif de marge et plafond d’achat

La carte **Cette opération atteint-elle votre objectif ?**, dans Marché DVF, évalue un prix d’achat saisi. DVF ne fournit pas d’annonces en cours : il ne s’agit pas d’une liste de biens actuellement disponibles à l’achat.

1. Le repère au m² est la moyenne arithmétique des prix au m² des ventes comparables, ou leur médiane au choix. Type et surface proche sont imposés à partir du bien étudié ; les filtres de dates, les bornes de surface et le rayon déjà choisis restent applicables. La vente choisie comme référence est exclue pour éviter une comparaison avec elle-même. Sans point précis, le repère porte sur la commune chargée.
2. La revente estimée vaut surface habitable × prix de référence au m² × (1 − décote de prudence). Une saisie manuelle du prix au m² reste possible et est identifiée comme non vérifiée par les comparables.
3. Le coût total additionne achat, frais d’acquisition proportionnels, agence à l’achat en supplément, travaux, aléas sur travaux, intérêts sur capital constant, charges de portage, autres frais fixes et frais de revente proportionnels.
4. Marge sur coût total = (revente estimée − coût total) / coût total × 100. Ce pourcentage n’est pas annualisé et reste avant fiscalité. Le taux de 8 % de frais d’acquisition est une hypothèse modifiable, sans calcul automatique de régime fiscal ou de frais notariés.
5. L’objectif est initialisé à 10 %, librement modifiable. Le seuil est comparé au résultat non arrondi. Un signal vert nécessite l’objectif atteint et au moins 10 comparables DVF ; un scénario manuel ou un échantillon plus faible reste à confirmer.
6. Le plafond d’achat hors frais pour un objectif t est `(revente / (1 + t) − coûts indépendants du prix d’achat) / (1 + taux de frais d’acquisition)`. Il est affiché à l’euro inférieur. Les frais fixes, les travaux et le financement restent constants dans ce calcul. Si aucun prix positif ne permet l’objectif, le plafond est déclaré incompatible.
7. L’opération peut être enregistrée avec ses hypothèses et ouverte dans le simulateur existant. Les honoraires supplémentaires d’achat sont alors inclus une seule fois dans ses autres frais, avec une note explicative. Les sauvegardes chiffrées incluent cette étude.

Les postes à zéro ne sont pas provisionnés. La comparaison par prix au m² ne corrige pas automatiquement l’état du logement, l’étage, le DPE ou les annexes ; il s’agit d’une estimation sous hypothèses, pas d’une rentabilité garantie.

Tests supplémentaires : distinction entre décote de marché et marge après frais, seuil exact et juste sous 10 %, frais d’acquisition et frais d’agence comptés une seule fois, coût d’emprunt et travaux, cohérence avec le simulateur et plafond d’achat vérifié à un euro près.

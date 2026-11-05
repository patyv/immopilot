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

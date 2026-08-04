# FoodCFO — Contrats des endpoints API

Référence de tous les endpoints REST exposés par le backend. Tous les endpoints (sauf mention "public") exigent un en-tête `Authorization: Bearer <accessToken>`. Toutes les réponses d'erreur suivent le même format : `{ "error": "CODE_ERREUR", "message": "Message lisible" }`.

Base locale : `http://localhost:3001`. Isolation multi-tenant systématique : chaque requête est filtrée par le `restaurantId` du token, jamais par un identifiant fourni dans le corps de la requête.

Rôles : **GERANT** (accès total), **CUISINE** (fiches techniques, gaspillage, factures, commandes), **SERVICE** (lecture carte/allergènes).

---

## Authentification — `/api/auth`

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| POST | `/login` | public | `{ email, password, restaurantId? }` → `{ accessToken, refreshToken, user }` ; ou, si l'email est lié à plusieurs restaurants et qu'aucun `restaurantId` n'est fourni, `{ requiresRestaurantSelection: true, restaurants: [{ restaurantId, restaurantName, role }] }` (renvoyer la requête avec le `restaurantId` choisi) |
| POST | `/refresh` | public | `{ refreshToken }` → nouveaux tokens (rotation : l'ancien refresh token est révoqué) |
| POST | `/logout` | public | `{ refreshToken }` → révoque le refresh token, `204` |
| POST | `/forgot-password` | public | `{ email }` → `{ message }` générique, identique que le compte existe ou non (jamais d'énumération). Envoie un email (Resend) avec un lien de réinitialisation valable 1h si le compte existe |
| POST | `/reset-password` | public | `{ token, newPassword }` → `204`. Met à jour le mot de passe de **tous** les comptes liés à cet email (multi-restaurant), révoque toutes les sessions actives (refresh tokens), invalide le token. `400 INVALID_RESET_TOKEN` si absent/expiré/déjà utilisé |

`GET /api/me` (authentifié, tous rôles) : renvoie le profil complet de l'utilisateur connecté (id, email, prénom, nom, rôle, restaurantId).

## Restaurant — `/api/restaurants`

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| POST | `/bootstrap` | public | Crée un restaurant + son premier compte Gérant, connecte directement (mêmes tokens qu'un login). `{ restaurantName, currency?, timezone?, gerant: { email, password, firstName, lastName } }` |
| GET | `/me` | tous | Réglages du restaurant courant (nom, seuils de marge, seuil d'alerte prix) |
| PATCH | `/me/thresholds` | GERANT | `{ marginGreenThreshold, marginOrangeThreshold }` — seuil vert doit être > seuil orange. Recalcule aussi les alertes `MARGIN_BELOW_THRESHOLD` sur tous les plats actifs (un plat peut basculer en/hors alerte sans qu'aucun prix ne change) |
| GET | `/me/export` | GERANT | Export RGPD complet en JSON (restaurant, utilisateurs sans mot de passe, fournisseurs, produits, plats+recettes, factures, commandes, gaspillage, alertes) |
| DELETE | `/me` | GERANT | Suppression RGPD irréversible. `{ confirmRestaurantName }` doit correspondre exactement au nom du restaurant. `204` |

### Multi-restaurant

Un même compte (même email) peut être lié à plusieurs restaurants (une ligne `User` par restaurant, mot de passe partagé). `POST /api/auth/login` renvoie `{ requiresRestaurantSelection: true, restaurants: [...] }` au lieu des tokens quand l'email correspond à plusieurs restaurants et qu'aucun `restaurantId` n'est fourni dans le corps de la requête.

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| POST | `/add` | GERANT | Crée un nouveau restaurant lié au compte courant (même email/mot de passe). `{ restaurantName, currency?, timezone? }` → nouveaux tokens pour ce restaurant |
| GET | `/mine` | tous | Liste des restaurants liés au compte courant : `{ restaurants: [{ id, name, role, isCurrent }] }` |
| POST | `/switch` | tous | Change de contexte restaurant. `{ restaurantId }` → nouveaux tokens, `403` si aucun compte lié à ce restaurant |
| GET | `/consolidated` | GERANT | Vue agrégée de tous les restaurants liés : totaux (`restaurantCount`, `averageMarginRatio`, `totalPotentialSavings`, `totalWasteThisMonth`, `totalRedAlerts`, `totalActiveAlerts`) + détail par restaurant (dont `activeAlertCount`) |

## Équipe — `/api/users`

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/` | GERANT | Liste des comptes du restaurant |
| POST | `/` | GERANT | `{ email, password, firstName, lastName, role }`. `409 EMAIL_TAKEN` si l'email est déjà utilisé — dans ce restaurant ou sur n'importe quel autre (vérifié tous restaurants confondus, comme `bootstrap`). Limité à 20/heure par restaurant |
| PATCH | `/:id` | GERANT | `{ role?, isActive?, firstName?, lastName? }` (pas de changement d'email/mot de passe via cet endpoint) |

## Fournisseurs — `/api/suppliers`

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/` | tous | Liste des fournisseurs |
| POST | `/` | GERANT, CUISINE | `{ name, category, preferredChannel, contactEmail?, contactPhone?, notes? }` |

## Produits — `/api/products`

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/` | tous | Liste des produits (avec fournisseur) |
| POST | `/` | GERANT, CUISINE | `{ supplierId, name, unit, currentPriceHT }` |
| PATCH | `/:id` | GERANT, CUISINE | Champs optionnels. `currentPriceHT` reste modifiable ici (correction de saisie, indépendante de `PriceHistory`/des factures) — déclenche une vérification des alertes de marge sur les plats concernés |
| DELETE | `/:id` | GERANT | `409 PRODUCT_IN_USE` si le produit est référencé par une fiche technique ou une commande |

## Carte / plats — `/api/menu-items`

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/` | tous | Liste des plats, `margin` calculée à la volée pour chacun (`null` si pas de fiche technique **ou** si le rôle est SERVICE — donnée financière interne, hors du périmètre "lecture carte/allergènes"). Pour SERVICE, `recipe` est aussi toujours `null` (la fiche technique porte le prix d'achat de chaque ingrédient) |
| GET | `/:id` | tous | Détail d'un plat + fiche technique + `margin` — mêmes restrictions pour SERVICE que ci-dessus |
| POST | `/` | GERANT, CUISINE | `{ name, category, sellingPriceTTC, vatRate, allergens? }` |
| PATCH | `/:id` | GERANT, CUISINE | Champs partiels (y compris `isActive`). `sellingPriceTTC`/`vatRate` réservés à GERANT seul — `403 FORBIDDEN` si CUISINE les envoie (le reste des champs passe normalement) |
| DELETE | `/:id` | GERANT | `204` |
| PUT | `/:menuItemId/recipe` | GERANT, CUISINE | Remplace intégralement la fiche technique. `{ ingredients: [{ productId, quantity }] }` |

## Tableau de bord — `/api/dashboard`

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/` | tous | `{ thresholds, kpis: { totalActiveMenuItems, missingRecipeCount, greenCount, orangeCount, redCount, averageMarginRatio, potentialSavings, wasteThisMonth }, menuItems: [...] }`. Pour SERVICE : `kpis: null, menuItems: []` (KPIs de marge = donnée financière interne, hors du périmètre "lecture carte/allergènes") |

## Alertes de marge — `/api/alerts`

Réservé à GERANT et CUISINE (même périmètre que le tableau de bord — donnée financière interne). Deux types : `SUPPLIER_PRICE_INCREASE` (générée à la validation d'une facture, seuil `Restaurant.priceIncreaseAlertThreshold`) et `MARGIN_BELOW_THRESHOLD` (générée quand la marge d'un plat passe sous le seuil rouge — vérifié à la validation de facture, à la modification du prix de vente/TVA et à la modification de la fiche technique ; se résout automatiquement quand la marge remonte).

| Méthode | Route | Description |
|---|---|---|
| GET | `/` | Toutes les alertes du restaurant (actives et traitées), la plus récente d'abord |
| PATCH | `/:id` | Body `{ status: 'RESOLVED' \| 'DISMISSED' }`. `404` si introuvable/hors restaurant, `409` (`ALREADY_HANDLED`) si l'alerte n'est plus `ACTIVE` |

## Factures — `/api/invoices`

Réservé à GERANT et CUISINE (données de coût sensibles).

| Méthode | Route | Description |
|---|---|---|
| GET | `/` | Liste des factures |
| POST | `/` | Upload multipart (`file`, `supplierId?`). Vérifie le type réel du fichier (magic bytes). Tente l'extraction IA (Claude vision) ; en cas d'échec, statut `ERROR` avec `errorMessage`, saisie manuelle possible ensuite. Limité à 30/heure par restaurant (appel API payant une fois configuré) |
| GET | `/:id` | Détail + lignes |
| GET | `/:id/file` | Fichier source original |
| PATCH | `/:id` | `{ supplierId?, invoiceDate?, totalAmount? }` |
| POST | `/:id/lines` | Ajoute une ligne manuellement. `{ rawLabel, productId?, quantity, unitPriceHT, totalPriceHT }` |
| PATCH | `/:id/lines/:lineId` | Modifie une ligne (rapprochement produit, correction) |
| DELETE | `/:id/lines/:lineId` | `204` |
| POST | `/:id/validate` | Exige un fournisseur associé et toutes les lignes rapprochées d'un produit. Crée l'historique de prix, met à jour le prix courant, génère une alerte si hausse > seuil du restaurant |

## Commandes fournisseurs — `/api/orders`

Réservé à GERANT et CUISINE.

| Méthode | Route | Description |
|---|---|---|
| GET | `/` | Liste des commandes |
| GET | `/suggestions` | `{ suggestions: { [productId]: quantité de la dernière commande } }` |
| POST | `/from-cart` | `{ items: [{ productId, quantity }] }` → une commande brouillon par fournisseur représenté |
| GET | `/:id` | Détail |
| PATCH | `/:id/lines` | Modifie les lignes (uniquement si `DRAFT`) |
| POST | `/:id/send` | Génère le message et tente l'envoi automatique selon le canal préféré du fournisseur (`Supplier.preferredChannel`) : email (Resend), WhatsApp Business (API Cloud Meta) ou SMS (Twilio). PHONE/WEB_PORTAL/FAX basculent sur l'email si une adresse est renseignée. Échec → commande reste `DRAFT`, `generatedMessage` renvoyé pour envoi manuel. Codes d'erreur : `MISSING_CONTACT_EMAIL`/`MISSING_CONTACT_PHONE` (`400`, coordonnée manquante) ; `EMAIL_SEND_FAILED`/`WHATSAPP_SEND_FAILED`/`SMS_SEND_FAILED` (`502`, échec de l'appel API). Limité à 30/heure par restaurant |
| PATCH | `/:id/status` | `{ status }` — transitions autorisées : DRAFT→CANCELLED, SENT→{CONFIRMED, DELIVERED, CANCELLED}, CONFIRMED→DELIVERED |

## Gaspillage — `/api/waste`

Réservé à GERANT et CUISINE.

| Méthode | Route | Description |
|---|---|---|
| GET | `/` | Liste des déclarations |
| GET | `/stats` | Stats du mois en cours : total, répartition par motif, par catégorie |
| POST | `/` | `{ productId XOR menuItemId, quantity, reason }` — valorisation calculée côté serveur (jamais saisie), jamais les deux champs produit/plat à la fois |

## Planning — `/api/planning` (Phase 7)

Rôles différenciés depuis le 03/08/2026 (décision explicite de l'utilisateur) : la **consultation du planning généré est ouverte à toute l'équipe** (GERANT/CUISINE/SERVICE) — c'est l'équivalent numérique du planning affiché en cuisine. Tout le reste (disponibilités, besoins, génération, validation, récapitulatif comptable) reste réservé au GERANT.

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/schedules` | tous | Liste des plannings générés (du plus récent au plus ancien) |
| GET | `/schedules/:id` | tous | Détail d'un planning, avec ses créneaux affectés |
| GET | `/availabilities` | GERANT | Liste des règles de disponibilité (indisponibilité) des employés |
| POST | `/availabilities` | GERANT | `{ userId, weekday XOR specificDate, reason? }` — récurrente (jour de semaine) ou ponctuelle (date précise), jamais les deux |
| DELETE | `/availabilities/:id` | GERANT | Supprime une règle |
| GET | `/staffing-requirements` | GERANT | Liste des besoins de staffing (gabarit hebdomadaire) |
| POST | `/staffing-requirements` | GERANT | `{ weekday, role, startTime, endTime, requiredCount }` — heures au format `HH:mm`, `endTime` doit être après `startTime` |
| DELETE | `/staffing-requirements/:id` | GERANT | Supprime un besoin |
| POST | `/schedules/generate` | GERANT | `{ periodStart, periodEnd }` (dates `YYYY-MM-DD`, période ≤ 31 jours) — génère un planning `DRAFT` à partir des besoins de staffing et des règles de disponibilité déjà saisis, en respectant le socle légal stable (repos quotidien 11h entre deux jours différents, 10h/jour et 48h/semaine maximum). Renvoie `{ schedule, unmetRequirements, employeeIdsWithoutRestDay }` — `unmetRequirements` liste les besoins non couverts (aucun employé éligible ou toutes les contraintes empêchaient l'affectation), `employeeIdsWithoutRestDay` signale les employés sans aucun jour sans créneau sur la période (repos hebdomadaire non garanti) — à vérifier manuellement avant validation, jamais bloquant |
| POST | `/schedules/:id/validate` | GERANT | Verrouille le planning : `DRAFT` → `VALIDATED`, irréversible (comme `Invoice.VALIDATED`). `409` si déjà validé |
| PATCH | `/schedules/:scheduleId/shifts/:shiftId` | GERANT | `{ isAbsent?, absenceNote?, actualStartTime?, actualEndTime? }` — corrige un créneau après coup (retard, départ anticipé, absence) sur un planning déjà `VALIDATED` uniquement (`400 SCHEDULE_NOT_VALIDATED` sinon — un brouillon n'a encore rien de "réellement travaillé"). `actualStartTime`/`actualEndTime` : les deux ou aucun, heures au format `HH:mm`, `null` explicite pour effacer. Marque `wasManuallyAdjusted: true` de façon permanente (métrique de fiabilité du générateur), même si la correction est ensuite annulée en renvoyant tous les champs à leur valeur neutre |
| GET | `/hours-summary.csv` | GERANT | `?periodStart&periodEnd` (optionnels, défaut : mois calendaire en cours) — export CSV du récapitulatif d'heures par employé (heures normales/supplémentaires, cumulées par semaine ISO au seuil de 35h ; heures dimanche et jours fériés, étiquettes indépendantes sur les mêmes heures) pour transmission au comptable. Remplace volontairement un bulletin de paye légal (décision 7.0). N'inclut que les créneaux des plannings `VALIDATED` (comme `/api/exports/invoices.csv` qui n'inclut que les factures validées) ; utilise les heures réellement effectuées (`actualStartTime`/`actualEndTime`) quand elles ont été corrigées après coup, sinon les heures prévues ; un créneau marqué absent ne compte aucune heure |

Frontend : `/planning` (liste/consultation pour tous ; disponibilités, besoins, génération, téléchargement du récapitulatif affichés uniquement au Gérant) et `/planning/schedules/:id` (détail pour tous ; bouton de validation et correction par créneau — présent/absent, heures effectives — affichés uniquement au Gérant, sur un planning validé).

## Hygiène — `/api/hygiene` (Phase 7)

Rôles différenciés par sous-ressource (contrairement à Planning, entièrement Gérant) : le contenu de référence et les modèles de checklist sont une décision de pilotage (écriture Gérant uniquement), remplir une checklist de fin de service est un geste opérationnel quotidien ouvert à toute l'équipe.

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/reference-items` | tous | Liste des rappels/normes (sans les octets média — `hasMedia` seulement) |
| GET | `/reference-items/:id/media` | tous | Sert l'image du rappel |
| POST | `/reference-items` | GERANT | `multipart/form-data` : `title`, `content`, `media?` (fichier JPG/PNG optionnel, type réel vérifié par magic bytes) |
| PATCH | `/reference-items/:id` | GERANT | `multipart/form-data`, mêmes champs, tous optionnels — `media` non fourni conserve le média existant |
| DELETE | `/reference-items/:id` | GERANT | Suppression définitive (aucune donnée historique n'en dépend) |
| GET | `/checklist-templates` | tous | Liste des modèles de checklist actifs, avec leurs items ordonnés |
| POST | `/checklist-templates` | GERANT | `{ name, items: string[] }` — modèle et items créés ensemble, non modifiables ensuite (voir DELETE) |
| DELETE | `/checklist-templates/:id` | GERANT | Désactive le modèle (`isActive: false`, pas de suppression physique — comme `Supplier.isActive`) ; pour faire évoluer une checklist, désactiver l'ancien modèle et en créer un nouveau |
| GET | `/checklist-completions` | tous | Liste des complétions (du plus récent au plus ancien) |
| GET | `/checklist-completions/:id` | tous | Détail d'une complétion, avec ses items et leur état |
| POST | `/checklist-completions` | tous | `{ templateId, serviceDate }` — démarre une complétion (une ligne par item du modèle, toutes non cochées) ; `404` si le modèle est introuvable ou désactivé |
| PATCH | `/checklist-completions/:completionId/items/:itemId` | tous | `{ isChecked }` — coche/décoche un item ; `completedAt` recalculé à chaque appel à partir de l'état réel de tous les items (non-null seulement si tous cochés — décocher un item après coup annule la complétion) |

Frontend : `/hygiene` (rappels, modèles, démarrage de checklist) et `/hygiene/completions/:id` (cochage).

## Contrôle — `/api/control` (Phase 7)

Réservé au GERANT (décision de pilotage administratif, contrairement à Hygiène où les checklists sont ouvertes à l'équipe).

| Méthode | Route | Description |
|---|---|---|
| GET | `/documents` | `?organism?` (filtre optionnel) — liste des documents déposés (sans les octets bruts) |
| GET | `/documents/:id/file` | Sert le fichier |
| POST | `/documents` | `multipart/form-data` : `organism` (`URSSAF`\|`DDPP`\|`DGCCRF`\|`DGFIP`\|`INSPECTION_TRAVAIL`), `category`, `label`, `file` (PDF/JPG/PNG, type réel vérifié par magic bytes) |
| DELETE | `/documents/:id` | Suppression définitive |
| GET | `/dossier/:organism` | `?periodStart&periodEnd` (optionnels, défaut : mois calendaire en cours) — agrège les documents déposés pour cet organisme + les données déjà en base quand pertinent, jamais dupliquées : `hoursSummary` (récapitulatif d'heures, réutilise `lib/hoursSummary.ts`) pour `URSSAF`/`INSPECTION_TRAVAIL`, `cleaningHistory` (historique des checklists) pour `DDPP` ; `undefined` pour `DGCCRF`/`DGFIP` (aucune donnée auto-tirée pertinente identifiée) |

Catégories de documents suggérées par organisme (aide à la saisie côté frontend, `category` reste une chaîne libre côté serveur — la liste précise reste à affiner avec l'usage réel) :
- **URSSAF** : contrat de travail, registre unique du personnel, bulletin de paye, avenant, déclaration sociale (DSN)
- **DDPP** : PMS, relevé de température, attestation de formation HACCP, plan de nettoyage, traçabilité produits
- **DGCCRF** : affichage des prix, étiquetage allergènes, origine des viandes, facture fournisseur, réclamation client
- **DGFiP** : attestation logiciel de caisse (NF525), facture de vente, déclaration de TVA, livre de recettes
- **Inspection du travail** : contrat de travail, registre unique du personnel, affichage obligatoire, DUERP, règlement intérieur

Frontend : `/control` (grille des 5 organismes) et `/control/:organism` (dossier + dépôt de documents). Pas de vrais logos officiels affichés (droits/risque de laisser penser à un partenariat — décision 7.0) : badges typographiques neutres à la place.

## Caisse enregistreuse (POS) — `/api/pos` (Phase 9)

Rapprochement des ventes remontées par la caisse avec les plats de la carte. Pas de endpoint de création de vente : contrairement aux factures, une vente doit toujours provenir de la caisse elle-même (webhook/polling — mécanisme réel pas encore construit, dépend du premier système intégré, voir `FoodCFO_PLAN.md` Phase 9) ; les ventes de test sont injectées directement en base par les tests d'intégration, pas via l'API publique.

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/connections` | GERANT | Liste les connexions caisse du restaurant |
| POST | `/connections` | GERANT | `{ provider }` (`LIGHTSPEED`\|`LADDITION`\|`ZELTY`\|`INNOVORDER`\|`CLYO_SYSTEMS`) — `409 CONNECTION_ALREADY_ACTIVE` si une connexion est déjà active (une seule à la fois, on change de caisse plutôt que d'en cumuler) |
| POST | `/connections/:id/disconnect` | GERANT | Désactive la connexion (`isActive: false`, `disconnectedAt`) sans la supprimer — les ventes déjà remontées restent consultables |
| GET | `/sales` | GERANT, CUISINE | Liste les ventes avec leurs lignes ; chaque vente porte un `needsReview` calculé (au moins une ligne dont `menuItemId` est `null`) |
| PATCH | `/sales/:saleId/line-items/:lineItemId` | GERANT, CUISINE | Corrige une ligne (`menuItemId`, `quantity`, `unitPriceTTC`, `totalPriceTTC`) — `rawLabel` volontairement non modifiable (préserve ce que la caisse a réellement transmis) ; marque `wasManuallyEdited: true` |

Rapprochement automatique (`lib/posMatching.ts`, `findBestMenuItemMatch`) : correspondance exacte du libellé normalisé (casse/accents/espaces ignorés) en priorité, repli sur une correspondance partielle uniquement si elle est unique — sinon `null` plutôt que de deviner, la ligne attend une correction manuelle. Pas encore appelée en production : elle sera invoquée à la création de chaque `PosSaleLineItem`, une fois le mécanisme de connexion réel construit.

## Exports et rapports — `/api/exports`, `/api/reports`

Réservé à GERANT.

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/exports/invoices.csv?from&to` | Export comptable CSV des factures validées (mois en cours par défaut) |
| GET | `/api/reports/monthly/preview` | Aperçu du rapport mensuel (données + email généré) |
| POST | `/api/reports/monthly/send` | Envoie le rapport à tous les comptes Gérant actifs. Envoi automatique aussi programmé le 1er de chaque mois (`node-cron`). Limité à 10/heure par restaurant |

## Facturation — `/api/billing`

Abonnement payant (Stripe). Sans `STRIPE_SECRET_KEY`/`STRIPE_PRICE_ID` valides, `/checkout` et `/portal` renvoient `503 BILLING_NOT_CONFIGURED` — le reste de l'application fonctionne normalement.

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/status` | tous | `{ billingConfigured, subscriptionStatus, subscriptionCurrentPeriodEnd }` |
| POST | `/checkout` | GERANT | Crée une session Stripe Checkout (abonnement, `STRIPE_PRICE_ID`) → `{ url }` à rediriger |
| POST | `/portal` | GERANT | Crée une session du portail Stripe (gestion libre-service : moyen de paiement, résiliation, factures) → `{ url }`. `400 NO_SUBSCRIPTION` si aucun abonnement n'a jamais été initié |
| POST | `/api/webhooks/stripe` | public (signature vérifiée) | Synchronise `Restaurant.subscriptionStatus` depuis les évènements Stripe (`checkout.session.completed`, `customer.subscription.updated`/`.deleted`). Jamais appelé directement par le frontend |

---

## Codes d'erreur courants

`VALIDATION_ERROR` (400, corps invalide selon Zod), `UNAUTHENTICATED` (401), `FORBIDDEN` (403, rôle insuffisant), `NOT_FOUND` (404), `CONFLICT` (409, contrainte unique violée), `INTERNAL_ERROR` (500). Certains endpoints ont des codes métier dédiés (`EMAIL_TAKEN`, `INVALID_FILE_TYPE`, `MISSING_SUPPLIER`, `INVALID_TRANSITION`, `CONFIRMATION_MISMATCH`, etc.) — voir le contrôleur concerné dans `backend/src/controllers/`.

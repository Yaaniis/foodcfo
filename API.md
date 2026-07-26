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
| PATCH | `/me/thresholds` | GERANT | `{ marginGreenThreshold, marginOrangeThreshold }` — seuil vert doit être > seuil orange |
| GET | `/me/export` | GERANT | Export RGPD complet en JSON (restaurant, utilisateurs sans mot de passe, fournisseurs, produits, plats+recettes, factures, commandes, gaspillage, alertes) |
| DELETE | `/me` | GERANT | Suppression RGPD irréversible. `{ confirmRestaurantName }` doit correspondre exactement au nom du restaurant. `204` |

### Multi-restaurant

Un même compte (même email) peut être lié à plusieurs restaurants (une ligne `User` par restaurant, mot de passe partagé). `POST /api/auth/login` renvoie `{ requiresRestaurantSelection: true, restaurants: [...] }` au lieu des tokens quand l'email correspond à plusieurs restaurants et qu'aucun `restaurantId` n'est fourni dans le corps de la requête.

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| POST | `/add` | GERANT | Crée un nouveau restaurant lié au compte courant (même email/mot de passe). `{ restaurantName, currency?, timezone? }` → nouveaux tokens pour ce restaurant |
| GET | `/mine` | tous | Liste des restaurants liés au compte courant : `{ restaurants: [{ id, name, role, isCurrent }] }` |
| POST | `/switch` | tous | Change de contexte restaurant. `{ restaurantId }` → nouveaux tokens, `403` si aucun compte lié à ce restaurant |
| GET | `/consolidated` | GERANT | Vue agrégée de tous les restaurants liés : totaux (`restaurantCount`, `averageMarginRatio`, `totalPotentialSavings`, `totalWasteThisMonth`, `totalRedAlerts`) + détail par restaurant |

## Équipe — `/api/users`

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/` | GERANT | Liste des comptes du restaurant |
| POST | `/` | GERANT | `{ email, password, firstName, lastName, role }` |
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

## Carte / plats — `/api/menu-items`

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/` | tous | Liste des plats, `margin` calculée à la volée pour chacun (`null` si pas de fiche technique) |
| GET | `/:id` | tous | Détail d'un plat + fiche technique + `margin` |
| POST | `/` | GERANT, CUISINE | `{ name, category, sellingPriceTTC, vatRate, allergens? }` |
| PATCH | `/:id` | GERANT, CUISINE | Champs partiels (y compris `isActive`) |
| DELETE | `/:id` | GERANT | `204` |
| PUT | `/:menuItemId/recipe` | GERANT, CUISINE | Remplace intégralement la fiche technique. `{ ingredients: [{ productId, quantity }] }` |

## Tableau de bord — `/api/dashboard`

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/` | tous | `{ thresholds, kpis: { totalActiveMenuItems, missingRecipeCount, greenCount, orangeCount, redCount, averageMarginRatio, potentialSavings, wasteThisMonth }, menuItems: [...] }` |

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

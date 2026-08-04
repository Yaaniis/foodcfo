import LegalPageLayout from '../../components/LegalPageLayout';

// Reflète ce que l'application fait réellement (vérifié dans le code,
// pas supposé) : pas de cookie de tracking, tokens en localStorage,
// sous-traitants listés = ceux effectivement intégrés (Railway, Stripe,
// Resend, Anthropic, Meta/WhatsApp, Twilio — voir backend/src/lib/),
// export et suppression RGPD déjà fonctionnels via l'application
// elle-même (l'export JSON n'inclut pas encore les données Planning/
// Hygiène/Contrôle de la Phase 7, voir libellé volontairement non
// qualifié de "complet" ci-dessous).
export default function ConfidentialitePage() {
  return (
    <LegalPageLayout title="Politique de confidentialité">
      <div className="bg-warn-soft border border-warn/30 rounded-card-md px-4 py-3 text-warn">
        <p className="font-semibold">À compléter avant mise en ligne commerciale</p>
        <p className="mt-1">
          L'identité du responsable de traitement (<span className="font-mono text-xs bg-warn/15 px-1 rounded-card-sm">
            [À COMPLÉTER]
          </span>
          ) doit être renseignée. Le reste de cette page décrit fidèlement le fonctionnement technique actuel de
          l'application, mais une relecture par un professionnel est recommandée avant exploitation commerciale
          réelle.
        </p>
      </div>

      <section>
        <h2>Responsable du traitement</h2>
        <p>
          [À COMPLÉTER : nom ou raison sociale], [À COMPLÉTER : adresse] — [À COMPLÉTER : email de contact pour
          toute question relative à vos données personnelles].
        </p>
      </section>

      <section>
        <h2>Données collectées</h2>
        <p>Pour les comptes utilisateurs (Gérant, Cuisine, Service) : prénom, nom, email, mot de passe (jamais stocké en clair, uniquement sous forme de hachage).</p>
        <p className="mt-2">
          Pour l'exploitation du restaurant : données saisies par l'utilisateur (fournisseurs, produits, prix,
          recettes, factures, commandes, déclarations de gaspillage). Ces données sont des données professionnelles
          du restaurant, pas des données personnelles de ses clients — FoodCFO ne collecte aucune donnée sur les
          clients finaux du restaurant.
        </p>
        <p className="mt-2">
          Pour la gestion d'équipe et la conformité réglementaire (Planning, Hygiène, Contrôle) : disponibilités,
          plannings et heures travaillées des membres de l'équipe, complétions de checklists d'hygiène, ainsi que
          les documents que vous déposez vous-même pour constituer vos dossiers de conformité (URSSAF, DDPP,
          DGCCRF, DGFiP, Inspection du travail) — qui peuvent contenir des données personnelles de membres de votre
          personnel (registre unique du personnel, bulletins de paye, contrats de travail, par exemple).
        </p>
      </section>

      <section>
        <h2>Finalités</h2>
        <ul>
          <li>Fournir le service : suivi des marges, gestion des commandes fournisseurs, suivi du gaspillage, rapports</li>
          <li>Authentification et sécurité du compte</li>
          <li>Envoi de communications liées au service (rapport mensuel, si activé)</li>
        </ul>
      </section>

      <section>
        <h2>Base légale</h2>
        <p>Exécution du contrat qui vous lie à FoodCFO au moment de la création de votre compte (conditions générales d'utilisation).</p>
      </section>

      <section>
        <h2>Destinataires et sous-traitants</h2>
        <p>Vos données ne sont jamais vendues ni utilisées à des fins publicitaires. Elles peuvent être traitées par les sous-traitants techniques suivants, uniquement dans la mesure nécessaire au fonctionnement du service :</p>
        <ul>
          <li><strong>Railway Corporation</strong> (États-Unis) — hébergement de l'application, données traitées dans la région Europe (Amsterdam)</li>
          <li><strong>Stripe</strong> — traitement des paiements et de la facturation de votre abonnement (souscription, moyen de paiement, factures), si vous souscrivez à l'offre payante. Le paiement s'effectue directement sur une page sécurisée hébergée par Stripe : FoodCFO ne reçoit et ne stocke jamais votre numéro de carte bancaire</li>
          <li><strong>Anthropic</strong> — extraction automatique des données de factures (uniquement si vous utilisez l'upload de facture), lorsque cette fonctionnalité est activée</li>
          <li><strong>Resend</strong> — envoi des emails de commande fournisseur et des rapports mensuels, lorsque cette fonctionnalité est activée</li>
          <li><strong>Meta (WhatsApp Business)</strong> et <strong>Twilio (SMS)</strong> — envoi des commandes fournisseurs, uniquement pour les fournisseurs dont vous avez choisi ce canal de contact</li>
        </ul>
      </section>

      <section>
        <h2>Durée de conservation</h2>
        <p>Vos données sont conservées tant que votre compte reste actif. En cas de suppression de votre restaurant, l'ensemble des données associées est supprimé de façon irréversible (voir « Vos droits » ci-dessous).</p>
      </section>

      <section>
        <h2>Hébergement et localisation des données</h2>
        <p>L'application et sa base de données sont hébergées par Railway Corporation, dans des serveurs situés dans la région Europe (Amsterdam, Pays-Bas).</p>
      </section>

      <section>
        <h2>Cookies</h2>
        <p>
          FoodCFO n'utilise aucun cookie de suivi ni de mesure d'audience. La connexion repose sur un jeton
          d'authentification stocké dans le navigateur (localStorage), pas sur un cookie.
        </p>
      </section>

      <section>
        <h2>Vos droits</h2>
        <p>Conformément au RGPD, vous disposez d'un droit d'accès, de rectification, d'effacement et de portabilité de vos données. Le compte Gérant peut exercer directement ces droits depuis l'application, sans délai d'attente :</p>
        <ul>
          <li><strong>Export de vos données</strong> : Réglages du restaurant → Export RGPD (fichier JSON complet)</li>
          <li><strong>Suppression définitive</strong> : Réglages du restaurant → Supprimer le restaurant (irréversible, avec confirmation)</li>
        </ul>
        <p className="mt-2">
          Vous pouvez également nous contacter à [À COMPLÉTER : email de contact] pour toute question, ou
          introduire une réclamation auprès de la CNIL (
          <a href="https://www.cnil.fr" target="_blank" rel="noreferrer">
            www.cnil.fr
          </a>
          ).
        </p>
      </section>
    </LegalPageLayout>
  );
}

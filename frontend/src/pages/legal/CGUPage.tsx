import LegalPageLayout from '../../components/LegalPageLayout';

// Pas de mention de tarifs fermes : aucun système de facturation n'existe
// dans l'application à ce stade (voir journal de bord), donc toute
// clause de type CGV serait fausse. À réviser le jour où un modèle de
// facturation est mis en place.
export default function CGUPage() {
  return (
    <LegalPageLayout title="Conditions générales d'utilisation">
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-amber-900">
        <p className="font-semibold">À compléter avant mise en ligne commerciale</p>
        <p className="mt-1">
          Modèle de structure standard pour un logiciel en mode SaaS — à faire relire par un professionnel du
          droit et à adapter (notamment la clause tarifaire) une fois votre modèle commercial défini.
        </p>
      </div>

      <section>
        <h2>Objet</h2>
        <p>
          Les présentes conditions générales d'utilisation (CGU) régissent l'accès et l'utilisation de
          l'application FoodCFO, un outil d'aide à la gestion destiné aux restaurateurs (suivi des marges,
          gestion des commandes fournisseurs, suivi du gaspillage, rapports). En créant un compte, vous acceptez
          sans réserve les présentes CGU.
        </p>
      </section>

      <section>
        <h2>Création de compte</h2>
        <p>
          La création d'un compte restaurant crée automatiquement un compte « Gérant », qui peut ensuite inviter
          des membres de son équipe avec des rôles restreints (Cuisine, Service). Vous vous engagez à fournir des
          informations exactes et à préserver la confidentialité de vos identifiants de connexion.
        </p>
      </section>

      <section>
        <h2>Description du service</h2>
        <p>FoodCFO est un outil d'aide à la décision qui calcule des indicateurs (marges, coûts matière, impact du gaspillage) à partir des données que vous saisissez. Ces calculs sont fournis à titre indicatif et ne remplacent ni un expert-comptable, ni un conseil fiscal ou juridique professionnel. Vous restez seul responsable des décisions de gestion prises sur la base de ces indicateurs.</p>
      </section>

      <section>
        <h2>Vos obligations</h2>
        <ul>
          <li>Fournir des données exactes (prix, quantités, recettes) — la fiabilité des calculs de marge en dépend directement</li>
          <li>Ne pas utiliser le service à des fins illicites ou pour y stocker des données dont vous n'avez pas le droit</li>
          <li>Ne pas tenter de contourner les mesures de sécurité (limitation de débit, isolation entre restaurants) mises en place</li>
        </ul>
      </section>

      <section>
        <h2>Disponibilité du service</h2>
        <p>
          Nous mettons en œuvre des moyens raisonnables pour assurer la disponibilité du service, sans garantie de
          disponibilité continue ni d'engagement de niveau de service (SLA) formel à ce stade. Des interruptions
          ponctuelles (maintenance, mise à jour) peuvent survenir.
        </p>
      </section>

      <section>
        <h2>Tarifs</h2>
        <p>[À COMPLÉTER : conditions tarifaires — aucun système de facturation n'est en place à ce jour ; cette section devra être complétée avant toute mise en vente du service].</p>
      </section>

      <section>
        <h2>Durée et résiliation</h2>
        <p>
          Vous pouvez supprimer définitivement votre compte et l'ensemble de vos données à tout moment depuis les
          réglages du restaurant (Gérant uniquement). Cette suppression est immédiate et irréversible.
        </p>
      </section>

      <section>
        <h2>Responsabilité</h2>
        <p>
          FoodCFO ne saurait être tenu responsable des conséquences d'une erreur de saisie, d'une indisponibilité
          temporaire du service, ou d'une décision de gestion prise sur la base des indicateurs fournis par
          l'application.
        </p>
      </section>

      <section>
        <h2>Droit applicable</h2>
        <p>Les présentes CGU sont soumises au droit français. Tout litige relève, à défaut de résolution amiable, des tribunaux compétents.</p>
      </section>
    </LegalPageLayout>
  );
}

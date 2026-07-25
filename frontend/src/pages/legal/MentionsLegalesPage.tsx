import LegalPageLayout from '../../components/LegalPageLayout';

// Contenu de base conforme à la structure exigée par la LCEN (art. 6-III) :
// éditeur, hébergeur, propriété intellectuelle, contact. Les informations
// propres à l'exploitant (raison sociale, SIRET, adresse...) ne sont pas
// connues du code et doivent être complétées avant toute exploitation
// commerciale réelle — voir l'encart ci-dessous.
export default function MentionsLegalesPage() {
  return (
    <LegalPageLayout title="Mentions légales">
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-amber-900">
        <p className="font-semibold">À compléter avant mise en ligne commerciale</p>
        <p className="mt-1">
          Les champs marqués <span className="font-mono text-xs bg-amber-100 px-1 rounded">[À COMPLÉTER]</span>{' '}
          nécessitent vos informations réelles (identité de l'éditeur, SIRET, adresse). Ce texte est un modèle de
          structure standard, pas un document validé par un professionnel du droit — faites-le relire par un
          avocat ou votre expert-comptable avant toute exploitation commerciale.
        </p>
      </div>

      <section>
        <h2>Éditeur du site</h2>
        <p>
          Le site et l'application FoodCFO sont édités par [À COMPLÉTER : nom ou raison sociale], [À COMPLÉTER :
          forme juridique — entreprise individuelle, SASU, etc.], immatriculée sous le numéro SIRET [À COMPLÉTER],
          dont le siège est situé [À COMPLÉTER : adresse].
        </p>
        <p className="mt-2">
          Directeur de la publication : [À COMPLÉTER : nom].
          <br />
          Contact : [À COMPLÉTER : adresse email de contact].
        </p>
      </section>

      <section>
        <h2>Hébergement</h2>
        <p>
          L'application (serveurs et base de données) est hébergée par Railway Corporation, 548 Market St PMB
          68956, San Francisco, CA 94104, États-Unis (
          <a href="https://railway.com" className="underline" target="_blank" rel="noreferrer">
            railway.com
          </a>
          ).
        </p>
        <p className="mt-2">
          Bien que Railway Corporation soit une société américaine, le traitement et le stockage des données de
          cette application sont configurés pour s'effectuer dans la région Europe (Amsterdam, Pays-Bas), afin de
          respecter les exigences de localisation des données personnelles au sein de l'Union européenne.
        </p>
      </section>

      <section>
        <h2>Propriété intellectuelle</h2>
        <p>
          L'ensemble des éléments de l'application FoodCFO (structure, textes, logos, code source) est protégé au
          titre du droit d'auteur et du droit des bases de données. Toute reproduction ou représentation, totale ou
          partielle, sans autorisation, est interdite.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Pour toute question relative aux présentes mentions légales : [À COMPLÉTER : adresse email de contact].
        </p>
      </section>
    </LegalPageLayout>
  );
}

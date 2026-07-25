# Image postgres officielle plutôt qu'une image Node : c'est le plus
# simple moyen d'avoir pg_dump disponible, dans la même version majeure
# que la base de production (18) — évite tout risque d'incompatibilité
# entre un pg_dump trop ancien/récent et le serveur cible.
FROM postgres:18-alpine

COPY backup.sh /backup.sh
RUN chmod +x /backup.sh

CMD ["/backup.sh"]

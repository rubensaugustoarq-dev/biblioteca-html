import type { Sobrado } from "../data/sobrados";

export function SobradoCard({
  sobrado,
  priority = false,
}: {
  sobrado: Sobrado;
  priority?: boolean;
}) {
  return (
    <article className="sobrado-card">
      <a
        className="sobrado-card-image"
        href={`/biblioteca-html/projetos/rubens-arquitetura/sobrados/${sobrado.slug}`}
        aria-label={`Ver detalhes do ${sobrado.nome}`}
      >
        <img
          src={sobrado.imagemMiniatura}
          alt={`Fachada do ${sobrado.nome}`}
          width="1200"
          height="660"
          loading={priority ? "eager" : "lazy"}
          decoding="async"
        />
        <span>{sobrado.codigo}</span>
      </a>
      <div className="sobrado-card-body">
        <p className="sobrado-badge">{sobrado.badge}</p>
        <h3>
          <a href={`/biblioteca-html/projetos/rubens-arquitetura/sobrados/${sobrado.slug}`}>{sobrado.nome}</a>
        </h3>
        <p className="sobrado-card-title">{sobrado.titulo}</p>
        <dl>
          <div>
            <dt>Área</dt>
            <dd>{sobrado.areaConstruida}</dd>
          </div>
          <div>
            <dt>Terreno</dt>
            <dd>{sobrado.dimensoesTerreno}</dd>
          </div>
          <div>
            <dt>Programa</dt>
            <dd>
              {sobrado.quartos} quartos · {sobrado.vagas} vagas
            </dd>
          </div>
        </dl>
        <a className="sobrado-card-link" href={`/biblioteca-html/projetos/rubens-arquitetura/sobrados/${sobrado.slug}`}>
          Ver projeto <span>→</span>
        </a>
      </div>
    </article>
  );
}

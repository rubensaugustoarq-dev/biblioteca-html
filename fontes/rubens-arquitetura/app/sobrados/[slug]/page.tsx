import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PortfolioViewer } from "../../components/PortfolioViewer";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { SobradoCard } from "../../components/SobradoCard";
import {
  getSobrado,
  sobrados,
  sobradoWhatsAppMessage,
} from "../../data/sobrados";
import { whatsappUrl } from "../../data/contact";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return sobrados.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const sobrado = getSobrado(slug);
  if (!sobrado) return {};
  const title = `${sobrado.nome} | Rubens Augusto Arquitetura`;
  const description = `${sobrado.titulo}. ${sobrado.areaConstruida}, referência de terreno ${sobrado.dimensoesTerreno}. Solicite uma análise para adaptação ao seu terreno.`;
  return {
    title,
    description,
    alternates: { canonical: `/biblioteca-html/projetos/rubens-arquitetura/sobrados/${sobrado.slug}` },
    openGraph: {
      title,
      description,
      url: `/biblioteca-html/projetos/rubens-arquitetura/sobrados/${sobrado.slug}`,
      images: [
        {
          url: sobrado.imagemMiniatura,
          width: 1200,
          height: 660,
          alt: `Fachada do ${sobrado.nome}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [sobrado.imagemMiniatura],
    },
  };
}

export default async function SobradoPage({ params }: Props) {
  const { slug } = await params;
  const sobrado = getSobrado(slug);
  if (!sobrado) notFound();
  const whatsapp = whatsappUrl(sobradoWhatsAppMessage(sobrado));
  const relacionados = sobrados
    .filter((item) => item.slug !== sobrado.slug)
    .slice(Math.max(0, sobrado.id - 2), Math.max(0, sobrado.id - 2) + 3);

  return (
    <main className="catalog-shell detail-shell">
      <SiteHeader active="sobrados" />
      <section className="detail-hero">
        <div className="detail-breadcrumb">
          <a href="/biblioteca-html/projetos/rubens-arquitetura/sobrados">Sobrados</a>
          <span>→</span>
          <span>{sobrado.nome}</span>
        </div>
        <div className="detail-hero-grid">
          <figure>
            <img
              src={sobrado.imagemMiniatura}
              alt={`Fachada do ${sobrado.nome}`}
              width="1200"
              height="660"
            />
          </figure>
          <div className="detail-summary">
            <p className="sobrado-badge">{sobrado.badge}</p>
            <h1>{sobrado.nome}</h1>
            <h2>{sobrado.titulo}</h2>
            <p>{sobrado.descricao}</p>
            <dl className="detail-facts">
              <div>
                <dt>Área construída</dt>
                <dd>{sobrado.areaConstruida}</dd>
              </div>
              <div>
                <dt>Terreno de referência</dt>
                <dd>{sobrado.dimensoesTerreno}</dd>
              </div>
              <div>
                <dt>Pavimentos</dt>
                <dd>{sobrado.pavimentos}</dd>
              </div>
              <div>
                <dt>Programa</dt>
                <dd>
                  {sobrado.quartos} quartos · {sobrado.suites} suíte ·{" "}
                  {sobrado.vagas} vagas
                </dd>
              </div>
            </dl>
            <a
              className="button detail-whatsapp"
              data-project-id={sobrado.codigo}
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
            >
              Solicitar orçamento para meu terreno <span>↗</span>
            </a>
            <small>
              Converse diretamente com Rubens Augusto sobre a adaptação deste
              modelo.
            </small>
          </div>
        </div>
      </section>
      <section className="detail-program" aria-labelledby="program-title">
        <div>
          <p className="section-tag">Programa confirmado</p>
          <h2 id="program-title">Características do modelo.</h2>
        </div>
        <ul>
          {sobrado.caracteristicas.map((item) => (
            <li key={item}>
              <span>+</span>
              {item}
            </li>
          ))}
        </ul>
      </section>
      <section className="detail-portfolio" aria-labelledby="portfolio-title">
        <header>
          <div>
            <p className="section-tag">Apresentação completa</p>
            <h2 id="portfolio-title">
              Fachada, plantas e informações técnicas.
            </h2>
          </div>
          <p>
            Use a ampliação para conferir o estudo em maior resolução. No
            celular, os dados principais permanecem disponíveis em texto para
            facilitar a leitura.
          </p>
        </header>
        <PortfolioViewer
          src={sobrado.imagemCompleta}
          alt={`Apresentação completa do ${sobrado.nome}, com fachada, plantas e dados do projeto`}
        />
        <p className="portfolio-source">
          Fonte da referência: {sobrado.referencia}.
        </p>
      </section>
      <section className="adaptation">
        <div>
          <p className="section-tag">Do modelo ao seu terreno</p>
          <h2>Solicite uma análise personalizada.</h2>
          <p>
            Esta apresentação é um ponto de partida. A implantação, as dimensões
            e as soluções precisam ser verificadas conforme o lote, a legislação
            local e as necessidades da sua família.
          </p>
        </div>
        <a
          className="button light"
          data-project-id={sobrado.codigo}
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
        >
          Solicitar orçamento para meu terreno <span>↗</span>
        </a>
      </section>
      <section className="related" aria-labelledby="related-title">
        <header>
          <p className="section-tag">Outras referências</p>
          <h2 id="related-title">Continue explorando.</h2>
        </header>
        <div className="sobrado-grid">
          {relacionados.map((item) => (
            <SobradoCard key={item.id} sobrado={item} />
          ))}
        </div>
        <a className="text-link dark-link" href="/biblioteca-html/projetos/rubens-arquitetura/sobrados">
          Ver todos os sobrados <span>→</span>
        </a>
      </section>
      <a
        className="mobile-project-cta"
        data-project-id={sobrado.codigo}
        href={whatsapp}
        target="_blank"
        rel="noopener noreferrer"
      >
        Orçar este projeto <span>↗</span>
      </a>
      <SiteFooter />
    </main>
  );
}

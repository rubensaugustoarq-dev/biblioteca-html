import type { Metadata } from "next";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { SobradoCard } from "../components/SobradoCard";
import { sobrados } from "../data/sobrados";

export const metadata: Metadata = {
  title: "Sobrados | Rubens Augusto Arquitetura",
  description:
    "Conheça modelos de sobrados e solicite uma análise para adaptar o projeto ao seu terreno em Rio Branco ou com atendimento online.",
  alternates: { canonical: "/biblioteca-html/projetos/rubens-arquitetura/sobrados" },
  openGraph: {
    title: "Sobrados | Rubens Augusto Arquitetura",
    description:
      "Modelos residenciais para conhecer, comparar e adaptar ao seu terreno.",
    url: "/biblioteca-html/projetos/rubens-arquitetura/sobrados",
    images: [
      {
        url: "/biblioteca-html/projetos/rubens-arquitetura/sobrados/sobrado-011-fachada.webp",
        width: 1200,
        height: 660,
        alt: "Catálogo de sobrados Rubens Augusto",
      },
    ],
  },
};

export default function SobradosPage() {
  return (
    <main className="catalog-shell">
      <SiteHeader active="sobrados" />
      <section className="catalog-hero">
        <div>
          <p className="section-tag">Catálogo de sobrados</p>
          <h1>Encontre um sobrado para o seu terreno e estilo de vida.</h1>
          <p>
            Conheça modelos residenciais com fachadas contemporâneas, plantas
            organizadas e soluções que podem ser analisadas e adaptadas às
            características do seu terreno.
          </p>
          <a className="button" href="#catalogo">
            Explorar os modelos <span>↓</span>
          </a>
        </div>
        <figure>
          <img
            src="/biblioteca-html/projetos/rubens-arquitetura/sobrados/sobrado-011-fachada.webp"
            alt="Fachada contemporânea do Sobrado 011"
            width="1200"
            height="660"
          />
          <figcaption>
            Escolha um modelo para conhecer os detalhes e solicitar uma análise
            personalizada.
          </figcaption>
        </figure>
      </section>
      <section
        className="catalog-grid-section"
        id="catalogo"
        aria-labelledby="catalog-title"
      >
        <header>
          <div>
            <p className="section-tag">11 modelos disponíveis</p>
            <h2 id="catalog-title">
              Modelos para diferentes terrenos e necessidades.
            </h2>
          </div>
          <p>
            Compare área, terreno de referência e programa. Na página de cada
            modelo, você pode analisar a apresentação completa e solicitar um
            orçamento pelo WhatsApp.
          </p>
        </header>
        <div className="sobrado-grid">
          {sobrados.map((sobrado) => (
            <SobradoCard key={sobrado.id} sobrado={sobrado} />
          ))}
        </div>
        <aside className="catalog-note">
          <strong>Referências para uma análise personalizada.</strong>
          <p>
            As imagens e plantas apresentam uma referência inicial. A
            implantação e o desenvolvimento do projeto dependem da análise do
            terreno, legislação local, necessidades do cliente e contratação dos
            serviços técnicos correspondentes.
          </p>
        </aside>
      </section>
      <section className="catalog-cta">
        <div>
          <p className="section-tag">Atendimento personalizado</p>
          <h2>Não encontrou o modelo ideal?</h2>
          <p>
            Conte sobre seu terreno e suas necessidades para avaliarmos um
            projeto adequado à sua realidade.
          </p>
        </div>
        <a className="button light" href="/biblioteca-html/projetos/rubens-arquitetura/#contato">
          Conte sobre seu projeto <span>↗</span>
        </a>
      </section>
      <SiteFooter />
    </main>
  );
}

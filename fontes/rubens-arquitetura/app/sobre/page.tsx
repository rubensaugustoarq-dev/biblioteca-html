"use client";

import { useEffect, useState } from "react";

const expertise = [
  { icon: "AR", title: "Arquitetura Residencial" },
  { icon: "AC", title: "Arquitetura Comercial" },
  { icon: "AI", title: "Arquitetura Institucional" },
  { icon: "DI", title: "Design de Interiores" },
  { icon: "CB", title: "Coordenação BIM" },
  { icon: "CP", title: "Compatibilização de Projetos" },
  { icon: "MB", title: "Modelagem BIM" },
  { icon: "3D", title: "Visualização Arquitetônica 3D" },
  { icon: "PD", title: "Professor e Docente" },
  { icon: "CC", title: "Capacitação em Construção Civil" },
];

export default function Sobre() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  return (
    <main className="about-page-shell">
      <header className="header">
        <a
          className="brand brand-logo"
          href="/biblioteca-html/projetos/rubens-arquitetura/"
          aria-label="Rubens Augusto, página inicial"
        >
          <img
            src="/biblioteca-html/projetos/rubens-arquitetura/brand/logo-rubens-white.png"
            alt="Rubens Augusto — Arquiteto e Urbanista"
          />
        </a>
        <nav
          id="primary-nav"
          className={menuOpen ? "open" : ""}
          aria-label="Navegação principal"
        >
          <a onClick={() => setMenuOpen(false)} href="/biblioteca-html/projetos/rubens-arquitetura/#inicio">
            Início
          </a>
          <a onClick={() => setMenuOpen(false)} href="/biblioteca-html/projetos/rubens-arquitetura/#servicos">
            Serviços
          </a>
          <a onClick={() => setMenuOpen(false)} href="/biblioteca-html/projetos/rubens-arquitetura/#projetos">
            Estudos
          </a>
          <a onClick={() => setMenuOpen(false)} href="/biblioteca-html/projetos/rubens-arquitetura/sobrados">
            Sobrados
          </a>
          <a onClick={() => setMenuOpen(false)} href="/biblioteca-html/projetos/rubens-arquitetura/#bim">
            BIM
          </a>
          <a onClick={() => setMenuOpen(false)} href="/biblioteca-html/projetos/rubens-arquitetura/#processo">
            Como funciona
          </a>
          <a
            className="active"
            onClick={() => setMenuOpen(false)}
            href="/biblioteca-html/projetos/rubens-arquitetura/sobre"
            aria-current="page"
          >
            Sobre
          </a>
          <a onClick={() => setMenuOpen(false)} href="/biblioteca-html/projetos/rubens-arquitetura/#faq">
            Dúvidas
          </a>
          <a onClick={() => setMenuOpen(false)} href="/biblioteca-html/projetos/rubens-arquitetura/#contato">
            Contato
          </a>
        </nav>
        <div className="header-actions">
          <a className="contact-link" href="/biblioteca-html/projetos/rubens-arquitetura/#contato">
            Solicitar orçamento
          </a>
          <button
            className={`menu-toggle ${menuOpen ? "open" : ""}`}
            type="button"
            aria-expanded={menuOpen}
            aria-controls="primary-nav"
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </header>
      {menuOpen && (
        <button
          className="menu-backdrop"
          aria-label="Fechar menu"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <section className="intro about about-page" aria-labelledby="about-title">
        <header className="about-header">
          <div>
            <p className="section-tag">Rubens Augusto</p>
            <a className="about-back" href="/biblioteca-html/projetos/rubens-arquitetura/">
              ← Voltar ao início
            </a>
          </div>
          <h1 id="about-title">Sobre Mim</h1>
        </header>
        <div className="about-main">
          <figure className="about-photo">
            <img
              src="/biblioteca-html/projetos/rubens-arquitetura/rubens-augusto-sobre.webp"
              alt="Rubens Augusto em seu ambiente profissional de arquitetura"
              decoding="async"
              width="1200"
              height="1200"
            />
          </figure>
          <div className="about-copy">
            <p className="about-name">Rubens Augusto Rebelo Neto</p>
            <h2>
              Arquiteto e Urbanista <span>| Coordenador BIM</span>
            </h2>
            <div className="about-text">
              <p>
                Sou arquiteto e urbanista com atuação em projetos residenciais,
                comerciais e institucionais. Busco unir técnica, criatividade e
                tecnologia para desenvolver soluções funcionais, eficientes e
                alinhadas às necessidades de cada cliente.
              </p>
              <p>
                Com experiência em BIM e coordenação de projetos, acredito que
                um bom projeto vai além da estética: ele deve gerar qualidade,
                organização e valor para quem o utiliza.
              </p>
            </div>
          </div>
        </div>
        <div className="about-expertise">
          <h2>Áreas de Atuação</h2>
          <div className="expertise-grid" role="list">
            {expertise.map((item) => (
              <article key={item.title} role="listitem">
                <span aria-hidden="true">{item.icon}</span>
                <p>{item.title}</p>
              </article>
            ))}
          </div>
          <p className="about-training">
            <span aria-hidden="true">+</span> Capacitação em Autodesk Revit e
            metodologia BIM.
          </p>
        </div>
      </section>

      <section className="about-cta" aria-labelledby="about-cta-title">
        <div>
          <p className="section-tag">Vamos conversar</p>
          <h2 id="about-cta-title">Tem um projeto em mente?</h2>
          <p>
            Conte um pouco sobre suas necessidades e vamos avaliar os próximos
            passos.
          </p>
        </div>
        <a className="button light" href="/biblioteca-html/projetos/rubens-arquitetura/#contato">
          Conte sobre seu projeto <span>↗</span>
        </a>
      </section>

      <footer>
        <a
          className="brand brand-logo footer-logo"
          href="/biblioteca-html/projetos/rubens-arquitetura/"
          aria-label="Rubens Augusto, página inicial"
        >
          <img
            src="/biblioteca-html/projetos/rubens-arquitetura/brand/logo-rubens-white.png"
            alt="Rubens Augusto — Arquiteto e Urbanista"
          />
        </a>
        <p>© 2026 Rubens Augusto. Todos os direitos reservados.</p>
        <a href="/biblioteca-html/projetos/rubens-arquitetura/">Voltar ao início ↑</a>
      </footer>
    </main>
  );
}

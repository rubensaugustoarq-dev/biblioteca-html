"use client";

import { useEffect, useState } from "react";

export function SiteHeader({ active }: { active?: "sobrados" | "sobre" }) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  useEffect(() => {
    const close = (event: KeyboardEvent) =>
      event.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  const item = (href: string, label: string, current?: boolean) => (
    <a
      className={current ? "active" : undefined}
      aria-current={current ? "page" : undefined}
      onClick={() => setMenuOpen(false)}
      href={href}
    >
      {label}
    </a>
  );

  return (
    <>
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
          {item("/biblioteca-html/projetos/rubens-arquitetura/#inicio", "Início")}
          {item("/biblioteca-html/projetos/rubens-arquitetura/#servicos", "Serviços")}
          {item("/biblioteca-html/projetos/rubens-arquitetura/#projetos", "Estudos")}
          {item("/biblioteca-html/projetos/rubens-arquitetura/sobrados", "Sobrados", active === "sobrados")}
          {item("/biblioteca-html/projetos/rubens-arquitetura/#bim", "BIM")}
          {item("/biblioteca-html/projetos/rubens-arquitetura/#processo", "Como funciona")}
          {item("/biblioteca-html/projetos/rubens-arquitetura/sobre", "Sobre", active === "sobre")}
          {item("/biblioteca-html/projetos/rubens-arquitetura/#faq", "Dúvidas")}
          {item("/biblioteca-html/projetos/rubens-arquitetura/#contato", "Contato")}
        </nav>
        <div className="header-actions">
          <a className="contact-link" href="/biblioteca-html/projetos/rubens-arquitetura/#contato">
            <span className="contact-label">Solicitar orçamento</span>
            <span className="contact-short">Orçamento</span>
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
    </>
  );
}

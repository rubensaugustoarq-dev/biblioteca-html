"use client";

import { useEffect, useState } from "react";
import { SobradoCard } from "./components/SobradoCard";
import { whatsappUrl } from "./data/contact";
import { featuredSobrados } from "./data/sobrados";

const services = [
  {
    number: "01",
    title: "Habitação popular",
    text: "Projetos eficientes, econômicos e humanizados para moradias individuais e conjuntos habitacionais.",
  },
  {
    number: "02",
    title: "Casas modernas",
    text: "Residências contemporâneas que equilibram conforto, identidade, funcionalidade e viabilidade construtiva.",
  },
  {
    number: "03",
    title: "Ambientes comerciais",
    text: "Lojas, escritórios e espaços de atendimento projetados para valorizar a marca e a experiência do cliente.",
  },
  {
    number: "04",
    title: "Interiores e BIM",
    text: "Detalhamento de interiores, modelagem e documentação integrada para reduzir dúvidas e imprevistos na execução.",
  },
];

const projects = [
  {
    type: "Planta humanizada demonstrativa",
    title: "Moradia compacta de 2 quartos",
    text: "Estudo conceitual que demonstra organização eficiente dos ambientes, mobiliário em escala e leitura clara da circulação antes da obra.",
    image: "/biblioteca-html/projetos/rubens-arquitetura/tecnico-planta-popular.webp",
  },
  {
    type: "Visualização BIM demonstrativa",
    title: "Casa moderna vista por dentro",
    text: "Modelo demonstrativo em vista superior que revela a relação entre ambientes, materiais e acessos da residência.",
    image: "/biblioteca-html/projetos/rubens-arquitetura/tecnico-3d-casa-moderna.webp",
  },
  {
    type: "Estudo de layout comercial",
    title: "Ambiente comercial organizado",
    text: "Estudo conceitual de recepção, atendimento e áreas de apoio para demonstrar fluxos, produtividade e experiência dos clientes.",
    image: "/biblioteca-html/projetos/rubens-arquitetura/tecnico-planta-comercial.webp",
  },
  {
    type: "Modelo 3D comercial demonstrativo",
    title: "Espaço comercial em visão integrada",
    text: "Visualização demonstrativa para conferir mobiliário, iluminação, materiais e circulação antes de iniciar compras ou execução.",
    image: "/biblioteca-html/projetos/rubens-arquitetura/tecnico-3d-comercial.webp",
  },
];

const heroImages = [
  "/biblioteca-html/projetos/rubens-arquitetura/hero-rubens.webp",
  "/biblioteca-html/projetos/rubens-arquitetura/hero-habitacao-popular.webp",
  "/biblioteca-html/projetos/rubens-arquitetura/hero-comercial.webp",
];
const faqs = [
  {
    question: "Quanto custa um projeto de arquitetura?",
    answer:
      "O investimento varia conforme o tipo, a área, o nível de detalhamento e o escopo contratado. O diagnóstico inicial reúne essas informações para preparar uma proposta adequada ao seu projeto.",
  },
  {
    question: "Vocês atendem fora de Rio Branco?",
    answer:
      "Sim. O atendimento pode ser realizado a distância, com reuniões online e entregas digitais. As exigências locais são avaliadas conforme o município e o escopo contratado.",
  },
  {
    question: "O que está incluído em um projeto completo?",
    answer:
      "Conforme a proposta, o projeto pode incluir estudo inicial, desenvolvimento, plantas cotadas, detalhes, modelo 3D, especificações de materiais e documentação de apoio à execução.",
  },
  {
    question: "Posso contratar apenas interiores ou modelagem BIM?",
    answer:
      "Sim. Os serviços são modulares e podem ser contratados conforme a necessidade, incluindo interiores, revisão de layout, visualização 3D ou desenvolvimento em BIM.",
  },
  {
    question: "Em quanto tempo recebo a proposta?",
    answer:
      "Depois do envio das informações iniciais, o retorno acontece normalmente em até 1 dia útil para alinhar necessidades e preparar os próximos passos.",
  },
  {
    question: "Como funciona o pagamento?",
    answer:
      "As condições são apresentadas na proposta e organizadas por etapas do projeto, de acordo com o escopo, os prazos e as entregas definidos.",
  },
];
const quizSteps = [
  {
    key: "tipo",
    title: "Qual projeto você precisa?",
    options: [
      "Habitação popular",
      "Casa moderna",
      "Ambiente comercial",
      "Interiores",
      "Modelagem BIM",
    ],
  },
  {
    key: "etapa",
    title: "Em que etapa você está?",
    options: [
      "Tenho apenas a ideia",
      "Já tenho terreno ou imóvel",
      "Tenho planta e quero melhorar",
      "Preciso regularizar ou documentar",
      "Projeto em andamento",
    ],
  },
  {
    key: "area",
    title: "Qual a área aproximada?",
    options: [
      "Até 60 m²",
      "61 a 100 m²",
      "101 a 200 m²",
      "Acima de 200 m²",
      "Ainda não sei",
    ],
  },
  {
    key: "prazo",
    title: "Quando deseja começar?",
    options: [
      "O quanto antes",
      "Em até 3 meses",
      "De 3 a 6 meses",
      "Mais de 6 meses",
      "Estou pesquisando",
    ],
  },
];

export default function Home() {
  const [slide, setSlide] = useState(0);
  const [quizOpen, setQuizOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [contact, setContact] = useState({ nome: "", cidade: "" });

  useEffect(() => {
    const timer = window.setInterval(
      () => setSlide((value) => (value + 1) % heroImages.length),
      6500,
    );
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    document.body.style.overflow = quizOpen || menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [quizOpen, menuOpen]);
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setQuizOpen(false);
        setMenuOpen(false);
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  function selectAnswer(key: string, value: string) {
    setAnswers((current) => ({ ...current, [key]: value }));
    if (step < quizSteps.length - 1) setStep(step + 1);
    else setStep(quizSteps.length);
  }
  function openQuiz() {
    setQuizOpen(true);
    setMenuOpen(false);
    setStep(0);
  }
  function sendWhatsApp() {
    const message = `Olá, Rubens Augusto! Fiz o diagnóstico pelo seu site e gostaria de solicitar um orçamento.\n\nNome: ${contact.nome || "Não informado"}\nCidade: ${contact.cidade || "Não informada"}\nTipo de projeto: ${answers.tipo}\nEtapa atual: ${answers.etapa}\nÁrea aproximada: ${answers.area}\nPrazo: ${answers.prazo}\n\nPodemos conversar sobre o projeto?`;
    window.open(whatsappUrl(message), "_blank", "noopener,noreferrer");
  }

  return (
    <main>
      <header className="header">
        <a
          className="brand brand-logo"
          href="#inicio"
          aria-label="Rubens Augusto, início"
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
          <a onClick={() => setMenuOpen(false)} href="#inicio">
            Início
          </a>
          <a onClick={() => setMenuOpen(false)} href="#servicos">
            Serviços
          </a>
          <a onClick={() => setMenuOpen(false)} href="#projetos">
            Estudos
          </a>
          <a onClick={() => setMenuOpen(false)} href="/biblioteca-html/projetos/rubens-arquitetura/sobrados">
            Sobrados
          </a>
          <a onClick={() => setMenuOpen(false)} href="#bim">
            BIM
          </a>
          <a onClick={() => setMenuOpen(false)} href="#processo">
            Como funciona
          </a>
          <a onClick={() => setMenuOpen(false)} href="/biblioteca-html/projetos/rubens-arquitetura/sobre">
            Sobre
          </a>
          <a onClick={() => setMenuOpen(false)} href="#faq">
            Dúvidas
          </a>
          <a onClick={() => setMenuOpen(false)} href="#contato">
            Contato
          </a>
        </nav>
        <div className="header-actions">
          <button className="contact-link" onClick={openQuiz}>
            <span className="contact-label">Solicitar orçamento</span>
            <span className="contact-short">Orçamento</span>
          </button>
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

      <section className="hero" id="inicio">
        <div className="hero-carousel" aria-hidden="true">
          {heroImages.map((image, index) => (
            <div
              key={image}
              className={`hero-image ${slide === index ? "active" : ""}`}
              style={{
                backgroundImage: `linear-gradient(90deg,#101713 0%,rgba(16,23,19,.96) 28%,rgba(16,23,19,.52) 58%,rgba(16,23,19,.2)),linear-gradient(0deg,rgba(12,18,15,.86),transparent 42%),url('${image}')`,
              }}
            />
          ))}
        </div>
        <div className="technical-lines" aria-hidden="true">
          <span />
          <span />
          <span />
          <i>+7.20</i>
          <i>+3.60</i>
        </div>
        <div className="hero-copy">
          <p className="eyebrow">
            Habitação <b>•</b> Casas modernas <b>•</b> Comercial
          </p>
          <h1>Projetos que transformam ideias em espaços.</h1>
          <p className="lead">
            Arquitetura e urbanismo em Rio Branco/AC. Projetos residenciais e
            comerciais com precisão técnica, estética e soluções viáveis.
          </p>
          <div className="hero-actions">
            <button className="button" onClick={openQuiz}>
              Conte sobre seu projeto <span>↗</span>
            </button>
            <a className="text-link" href="#projetos">
              Ver estudos e projetos <span>→</span>
            </a>
          </div>
          <div className="hero-meta">
            <div>
              <small>Localização</small>
              <strong>Rio Branco, AC</strong>
            </div>
            <div>
              <small>Atendimento</small>
              <strong>Presencial e online</strong>
            </div>
            <div>
              <small>Especialidade</small>
              <strong>Arquitetura + BIM</strong>
            </div>
          </div>
        </div>
        <div
          className="carousel-controls"
          aria-label="Selecionar imagem principal"
        >
          {heroImages.map((_, index) => (
            <button
              key={index}
              className={slide === index ? "active" : ""}
              onClick={() => setSlide(index)}
              aria-label={`Imagem ${index + 1}`}
            />
          ))}
        </div>
      </section>

      <section className="services" id="servicos">
        <div className="section-heading">
          <p className="section-tag">01 — Serviços</p>
          <h2>
            Soluções para morar,
            <br />
            construir e empreender.
          </h2>
        </div>
        <div className="service-grid">
          {services.map((item) => (
            <article key={item.number}>
              <span>{item.number}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <button onClick={openQuiz}>Solicitar orçamento →</button>
            </article>
          ))}
        </div>
      </section>

      <section className="process" id="processo">
        <div className="section-heading">
          <p className="section-tag">02 — Como funciona</p>
          <h2>
            Um processo simples
            <br />e transparente.
          </h2>
        </div>
        <div className="process-grid">
          <article>
            <b>01</b>
            <h3>Diagnóstico</h3>
            <p>
              Você responde algumas perguntas sobre suas necessidades,
              localização e momento do projeto.
            </p>
          </article>
          <article>
            <b>02</b>
            <h3>Proposta</h3>
            <p>
              Alinhamos escopo, etapas, entregas, prazos e investimento de forma
              objetiva.
            </p>
          </article>
          <article>
            <b>03</b>
            <h3>Desenvolvimento</h3>
            <p>
              O projeto evolui com apresentações claras, revisões planejadas e
              acompanhamento próximo.
            </p>
          </article>
          <article>
            <b>04</b>
            <h3>Entrega</h3>
            <p>
              Você recebe o material organizado para aprovação, orçamento e
              execução da obra.
            </p>
          </article>
        </div>
        <button className="button" onClick={openQuiz}>
          Começar diagnóstico <span>↗</span>
        </button>
      </section>

      <section className="projects technical-projects" id="projetos">
        <div className="section-heading">
          <p className="section-tag">03 — Projetos técnicos</p>
          <h2>
            Espaços pensados
            <br />
            para a vida real.
          </h2>
        </div>
        <p className="projects-intro">
          Plantas humanizadas e modelos 3D ortogonais transformam informações
          técnicas em imagens fáceis de entender. Você visualiza o espaço,
          confere escolhas e toma decisões com mais segurança.
        </p>
        <div className="technical-list">
          {projects.map((project, index) => (
            <article key={project.title} className={index % 2 ? "reverse" : ""}>
              <div className="technical-image">
                <img
                  src={project.image}
                  alt={project.title}
                  loading="lazy"
                  decoding="async"
                />
                <span>0{index + 1}</span>
              </div>
              <div className="technical-copy">
                <p>{project.type}</p>
                <h3>{project.title}</h3>
                <p>{project.text}</p>
                <button onClick={openQuiz}>Quero um projeto assim →</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section
        className="featured-houses"
        aria-labelledby="featured-houses-title"
      >
        <div className="section-heading">
          <p className="section-tag">04 — Sobrados em destaque</p>
          <h2 id="featured-houses-title">
            Modelos para inspirar
            <br />o seu próximo projeto.
          </h2>
        </div>
        <div className="featured-houses-intro">
          <p>
            Conheça referências de sobrados e solicite uma análise para adaptar
            o modelo escolhido ao seu terreno e às necessidades da sua família.
          </p>
          <a className="text-link dark-link" href="/biblioteca-html/projetos/rubens-arquitetura/sobrados">
            Ver todos os sobrados <span>→</span>
          </a>
        </div>
        <div className="sobrado-grid featured-sobrado-grid">
          {featuredSobrados.map((sobrado, index) => (
            <SobradoCard
              key={sobrado.id}
              sobrado={sobrado}
              priority={index === 0}
            />
          ))}
        </div>
        <a className="button featured-all-button" href="/biblioteca-html/projetos/rubens-arquitetura/sobrados">
          Ver todos os sobrados <span>→</span>
        </a>
      </section>

      <section className="bim" id="bim">
        <div className="bim-visual bim-document">
          <img
            src="/biblioteca-html/projetos/rubens-arquitetura/tecnico-3d-casa-moderna.webp"
            alt="Modelo BIM demonstrativo em vista superior"
            loading="lazy"
            decoding="async"
          />
          <div className="bim-data">
            <span>01 · Modelo 3D</span>
            <span>02 · Planta cotada</span>
            <span>03 · Materiais</span>
            <span>04 · Documentação</span>
          </div>
          <small>MODELO · COTAS · MATERIAIS · DOCUMENTAÇÃO</small>
        </div>
        <div className="bim-copy">
          <p className="section-tag">05 — Projeto completo em BIM</p>
          <h2>
            Seu projeto pronto
            <br />
            para construir.
          </h2>
          <p>
            Não basta receber apenas uma planta bonita. O projeto pode ser
            entregue totalmente cotado, detalhado e organizado, com
            especificações de materiais e informações que orientam orçamento,
            compras e execução. Assim, você perde menos tempo com dúvidas e
            reduz decisões improvisadas durante a obra.
          </p>
          <div className="bim-highlight">
            <strong>Mais informação antes da obra.</strong>
            <span>Mais controle de custos e menos retrabalho na execução.</span>
          </div>
          <ul>
            <li>Plantas totalmente cotadas</li>
            <li>Indicação de revestimentos e materiais</li>
            <li>Portas, janelas, louças e equipamentos identificados</li>
            <li>Detalhes construtivos e quantitativos de apoio</li>
            <li>Modelo 3D para visualizar antes de executar</li>
          </ul>
          <button className="button" onClick={openQuiz}>
            Solicitar projeto completo <span>↗</span>
          </button>
        </div>
      </section>

      <section className="faq" id="faq">
        <div className="faq-heading">
          <p className="section-tag">06 — Dúvidas frequentes</p>
          <h2>
            Antes de começar,
            <br />
            vale saber.
          </h2>
          <p>
            Respostas diretas para as perguntas mais comuns sobre atendimento,
            entregas e contratação.
          </p>
        </div>
        <div className="faq-list">
          {faqs.map((item) => (
            <details key={item.question}>
              <summary>
                {item.question}
                <span aria-hidden="true">+</span>
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="contact" id="contato">
        <p className="section-tag">07 — Contato</p>
        <h2>Vamos conversar sobre seu projeto?</h2>
        <p>
          Responda algumas perguntas e envie as informações iniciais diretamente
          pelo WhatsApp. Retorno normalmente em até 1 dia útil.
        </p>
        <div className="contact-actions">
          <button className="button light" onClick={openQuiz}>
            Iniciar diagnóstico <span>↗</span>
          </button>
          <a
            className="button outline-light"
            href={whatsappUrl()}
            target="_blank"
            rel="noopener noreferrer"
          >
            Falar pelo WhatsApp <span>→</span>
          </a>
        </div>
        <div className="contact-details">
          <a href="mailto:rubensaugusto.arq@gmail.com">
            rubensaugusto.arq@gmail.com
          </a>
          <span>Rio Branco · Acre</span>
          <span>Atendimento presencial e online</span>
        </div>
      </section>
      <footer>
        <a
          className="brand brand-logo footer-logo"
          href="#inicio"
          aria-label="Rubens Augusto, voltar ao início"
        >
          <img
            src="/biblioteca-html/projetos/rubens-arquitetura/brand/logo-rubens-white.png"
            alt="Rubens Augusto — Arquiteto e Urbanista"
          />
        </a>
        <p>© 2026 Rubens Augusto. Todos os direitos reservados.</p>
        <a href="#inicio">Voltar ao topo ↑</a>
      </footer>

      {quizOpen && (
        <div
          className="quiz-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="quiz-title"
        >
          <div className="quiz-modal">
            <button
              className="quiz-close"
              onClick={() => setQuizOpen(false)}
              aria-label="Fechar orçamento"
            >
              ×
            </button>
            <div className="quiz-progress">
              <span
                style={{
                  width: `${((step + 1) / (quizSteps.length + 1)) * 100}%`,
                }}
              />
            </div>
            {step < quizSteps.length ? (
              <>
                <p className="quiz-kicker">
                  Orçamento personalizado · {step + 1} de {quizSteps.length}
                </p>
                <h2 id="quiz-title">{quizSteps[step].title}</h2>
                <div className="quiz-options">
                  {quizSteps[step].options.map((option) => (
                    <button
                      key={option}
                      onClick={() => selectAnswer(quizSteps[step].key, option)}
                    >
                      {option}
                      <span>→</span>
                    </button>
                  ))}
                </div>
                {step > 0 && (
                  <button
                    className="quiz-back"
                    onClick={() => setStep(step - 1)}
                  >
                    ← Voltar
                  </button>
                )}
              </>
            ) : (
              <>
                <p className="quiz-kicker">Último passo</p>
                <h2 id="quiz-title">
                  Para quem devemos preparar o atendimento?
                </h2>
                <div className="quiz-fields">
                  <label>
                    Seu nome
                    <input
                      value={contact.nome}
                      onChange={(e) =>
                        setContact({ ...contact, nome: e.target.value })
                      }
                      placeholder="Como podemos chamar você?"
                    />
                  </label>
                  <label>
                    Cidade do projeto
                    <input
                      value={contact.cidade}
                      onChange={(e) =>
                        setContact({ ...contact, cidade: e.target.value })
                      }
                      placeholder="Ex.: Rio Branco, AC"
                    />
                  </label>
                </div>
                <p className="privacy-note">
                  Ao continuar, o WhatsApp abrirá com suas respostas
                  preenchidas. Você poderá revisar a mensagem antes de enviá-la.
                </p>
                <button className="button quiz-send" onClick={sendWhatsApp}>
                  Enviar pelo WhatsApp <span>↗</span>
                </button>
                <button
                  className="quiz-back"
                  onClick={() => setStep(quizSteps.length - 1)}
                >
                  ← Voltar
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

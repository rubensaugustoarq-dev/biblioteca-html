export type Sobrado = {
  id: number;
  slug: string;
  codigo: string;
  nome: string;
  titulo: string;
  descricao: string;
  imagemMiniatura: string;
  imagemCompleta: string;
  areaConstruida: string;
  dimensoesTerreno: string;
  quartos: number;
  suites: number;
  banheiros: number;
  vagas: number;
  pavimentos: number;
  caracteristicas: string[];
  badge: "Modelo de referência" | "Exclusivo Idealiza 3D";
  referencia: string;
  mensagemWhatsApp?: string;
  featured?: boolean;
};

const image = (code: string, kind: "fachada" | "portfolio") =>
  `/biblioteca-html/projetos/rubens-arquitetura/sobrados/sobrado-${code}-${kind}.webp`;

export const sobrados: Sobrado[] = [
  {
    id: 1,
    slug: "001",
    codigo: "001",
    nome: "Sobrado 001",
    titulo: "Residência contemporânea com lazer completo",
    descricao:
      "Modelo amplo com ambientes sociais integrados, suíte master e área de lazer com piscina e sauna.",
    imagemMiniatura: image("001", "fachada"),
    imagemCompleta: image("001", "portfolio"),
    areaConstruida: "255,59 m²",
    dimensoesTerreno: "10 × 30 m",
    quartos: 3,
    suites: 1,
    banheiros: 3,
    vagas: 2,
    pavimentos: 2,
    caracteristicas: [
      "Suíte master com closet",
      "Sala de TV",
      "Área gourmet",
      "Piscina e sauna",
      "Lavanderia e casa de máquinas",
    ],
    badge: "Modelo de referência",
    referencia: "iProjetei · Projeto 91",
    featured: true,
  },
  {
    id: 2,
    slug: "002",
    codigo: "002",
    nome: "Sobrado 002",
    titulo: "Solução compacta para terreno de 5 metros",
    descricao:
      "Referência residencial estreita e funcional, com três dormitórios, integração social e garagem para dois veículos.",
    imagemMiniatura: image("002", "fachada"),
    imagemCompleta: image("002", "portfolio"),
    areaConstruida: "124,93 m²",
    dimensoesTerreno: "5 × 20 m",
    quartos: 3,
    suites: 1,
    banheiros: 3,
    vagas: 2,
    pavimentos: 2,
    caracteristicas: [
      "Suíte com closet",
      "Sala de TV, jantar e cozinha integradas",
      "Área gourmet",
      "Lavanderia",
      "Sacada",
    ],
    badge: "Modelo de referência",
    referencia: "iProjetei · Projeto 81",
  },
  {
    id: 3,
    slug: "003",
    codigo: "003",
    nome: "Sobrado 003",
    titulo: "Quatro dormitórios e área de lazer",
    descricao:
      "Modelo familiar com três suítes no pavimento superior e área gourmet integrada à piscina com spa.",
    imagemMiniatura: image("003", "fachada"),
    imagemCompleta: image("003", "portfolio"),
    areaConstruida: "204,80 m²",
    dimensoesTerreno: "10 × 20 m",
    quartos: 4,
    suites: 3,
    banheiros: 4,
    vagas: 2,
    pavimentos: 2,
    caracteristicas: [
      "Três suítes no pavimento superior",
      "Suíte master com closet e sacada",
      "Área gourmet",
      "Piscina com spa",
      "Lavanderia e despensa",
    ],
    badge: "Modelo de referência",
    referencia: "iProjetei · Projeto 52",
  },
  {
    id: 4,
    slug: "004",
    codigo: "004",
    nome: "Sobrado 004",
    titulo: "Ambientes amplos e três sacadas",
    descricao:
      "Referência contemporânea com duas salas de TV, suíte master e lazer com área gourmet e ofurô.",
    imagemMiniatura: image("004", "fachada"),
    imagemCompleta: image("004", "portfolio"),
    areaConstruida: "208,16 m²",
    dimensoesTerreno: "10 × 20 m",
    quartos: 3,
    suites: 1,
    banheiros: 3,
    vagas: 2,
    pavimentos: 2,
    caracteristicas: [
      "Suíte master com closet",
      "Duas salas de TV",
      "Três sacadas",
      "Área gourmet e ofurô",
      "Despensa e depósito",
    ],
    badge: "Modelo de referência",
    referencia: "iProjetei · Projeto 50",
  },
  {
    id: 5,
    slug: "005",
    codigo: "005",
    nome: "Sobrado 005",
    titulo: "Fachada marcante e lazer integrado",
    descricao:
      "Modelo com suíte master, hall íntimo e área externa organizada com piscina, deck e espaço gourmet.",
    imagemMiniatura: image("005", "fachada"),
    imagemCompleta: image("005", "portfolio"),
    areaConstruida: "179,51 m²",
    dimensoesTerreno: "8 × 20 m",
    quartos: 3,
    suites: 1,
    banheiros: 3,
    vagas: 2,
    pavimentos: 2,
    caracteristicas: [
      "Suíte master com closet",
      "Duas sacadas",
      "Hall íntimo",
      "Área gourmet",
      "Piscina e deck",
    ],
    badge: "Modelo de referência",
    referencia: "iProjetei · Projeto 46",
  },
  {
    id: 6,
    slug: "006",
    codigo: "006",
    nome: "Sobrado 006",
    titulo: "Dois dormitórios no pavimento térreo",
    descricao:
      "Solução que concentra dois dormitórios no térreo e reserva o pavimento superior para a suíte master.",
    imagemMiniatura: image("006", "fachada"),
    imagemCompleta: image("006", "portfolio"),
    areaConstruida: "157,18 m²",
    dimensoesTerreno: "10 × 20 m",
    quartos: 3,
    suites: 1,
    banheiros: 2,
    vagas: 2,
    pavimentos: 2,
    caracteristicas: [
      "Dois dormitórios no térreo",
      "Suíte master com closet",
      "Estar, jantar e cozinha integrados",
      "Área gourmet",
      "Lavanderia",
    ],
    badge: "Modelo de referência",
    referencia: "iProjetei · Projeto 40",
  },
  {
    id: 7,
    slug: "007",
    codigo: "007",
    nome: "Sobrado 007",
    titulo: "Quatro dormitórios em composição elegante",
    descricao:
      "Referência familiar com dormitório térreo, suíte master, piscina e ambientes sociais integrados.",
    imagemMiniatura: image("007", "fachada"),
    imagemCompleta: image("007", "portfolio"),
    areaConstruida: "208,09 m²",
    dimensoesTerreno: "10 × 25 m",
    quartos: 4,
    suites: 1,
    banheiros: 4,
    vagas: 2,
    pavimentos: 2,
    caracteristicas: [
      "Um dormitório no térreo",
      "Suíte master com closet",
      "Estar, jantar e cozinha integrados",
      "Área gourmet",
      "Piscina e sacada",
    ],
    badge: "Modelo de referência",
    referencia: "iProjetei · Projeto 38",
    featured: true,
  },
  {
    id: 8,
    slug: "008",
    codigo: "008",
    nome: "Sobrado 008",
    titulo: "Projeto compacto com escritório",
    descricao:
      "Modelo para lote de sete metros com escritório, área de luz, suíte master e lazer completo.",
    imagemMiniatura: image("008", "fachada"),
    imagemCompleta: image("008", "portfolio"),
    areaConstruida: "202,23 m²",
    dimensoesTerreno: "7 × 25 m",
    quartos: 3,
    suites: 1,
    banheiros: 4,
    vagas: 2,
    pavimentos: 2,
    caracteristicas: [
      "Suíte master com closet",
      "Escritório",
      "Depósito e área de luz",
      "Área gourmet",
      "Piscina e sacada",
    ],
    badge: "Modelo de referência",
    referencia: "iProjetei · Projeto 34",
  },
  {
    id: 9,
    slug: "009",
    codigo: "009",
    nome: "Sobrado 009",
    titulo: "Integração social e sacada frontal",
    descricao:
      "Referência contemporânea com três dormitórios, ambientes integrados e área gourmet conectada à lavanderia.",
    imagemMiniatura: image("009", "fachada"),
    imagemCompleta: image("009", "portfolio"),
    areaConstruida: "195,88 m²",
    dimensoesTerreno: "10 × 20 m",
    quartos: 3,
    suites: 1,
    banheiros: 3,
    vagas: 2,
    pavimentos: 2,
    caracteristicas: [
      "Suíte master com closet",
      "Estar, jantar e cozinha integrados",
      "Área gourmet",
      "Lavanderia",
      "Sacada frontal e hall de entrada",
    ],
    badge: "Modelo de referência",
    referencia: "iProjetei · Projeto 22",
  },
  {
    id: 10,
    slug: "010",
    codigo: "010",
    nome: "Sobrado 010",
    titulo: "Residência com escritório e área gourmet",
    descricao:
      "Modelo completo com escritório, despensa, suíte master e integração entre os ambientes sociais.",
    imagemMiniatura: image("010", "fachada"),
    imagemCompleta: image("010", "portfolio"),
    areaConstruida: "218,99 m²",
    dimensoesTerreno: "10 × 20 m",
    quartos: 3,
    suites: 1,
    banheiros: 3,
    vagas: 2,
    pavimentos: 2,
    caracteristicas: [
      "Suíte master com closet",
      "Escritório e despensa",
      "Hall de entrada",
      "Área gourmet",
      "Lavanderia e sacada",
    ],
    badge: "Modelo de referência",
    referencia: "iProjetei · Projeto 20",
  },
  {
    id: 11,
    slug: "011",
    codigo: "011",
    nome: "Sobrado 011",
    titulo: "Casa ID10 — exclusivo Idealiza 3D",
    descricao:
      "Projeto autoral com fachada moderna, três dormitórios, três sacadas e implantação pensada para lote de 216 m².",
    imagemMiniatura: image("011", "fachada"),
    imagemCompleta: image("011", "portfolio"),
    areaConstruida: "215,91 m²",
    dimensoesTerreno: "9,60 × 22,50 m",
    quartos: 3,
    suites: 1,
    banheiros: 3,
    vagas: 2,
    pavimentos: 2,
    caracteristicas: [
      "Suíte master com closet",
      "Estar e jantar integrados",
      "Área gourmet",
      "Lavanderia",
      "Três sacadas",
    ],
    badge: "Exclusivo Idealiza 3D",
    referencia: "Projeto autoral Idealiza 3D · Casa ID10",
    featured: true,
  },
];

export const featuredSobrados = sobrados.filter((sobrado) => sobrado.featured);

export function getSobrado(slug: string) {
  return sobrados.find((sobrado) => sobrado.slug === slug);
}

export function sobradoWhatsAppMessage(sobrado: Sobrado) {
  if (sobrado.mensagemWhatsApp) return sobrado.mensagemWhatsApp;
  return `Olá, Rubens! Vi o ${sobrado.nome} no seu site e gostaria de solicitar um orçamento para adaptar este projeto ao meu terreno.\n\nCidade:\nDimensões do terreno:\nFrente do lote:\nObservações:`;
}

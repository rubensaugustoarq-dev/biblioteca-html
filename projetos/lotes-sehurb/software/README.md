# Lotes SEHURB 1.0.0

Primeira versão integrada para uso local no Windows: Home com projetos salvos, Estudo, Estudo ENL, Infra / Urbano, Acessibilidade e Paisagismo.

## Começar

- Computador já preparado: abra **Iniciar Lotes SEHURB.cmd**.
- Primeira instalação: Python 3.12 (64 bits), Node.js 22 ou superior, depois **Preparar Lotes SEHURB.cmd** e **Iniciar Lotes SEHURB.cmd**.
- [Guia de instalação e preservação dos projetos](docs/INSTALACAO.md).

## Disponível

- Projetos locais em SQLite, CRS projetado em metros, ortofoto, glebas, textos, cotas, medição, histórico e Salvar como.
- ENL: edificações, áreas impermeáveis, índices, afastamentos e implantação alinhada pela frente; referências de Infra e loteamentos.
- Infra: vias e arcos, conexões, calçadas independentes, retornos, cul-de-sac, pavimentações, pontes de madeira e loteamento.
- Acessibilidade: rampas, pisos táteis, acessos de veículos, travessias e vagas de estacionamento.
- Paisagismo: árvores, palmeiras, água com contornos curvos, chalés e choupanas.
- DXF por camadas, hachuras e cotas nativas; PDF A3 com relatórios, legenda, carimbo opcional e prévias por folha.

As ferramentas atuais foram mantidas. Home permite buscar e ordenar os projetos, continuar o último trabalho e retornar ao painel com Início. O mapa principal continua montado ao abrir a Home.

## Funcionamento

Interface React/TypeScript/OpenLayers em `apps/web`; motor FastAPI/Shapely em `services/engine`. Dados do usuário não são publicados no GitHub. O software usa um servidor local; o GitHub Pages não substitui esse motor.

Representação e cálculos planimétricos. Parâmetros urbanísticos e verificações normativas permanecem sujeitos à avaliação do técnico. Perfis, dimensionamento estrutural de pontes/coberturas e simulação de manobras não integram esta versão.

Versão 1.0.0 de 02/11/2026. Estudos pessoais e arquivos de referência permanecem somente na instalação local.

# Módulo Infra / Urbano

- Leia docs/INFRA_URBANO.md antes de alterar o módulo.
- InfraWorkspace.tsx é a entrada; scene.ts coordena o mapa; types.ts contém contratos; infra.css usa prefixo infra.
- Não importar o módulo ENL. Editor/CadView são reutilizados para a base em modo de seleção; a trena básica pode ativar o modo measure do Editor local da Infra. Nunca acionar o Editor oculto do Estudo. As novas geometrias pertencem a Document.infra e a services/engine/infra/domain.py.
- Não alterar glebas de Estudo para desenhar vias. sourceGeometry guarda a cópia explícita da gleba de origem; alterações posteriores do perímetro não regeneram automaticamente as faixas.
- Somente o motor confirma áreas. Quantitativos globais usam união, com pista prioritária sobre calçadas. Nas interseções, o material do objeto criado primeiro prevalece, com ordem estável ao editar e sem dupla contagem. Arcos preservam os pontos de controle e usam derived.axisGeometry para visualização.
- Preservar IDs, CRS original, revisão, comandos reversíveis e salvar/reabrir/Salvar como.
- Prévia da seção é horizontal e dimensional; não anunciar corredor/assembly, perfis, terraplenagem ou norma municipal aplicada.
- F8 no desenho segue a direção do trecho anterior e não pode apagar o rascunho ao alternar. Edição dos pontos usa Modify; trava F8 não restringe o arraste de edição nesta etapa.

- Recorte opcional: permitir vias e áreas fora da gleba quando desligado. Preservar controles originais ao recortar. filletRadii controla raios por ponto; curveType threePoint conserva início/meio/fim, com derivação circular confirmada no motor.

- Terra usa material earth e papel unpaved. Representar a faixa, mas não incluí-la na área de pavimento/total de pavimentação. Não usar terra como material de calçada.

- Cul-de-sac é terminação da via, com três posições e raio persistido. Proibido em terra ou sem calçadas nos dois lados pela regra do usuário. Quantificar por união; raio final da boca fica suspenso enquanto ativo. Não afirmar aprovação normativa ou trajetória verificada.

- Loteamento: parâmetros e geometrias em subdivisionAreas[].layout; origem preservada. Por solicitação explícita de 17/10/2026, a opção greenRemainder permite destinar sobras à área verde na prévia. Só aplicar após escolha; preservar áreas manuais e lotes travados. Busca limitada não deve ser anunciada como máximo global ou validação legal de acesso.

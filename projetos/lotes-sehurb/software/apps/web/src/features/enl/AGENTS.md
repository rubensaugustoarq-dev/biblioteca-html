# Continuidade do módulo ENL

- Entrada de interface: EnlWorkspace.tsx. Contratos: types.ts. Transformação da implantação: coordinates.ts. Mapas: scene.ts. Aparência: enl.css.
- Leia docs/ESTUDO_ENL.md na raiz do projeto antes de mudar o módulo.
- Preserve a independência da aba Estudo. Dados ENL ficam em Document.enl e usam comandos enl.upsert/enl.delete.
- Geometrias persistidas são do CRS do projeto; nunca grave o desenho girado da implantação.
- Cálculos definitivos pertencem a services/engine/enl/domain.py. Permeabilidade usa dedução automática de edificações e pavimentação, por solicitação explícita do usuário. Preserve a união geométrica para evitar dupla contagem; área livre restante é uma hipótese do estudo que depende do cadastro completo de pavimentação.
- Não incorporar normas urbanísticas sem solicitação, fonte e jurisdição. Limites atuais são opcionais e definidos pelo técnico.

- Ferramentas auxiliares: MapTools.tsx / mapOverlays.ts. CAD: CadTools.tsx / cadReference.ts. Textos próprios do ENL ficam em lot.texts; reutilizar TextProperties para aparência sem misturar Document.annotations.

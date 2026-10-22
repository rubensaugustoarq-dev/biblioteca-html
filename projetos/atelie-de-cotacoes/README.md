# Ateliê de Cotações

Editor de cotações da Sala de Bem-Estar. HTML, CSS, JavaScript, dados iniciais e imagens separados; sem CDN ou dependências de servidor.

## Usar e salvar
- Abra o endereço do GitHub Pages ou sirva a pasta por HTTP (por exemplo `python -m http.server 8000`).
- O salvamento automático usa IndexedDB deste navegador, com uma cópia anterior para recuperação. Não sincroniza entre dispositivos e não grava no repositório.
- Salvar dados baixa JSON portátil com os dados e todas as imagens. Abrir aceita os JSON anteriores deste editor.
- Baixar HTML produz uma cópia completa offline com CSS, JavaScript, fotos e dados incorporados. Não depende da pasta publicada.
- O navegador pode remover seus dados locais. Exporte JSON ou HTML para guardar uma cópia independente.
- Pranchas e impressão gera catálogo, seleção de compra, fornecedores, checklist, quadro do layout e pendências. A paginação considera a altura real das linhas; impressão em A4 a 100% e sem cabeçalhos/rodapés do navegador.

## Estrutura
`index.html`, `css/estilos.css`, `js/app.js`, `js/persistencia.js`, `dados/projeto.js` e `imagens/*.webp`.

28 itens e 13 fornecedores na base publicada; dados e observações provenientes do levantamento fornecido. Alternativas só entram na simulação quando selecionadas. Preços sem quantidade ou sem valor ficam em aberto.

# Sala de Bem-Estar — editor SEHURB

Abra pelo GitHub Pages. Arquivos: `index.html`, `css/estilos.css`, `js/editor.js`, `js/recursos.js` e `imagens/logo.webp`.

A logomarca pode ser substituída em **Dados da prancha → Carregar / trocar logomarca**. Aceita PNG, JPG e WebP. O mural floral foi retirado; as paredes permanecem sem arte predefinida.

**Salvar projeto** exporta JSON com a logomarca e o estado editável. **Baixar HTML** incorpora CSS, JavaScript e imagens em um arquivo offline. O salvamento automático pertence ao navegador, sem sincronização entre dispositivos.

Para desenvolver localmente: `python -m http.server 8000` na raiz do repositório e abrir `/projetos/sala-bem-estar/`. A versão modular deve ser servida por HTTP; para compartilhar offline use Baixar HTML.

## Interface responsiva

Barra superior com ícones de desfazer, refazer, salvar, PDF e menu de arquivos. Barra de edição com seleção, texto, chamada, tabela, duplicação, rotação e exclusão. Painéis recolhíveis no computador e painéis laterais no celular/tablet; no celular a barra inferior dá acesso à planta, móveis, folhas, propriedades e dados da prancha. Cartões de mobiliário permitem inserção rápida.

Atalhos: `V` seleção, `T` texto, `A` chamada, `F` ajustar à tela, `Ctrl/⌘+S` salvar projeto. `Ctrl/⌘+Z`, `Ctrl/⌘+Shift+Z`, `Ctrl/⌘+D` e `Delete` continuam disponíveis. O menu Mais opções contém a lista de atalhos e as exportações.

A prancha é ajustada à largura disponível na abertura e ao redimensionar a janela. O controle manual de zoom suspende o ajuste automático até acionar Ajustar à tela. A impressão mantém folhas A4 sem os painéis.

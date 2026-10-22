# Sala de Bem-Estar — editor SEHURB

Abra pelo GitHub Pages. Arquivos: `index.html`, `css/estilos.css`, `js/editor.js`, `js/recursos.js` e `imagens/logo.webp`.

A logomarca pode ser substituída em **Dados da prancha → Carregar / trocar logomarca**. Aceita PNG, JPG e WebP. O mural floral foi retirado; as paredes permanecem sem arte predefinida.

**Salvar projeto** exporta JSON com a logomarca e o estado editável. **Baixar HTML** incorpora CSS, JavaScript e imagens em um arquivo offline. O salvamento automático pertence ao navegador, sem sincronização entre dispositivos.

Para desenvolver localmente: `python -m http.server 8000` na raiz do repositório e abrir `/projetos/sala-bem-estar/`. A versão modular deve ser servida por HTTP; para compartilhar offline use Baixar HTML.

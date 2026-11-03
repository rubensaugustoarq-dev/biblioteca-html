# Rubens Augusto Arquitetura — GitHub Pages

Cópia estática do site existente, preservando conteúdo e interface. Exportada em 03/11/2026 a partir do commit 2f70486ebe53e22020c7b204b4992cb6f64bf394 do Sites.

## Organização
- Fonte editável: fontes/rubens-arquitetura/app
- Imagens e marca: fontes/rubens-arquitetura/public
- Publicação compilada: projetos/rubens-arquitetura
- Catálogo manual: app/data/sobrados.ts
- WhatsApp: app/data/contact.ts

## Atualizar
Use Node.js 22 ou superior. Nesta pasta, execute npm ci e npm run build -- --webpack.
Copie o conteúdo de out/ para ../../projetos/rubens-arquitetura/ e publique na branch fitquick, mantendo .nojekyll na raiz do repositório.

O basePath em next.config.ts e os caminhos em app/ correspondem a /biblioteca-html/projetos/rubens-arquitetura.
O site é público, sem login e sem banco de dados. O formulário monta a mensagem e abre o WhatsApp para revisão e envio pelo visitante.

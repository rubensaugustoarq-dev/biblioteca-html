# Usar o Lotes SEHURB 1.0.0

## No computador já preparado

Abra `Iniciar Lotes SEHURB.cmd`. A Home mostra os projetos salvos. Clique em um cartão para abrir, use Buscar para filtrar e Início para retornar à lista. Novo projeto conserva o fluxo de coordenadas e CRS. Os estudos já existentes continuam no mesmo local.

## Em outro computador Windows

1. Baixe o repositório, extraia e entre em `projetos/lotes-sehurb/software`.
2. Instale Python 3.12 de 64 bits e Node.js 22 ou superior. É preciso conexão na preparação inicial.
3. Execute `Preparar Lotes SEHURB.cmd` uma vez. O preparador cria o ambiente Python, instala as dependências e compila a interface.
4. Execute `Iniciar Lotes SEHURB.cmd`. O endereço local é http://127.0.0.1:8765.

O servidor fica restrito ao computador local. GitHub Pages apresenta a página de acesso/documentação, mas não executa o motor Python. Não copie somente o HTML compilado para tentar usar as ferramentas sem o motor.

## Projetos e cópias de segurança

O código no GitHub não contém projetos pessoais, ortofotos, matrículas ou histórico de usuários. No aplicativo, cada projeto é uma pasta com SQLite e seus recursos. Faça cópia da pasta inteira, ou use Salvar como para uma pasta de sua escolha. Não apague `projects`, `.runtime` ou `.venv` de uma instalação existente ao atualizar o código. Pastas externas registradas por Salvar como aparecem na Home.

## Diagnóstico

Se não abrir, confira `.runtime/server.log` e se a porta 8765 está livre. `python scripts/doctor.py` verifica dependências sem modificar projetos. Para reabrir uma prévia PDF após reiniciar o motor, gere a prévia novamente.

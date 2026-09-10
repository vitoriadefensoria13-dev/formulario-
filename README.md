# Backend do formulário AFM — envio para o Google Drive

Recebe o PDF (e os documentos anexados) gerados pelo formulário e organiza
tudo numa subpasta com o nome da cliente, dentro da pasta compartilhada do
escritório no Google Drive.

## Por que isso não roda direto no navegador do cliente

O formulário é uma página pública: qualquer pessoa que receber o link pode
abri-la. Se as credenciais de acesso ao Drive do escritório estivessem no
código dessa página, qualquer visitante teria acesso a essas credenciais.
Por isso o upload passa por esta função de servidor — as credenciais só
existem nas variáveis de ambiente do Vercel, nunca no HTML/JS público.

## Como colocar para rodar

1. **Crie a service account no Google Cloud**
   - Console do Google Cloud → *IAM & Admin* → *Service Accounts* → *Create*.
   - Ative a **Google Drive API** para o projeto.
   - Gere uma chave em formato JSON e baixe o arquivo.

2. **Compartilhe a pasta do Drive com a service account**
   - Abra a pasta [aqui](https://drive.google.com/drive/folders/1EY-Vsek-zQd48lHODIuWy61KdcYx4un3).
   - Compartilhe com o e-mail da service account (algo como
     `afm-uploader@SEU-PROJETO.iam.gserviceaccount.com`) como **Editor**.
   - Sem esse passo, o upload falha com erro de permissão.

3. **Codifique a chave em base64** (para caber numa variável de ambiente sem
   quebrar por causa das quebras de linha do JSON):
   - Windows: `certutil -encode chave.json chave.b64` e copie o conteúdo
     entre `-----BEGIN CERTIFICATE-----` e `-----END CERTIFICATE-----`
     (ou use `[Convert]::ToBase64String([IO.File]::ReadAllBytes("chave.json"))`
     no PowerShell, que já sai em uma linha só).
   - Mac/Linux: `base64 -w0 chave.json`.

4. **Configure as variáveis de ambiente no Vercel** (Project Settings →
   Environment Variables), usando `.env.example` como referência:
   - `GOOGLE_SERVICE_ACCOUNT_KEY_BASE64`
   - `GOOGLE_DRIVE_PARENT_FOLDER_ID` (já vem com o valor certo por padrão)
   - `ALLOWED_ORIGIN` (o domínio final do site, ex.: `https://afm-advocacia.vercel.app`)

5. **Copie as pastas `api/` e `lib/`** deste projeto para dentro do repositório
   real do site (o que o Antigravity vai gerar) e faça o deploy normalmente
   pelo Vercel — funções dentro de `api/` viram endpoints automaticamente.

6. **Aponte o formulário para o endpoint publicado**: no arquivo do
   formulário, defina `SUBMIT_ENDPOINT` (perto do topo do `<script>`) como
   `https://SEU-DOMINIO.vercel.app/api/submit-caso`. Antes disso o formulário
   continua funcionando normalmente (gera o PDF e oferece o download), só não
   envia automaticamente para o Drive.

## Segurança e LGPD — o que já está implementado

- **Minimização de dados**: a função só recebe o nome da cliente (para nomear
  a pasta) e os arquivos em si — nenhuma resposta do formulário é reenviada
  como texto solto para o backend.
- **Sem segredos no código**: a chave da service account vive só em variável
  de ambiente, nunca no repositório.
- **Sem dados pessoais em log**: os `console.log`/`console.error` registram
  apenas o ID técnico da pasta e a contagem de arquivos — nunca nome, CPF,
  endereço ou conteúdo de documento.
- **CORS restrito**: `ALLOWED_ORIGIN` deve ser preenchido com o domínio real
  do site; deixá-lo vazio ou como `*` permitiria que qualquer site chamasse
  esse endpoint com dados de clientes.
- **Limite de tamanho por arquivo** (25MB) para evitar abuso do endpoint.

## O que falta decidir com a equipe (não é técnico, é jurídico/organizacional)

- **Base legal e finalidade**: o formulário já pede consentimento explícito;
  garanta que a política de privacidade do site descreva essa coleta, por
  quanto tempo os documentos ficam guardados e quem tem acesso à pasta do
  Drive.
- **Retenção**: definam por quanto tempo os documentos de um caso encerrado
  permanecem no Drive antes de serem arquivados ou excluídos.
- **Encarregado (DPO)**: se o escritório processa dados sensíveis em volume
  (o que é o caso aqui — saúde da criança, violência doméstica, dados
  financeiros), vale formalizar quem responde por isso perante a LGPD.

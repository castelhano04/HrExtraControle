# Antifraude + exclusão de usuários

## O que esta versão adiciona

- Botão **Excluir usuário** no painel ADMIN.
- Exclusão real do Firebase Authentication pelo backend.
- Apaga horas, gastos, configurações, fechamentos, acesso e assinatura.
- Libera a vaga do usuário nos dispositivos em que ele estava registrado.
- Limite de **3 contas por instalação do navegador/dispositivo**.
- A conta proprietária e contas ADMIN não consomem as 3 vagas.

## IMPORTANTE sobre o limite por dispositivo

Em um site comum não existe um identificador físico inviolável do celular/PC.
Esta versão gera um ID persistente no `localStorage`.

Isso impede o abuso comum de criar várias contas no mesmo navegador, mas pode ser contornado se a pessoa:
- limpar os dados do navegador;
- usar outro navegador;
- usar modo anônimo;
- trocar de aparelho.

Para reforçar a proteção, ative também Firebase App Check com reCAPTCHA Enterprise.

## Implantar as Cloud Functions

Instale o Firebase CLI:

npm install -g firebase-tools

Faça login:

firebase login

Na pasta do projeto:

firebase use --add

Escolha o projeto `controle-hr-extra`.

Depois:

firebase deploy --only functions

## Publicar regras

firebase deploy --only firestore:rules

## Vercel

O `index.html` continua podendo ficar na Vercel/GitHub.
As funções privilegiadas ficam no Firebase Cloud Functions.

## Região

O HTML usa:

getFunctions(appFirebase, "us-central1")

As funções também usam a região padrão `us-central1`.

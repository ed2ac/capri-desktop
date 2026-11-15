# A nuvem da Capri

Um Worker do Cloudflare (plano grátis) que continua olhando enquanto o notebook está desligado:

- **Seu PS5, pelo Discord**: a cada 3 minutos ele acorda, conecta no Discord por um instante, vê o que
  você está jogando (o status da sua conta, que o Discord pega da PlayStation) e desconecta. Começou ou
  terminou um jogo, ele anota a sessão. Nada vai pra Sony.
- **As notícias**: a cada 15 minutos, um dos feeds (MeuPlayStation, IGN Brasil, Tecnoblog, TecMundo, g1,
  BBC Brasil), revezando. Guarda as manchetes de 2 dias.

A Capri pergunta com uma chave que só ela tem. Ligada, ela te conta o que você jogou com o notebook
desligado, fica sabendo na hora quando você vai pro PS5, e responde "quais as notícias?".

## Antes: o bot do Discord (5 min)

1. Em https://discord.com/developers/applications › **New Application** (ex.: "Capri").
2. **Bot** › **Reset Token** › copie o token (vai ser pedido no passo 5 do setup; não cole em mais lugar nenhum).
3. Ainda em **Bot**, ligue **Presence Intent** e **Server Members Intent**.
4. **OAuth2 › URL Generator**: marque `bot`, sem permissões. Abra o link e adicione o bot a um servidor
   **seu** (pode criar um só pra isso) onde você também está.
5. No Discord: Configurações › Avançado › **Modo desenvolvedor**. Botão direito no servidor › Copiar ID;
   botão direito em você › Copiar ID de usuário.
6. Configurações › Conexões: a PlayStation ligada, com **Exibir no perfil**/atividade ligado.

## O setup

```
cd cloud
npm install
npm run setup
```

Ele faz login no Cloudflare (abre o navegador), cria o armazenamento, pergunta os dois IDs, publica,
pede o token do bot e gera a chave da Capri. No fim mostra **endereço** e **chave**: no menu da Capri,
**Ligar a nuvem da Capri (PS5 e notícias)…**, cole os dois.

Depois: `npm run deploy` publica de novo; `npm run logs` mostra o que ele está fazendo.

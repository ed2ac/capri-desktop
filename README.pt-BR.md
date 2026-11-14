[English](README.md) · [Français](README.fr.md) · **Português (Brasil)**

# Capri

A Capri, o construto do *Projeto Capricórnio* da segunda temporada de Cyberpunk: Edgerunners, mora na sua área de trabalho
e te conta o que a sua IA de programação está fazendo: **Claude Code**, **Codex** ou **Antigravity**. Ela se teletransporta,
dá glitch, comenta cada ação, vem te procurar quando a IA precisa da sua permissão e surta quando o trampo termina.

![A Capri avisando que o Claude terminou](docs/done.png)

![Teletransporte, quadro a quadro](docs/teleport.png)

## O que ela faz

- **Quando ela inicia**: ela agarra a sua tela. As bordas estalam em vermelho, a mão esquerda dela bate na borda, depois a
  direita, os braços entram ao longo delas enquanto ela se puxa pra cima, e o rosto dela se choca contra o vidro (um flash
  branco, um de tinta, as cores dela se separando, a tela tremendo). Ela olha em volta, pisca, abre bem a boca num "oi" (uma
  etiqueta aparece do lado do rosto dela, com o nome digitado embaixo), solta a borda direita pra acenar pra você com a mão de
  garras, agarra de novo, dá uma olhada pra onde vai e solta: os braços dela se quebram em estilhaços das mãos pra dentro, e a
  cabeça se encolhe e mergulha até o cantinho dela, onde o corpo se desdobra a partir do rosto.

  ![A intro dela: as mãos nas bordas, o rosto contra o vidro, o aceno, agarrando de novo](docs/intro.png)

- **Enquanto o Claude trabalha**: um letreiro em cima da cabeça dela mostra a ação atual
  (`EDITS gigs.ts`, `RUNS npm test`, `GREPS "paginate"`…) e ela vai soltando pequenos glifos de dados.
  Quando o Claude roda um comando ou vai pra web, faíscas vermelhas saem dos dedos dela; sentada numa janela,
  ela se pluga nela e o raio corre pela borda.
- **Quando o Claude fica quieto no meio da tarefa** (pensando, ou um modelo local lento): depois de 15 segundos o letreiro
  fica violeta e conta os segundos (`THINKING… 45 s`), e ela se mantém ocupada (um giro, uma olhada em volta, o satélite
  uma vez). Depois de 40 segundos ela comenta; depois de dois minutos ela te avisa que nada travou.
- **Quando o Claude precisa de você** (permissão, pergunta): ela se teletransporta pro lado do seu mouse, juba eriçada, e não larga.
  Se você estiver em outra janela, ela vai até a janela do Claude e aponta pra ela com o dedo (uma linha tracejada,
  colchetes nos cantos, `CLAUDE` numa etiqueta): é lá que está a pergunta. Ela para assim que você responde.
- **Quando um comando falha**: quadro de impacto vermelho, ela é jogada pra trás, glitch pesado, e a linha do erro que importa de verdade.
- **Quando termina**: ela se teletransporta pro meio da tela e entra na sequência de vitória:
  uma preparação com a juba recolhida, um quadro de smear esticado, aí os braços pra cima e a juba explodindo sob
  linhas de velocidade de mangá e uma onda de choque, uma risada maníaca com um cut-in de anime do sorriso dela. Quando ela desce,
  o resumo (`12 actions · 3 files changed · 2m 14s`) e a última frase do Claude.
- **Quando o Claude responde e você está em outra janela**: ela te mostra a resposta inteira, num painel mais largo que
  rola (parágrafos, listas e código preservados). Some quando você volta pra janela do Claude, ou quando você clica nele.
  A janela do Claude é aquela onde você digitou o prompt. Só no Windows, como o rastreamento de janelas.
- **No resto do tempo**: ela flutua, a juba balança e solta estilhaços, ela vai de um canto pro outro,
  se vira e inclina a cabeça quando o seu mouse chega perto (ou, pestinha, dá um choque nele com um raio vermelho e um sorrisinho),
  olha pro satélite e cai no sono depois de 10 minutos de calmaria.
- **Quando ela dorme**: ela cochila um tempo, depois a juba e o corpo se desfazem e só sobra o que ela é de verdade
  na série, a máscara verde e os olhos, flutuando onde ela estava, de olhos fechados. De vez em quando ela abre um.
  Chega o mouse perto (ou deixa o Claude voltar a trabalhar) e os olhos azuis dela se abrem de uma vez e ela se remonta em volta deles.
- **O satélite**: a grande sequência, guardada pros momentos que importam. A primeira vez do dia, um tempinho depois que o
  Claude termina um trampo longo (8 minutos ou mais, ou 50 ações), ou quando você quiser pelo menu da bandeja.
  Os pontinhos brancos da juba dela se soltam numa constelação, se alinham numa estrada dos dedos dela até o satélite,
  ela se encolhe, e a luz vermelha sobe até ele. Ele responde, piscando duas vezes.

![Vitória: a pose-chave, depois a risada e o cut-in](docs/victory.png)

![O satélite: as estrelas dela, a estrada, a luz vermelha, a resposta](docs/star.png)

### Ela se movimenta

- **Ela senta nas suas janelas**: empoleirada na borda de cima de uma janela, as pernas penduradas, balançando uma depois da outra.
  Ela vai junto quando você move a janela, e cai quando você fecha, minimiza ou cobre ela.
  Enquanto o Claude trabalha, ela se acomoda na janela da frente se der.
- **Ela espia pelas bordas da tela**: meio escondida na esquerda ou na direita, ou pendurada de cabeça pra baixo lá de cima.
  Ela é tímida: chega o mouse perto e ela foge pra outra borda.
- **Ela cai**: esticada, juba soprada pra cima, acelerando, depois um grande achatamento e uma chuva de estilhaços quando aterrissa.
  No caminho, a borda de uma janela pode segurar ela.
- **Solta ela numa janela**: arrasta e solta com o quadril dela na borda de cima de uma janela, e ela senta ali.
  Solta em qualquer outro lugar e ela cai.
- **Arremessa ela**: segurada, ela balança pendurada no seu ponteiro, chutando as pernas. Solta no meio do balanço e ela sai voando junto:
  um rastro longo por dois desenhos, depois ela rodopia, com a juba e as outras mentes dela vindo atrás. Numa borda da
  tela, ela se espatifa (grudada nela por um instante, achatada, e o vidro racha onde ela bateu) e quica de volta. Numa
  janela, ela se agarra na borda, ou quica nela e a janela treme. Se cai em pé, ela aterrissa e derrapa
  um pouco; senão, ela escorrega pelo chão e fica deitada um instante, vendo estrelas, antes de pular de volta e
  se sacudir. Dá pra pegar ela no ar. Uma vez, ela fica abalada (ou adora, se ela gosta de você); três vezes
  seguidas, ela fica brava, dá um choque no seu ponteiro e não deixa você pegar ela por um tempo.
- **Várias telas**: quando o seu ponteiro fica uns segundos em outra tela, ela te segue. Se for a tela vizinha
  da dela, ela se agacha, pula pela borda e sai de um rasgo do outro lado; senão, ela se teletransporta
  pra lá. Arremessada em direção a uma tela vizinha, ela vai pra ela. Quando o Claude precisa de você ou um lembrete vence, ela vem
  pra tela onde você está. No menu dela › **Tela** pra escolher uma, ou desmarque *Me seguir de uma tela pra outra*.
- **Ela possui as suas janelas**, como na série, onde ela entra em corpos e sistemas: de vez em quando ela mergulha
  na janela em que está sentada. Raios vermelhos correm pela moldura, fatias dela dão glitch, e a janela olha
  pra você com os olhos e o sorriso em zigue-zague dela, mais olhos se abrindo por toda parte, todas as pupilas no seu ponteiro, e ela ri.
  Depois ela sai por outra janela. Nada é desenhado por cima das janelas na frente dela, e o conteúdo da janela
  nunca é lido: ela só é desenhada por cima, por dois segundos. Se te incomodar, desmarque *Possuir minhas janelas* no menu da bandeja.
- **Ela sente o seu PC** (afinal, ela mora nele): o processador a todo vapor por um tempo, ela superaquece, se abana
  e sai calor da juba. Num notebook: o carregador plugado ou desplugado, ela sente; a bateria
  acabando, ela murcha e pisca. A rede caiu, ela sente o baque; voltou, ela fica feliz. Um pendrive plugado, ela mergulha
  nele (pelo relógio), fuça e volta com o veredito. Um celular, um controle, um headset ou qualquer outra coisa
  plugada: um raio em direção ao relógio e um comentário. Um jogo na sua frente (Steam, Epic, Riot, Xbox, GOG),
  ela comenta e se guarda enquanto você joga, depois volta pra perguntar se você ganhou. Desmarque *Reagir
  ao meu PC* no menu dela pra parar com isso.
- **Pequenos floreios**: um giro completo com imagens residuais, um pulinho, olhar pra esquerda e pra direita, a cabeça inclinada,
  e as outras mentes dela (as cópias verde e vermelha) se afastando dela, ficando ali paradas e voltando num estalo.

![Sentada numa janela](docs/sit.png)

![Espiando pelas bordas](docs/peek.png)

![Possuindo uma janela: o mergulho, o impacto, a janela cheia de olhos](docs/possess.png)

![Dormindo até virar só a máscara, acordando, e guardada no canto inferior esquerdo](docs/sleep.png)

Por enquanto, o rastreamento de janelas é só no Windows (um helper minúsculo em PowerShell lê a posição das janelas, nunca o conteúdo; o título da janela da frente só é usado pra detectar outra IA, veja "Ela se apega", e a pasta do programa dela pra reconhecer um jogo; os pendrives plugados são vistos pela letra da unidade, os outros dispositivos pelo nome que o Windows dá pra eles).
No macOS e no Linux ela ainda flutua, espia, cai e passeia.

### Ela te mostra as coisas

**Como funciona?** no menu dela: ela pergunta o que te mostrar, depois te leva até lá e aponta. A cabeça dela vira
de uma vez, ela se encolhe inclinando pra trás, e aí ataca: o braço de construto dela dispara até o alvo com o dobro do comprimento, um raio vermelho
sai da ponta do dedo, uma mira se crava nele com dois olhos dela se abrindo nos cantos, e um close dos olhos dela entra
na tela. Depois ela segura ali enquanto explica, com um fio de dados indo do dedo dela até o alvo: de vez em quando ela dá uma cutucada,
ou olha de volta pra você. Quando termina, o fio se recolhe pro dedo dela e o braço volta num estalo.

![O ataque, e ela segurando enquanto explica](docs/point.png)

- **Cadê meu ícone?** Ela desce até o relógio e aponta pro ícone dela na bandeja, ou pro **^** quando o Windows esconde ele.
- **Cadê o Claude?** Ela aponta pra janela do Claude: aquela onde você digitou o seu último prompt.
- **A pasta do Claude**: ela abre `~/.claude` no Explorador com o `settings.json` selecionado, aponta pra janela e
  explica o que é o hook dela ali e como tirar.
- **Me conectar ao Claude**: os hooks dela em um clique. É também as boas-vindas dela na primeira vez que ela inicia. Do lado,
  **Grátis com o Ollama** roda o Claude Code (ou o Codex) pelo Ollama pra você: os hooks dela são instalados, o Ollama é instalado se
  ainda não estiver, e abre uma janela com `ollama launch claude`, onde você escolhe um modelo.
- **Falar comigo**: veja "Fala com ela" abaixo.

Ela faz caras e bocas enquanto fala: oito expressões, todas tiradas de quadros da série (observando, virada de lado, o sorriso
com a presa, os olhos arregalados, olhando direto pra você, rindo de boca bem aberta, todos os olhos de uma vez, o sorriso em zigue-zague).
Cada mensagem escolhe a que combina, e o retrato dela dá glitch de uma cara pra outra.

![Apontando pra janela do Claude durante um pedido de permissão, e pro ícone dela na bandeja](docs/guide.png)

![As oito caras dela](docs/faces.png)

### O relatório de missão dela

**Relatório de missão** no menu dela: um card do que o Claude fez hoje, feito pra tirar print. As tarefas concluídas
em destaque, depois ações, arquivos alterados e erros, a missão mais longa e o projeto dela, prompts, aprovações e projetos. Os
números sobem contando. **Copiar imagem** coloca uma imagem do card na sua área de transferência, com fundo escuro, pronta pra colar
em qualquer lugar. À noite (depois das 18h), depois de um dia de trabalho de verdade (3 tarefas ou mais), ela te traz o card uma vez, por
conta própria. A demo não conta, e tudo fica no seu PC, um dia de cada vez.

### Fala com ela

**Falar com ela** no menu dela (ou o botão **Fala comigo** quando você clica nela e não está rolando nada): você digita no
painel dela e ela responde no personagem. Ela sabe o que o Claude está fazendo e o que ele fez hoje. Ela responde por escrito,
no idioma dela. Enter envia, Esc fecha.

Na primeira vez, ela configura tudo com você, com botões, sem terminal:

- **No meu PC** (grátis, nada sai da sua máquina): ela instala o [Ollama](https://ollama.com) pra você (com o winget,
  o instalador do próprio Windows), acorda ele e baixa um modelo enquanto uma barra vai enchendo: gemma3 (3,3 GB, melhor em idiomas
  que não sejam o inglês) ou llama3.2 (2 GB, pra PCs mais modestos). Num modelo minúsculo (1B ou menos) ela avisa que ele pode falar
  besteira e oferece um melhor.
  Logado no Ollama? Ela também oferece os modelos gratuitos na nuvem dele (`beam:cloud` hoje): nada pra baixar, bem maiores
  do que cabe num PC, mas as suas mensagens passam pelos servidores do Ollama. Sem login, no menu dela › **Modelo de IA** tem
  **Entrar no Ollama (modelos na nuvem grátis)…**. Se um modelo na nuvem parar de responder (deslogado, cota grátis acabou), ela
  volta pra um modelo no seu PC.
- **Online, sem conta**: Pollinations, nada pra configurar.
- **Tenho uma chave**: Groq ou Gemini (os dois têm plano gratuito), OpenRouter, OpenAI, Mistral ou DeepSeek. Você cola a sua
  chave no painel dela e ela confere. Fica guardada no seu PC, criptografada com a sua conta do Windows, e só é enviada pra
  esse serviço. No Groq ela escolhe sozinha o melhor modelo grátis, e quando o uso
  grátis do dia acaba (ou ele cai), o modelo do seu PC responde no lugar.

No menu dela › **Modelo de IA** você troca depois: **Escolher com ela…**, ou direto um serviço e um modelo, LM Studio
(`:1234`), llama.cpp ou vLLM (`:8080`), qualquer servidor compatível com a OpenAI (**Chave de API ou endereço…**), ou o próprio **Claude Code**:
as suas mensagens vão pro `claude -p` na pasta que você escolher, continuando uma única conversa, e os hooks dela mostram o que ele
faz. Nesse último, o modo de permissão `default` só deixa ele ler (não tem ninguém ali pra dizer sim); `acceptEdits` deixa ele
editar arquivos sem perguntar. **Esquecer nossas conversas** apaga o que ela lembra dos seus papos.

**É IA.** As respostas dela são escritas pelo modelo, não pelos roteiristas da série: é uma versão fã dela, e o painel do chat
avisa isso toda vez.

**O que ela pode fazer no seu PC** (Windows), quando você pede no chat:

- **Abrir um app ou um jogo**: qualquer coisa do seu menu Iniciar (apps da Store como o Spotify incluídos), os seus jogos da Steam e da Epic
  ("abre o Spotify", "abre o Brawlhalla"). Se foi você que deu o nome, abre na hora; se foi só a IA dela que
  inventou, aparece um botão antes.
- **As suas pastas e a sua área de trabalho**: "abre meus downloads", "abre o Explorador de Arquivos", "abre a lixeira", ou um arquivo,
  pasta ou atalho da sua área de trabalho, pelo nome. Qualquer coisa que rodaria um programa ou um script (.exe, .bat, .ps1…)
  sempre fica atrás de um botão.
- **Achar os seus arquivos** ("acha meu currículo", "cadê meu projeto do After Effects?", "acha meu último vídeo e abre a
  pasta"): pelo nome ou pelo tipo de arquivo (um projeto do After Effects é um .aep), na sua pasta de usuário inteira, pelo nome e pelo
  conteúdo (com o índice de pesquisa do Windows), com botões pra abrir o que ela achou ou mostrar a pasta. Nada sai do
  seu PC.
- **Pesquisar na web** ("pesquisa a previsão do tempo em São Paulo no Google") e **tirar um print** ("tira um print":
  sem ela na imagem, salvo em Imagens › Capturas de Tela). Ela também sabe a data e a hora.
- **Um jogo do Roblox pelo nome** ("abre Steal a Brainrot no Roblox", "no meu roblox joga grow a garden"): ela acha
  o jogo no Roblox e te joga direto nele (ou abre a página dele se o Roblox não estiver instalado).
- **O seu PC em si**: uma página de configurações ("abre o Bluetooth", "configurações de som", "atualizações do Windows"); o que sobra ("quanto
  de bateria?", "quanto espaço tem no meu disco?", RAM, o seu IP na rede); o som ("coloca o volume em 30", "muta");
  um timer ("timer de 10 minutos", contado no letreiro dela); "recorta uma área da tela"; "arruma minhas janelas" (ela varre elas pra fora,
  "restaura minhas janelas" traz de volta); "coloca o Discord na esquerda e o Chrome na direita"; modo escuro ou claro. Bloquear,
  suspender, desligar ou reiniciar ("desliga meu PC daqui a uma hora") sempre esperam o seu clique no botão dela, e
  "cancela o desligamento" interrompe.
- **Cuidar do seu PC** (respondido na hora, sem a IA dela, então funciona até com a internet fora do ar):
  - "por que meu PC tá lento?": os três apps que mais pesam nele, com um botão pra fechar cada um.
  - "libera espaço": os arquivos temporários antigos e a lixeira (o tamanho aparece no botão), e os seus três
    maiores downloads, cada um com um botão pra mandar pra lixeira.
  - "o que inicia com o Windows?": a lista, com um botão pra tirar alguns ("desativa o Discord na inicialização", "ativa a
    Steam na inicialização" também funcionam). O que está configurado pro PC inteiro abre a aba Inicializar do Gerenciador de Tarefas.
  - "atualiza meus apps": o que tem atualização (pelo winget), e um botão pra atualizar tudo.
  - "acha fotos duplicadas" (ou nos seus downloads, vídeos, documentos, área de trabalho): as cópias, a mais antiga mantida, pra
    lixeira com um botão.
  - "muda o som pro meu headset", "…pras caixas de som", "…pro Yeti": por onde sai o som do Windows; "muda a
    saída de áudio" mostra um botão pra cada dispositivo (os virtuais ficam de fora).
  - "muta meu microfone" / "desmuta meu microfone"; "desliga o Bluetooth", "liga o Wi-Fi" (de verdade, não só a página de configurações);
    "ejeta meu pendrive" (com segurança, como o Explorador faz); "abaixa o brilho", "brilho em 50%" (a tela do próprio notebook).
  - "clipa isso" (os últimos 30 segundos) e "grava minha tela" pela Xbox Game Bar: o chat dela sai do
    caminho antes pro jogo ficar em foco. Pra clipar, precisa estar ligado o "Gravar o que aconteceu": ela avisa, com um botão.
  - "perdi uma janela": janelas presas fora das suas telas voltam; "move o Discord pra outra tela".
  - Setups: "salva meu setup de jogo" guarda os apps abertos e onde cada janela está; "abre meu setup de jogo" abre
    eles de novo (depois do seu clique) e coloca cada janela de volta no lugar, com o volume que estava.
  - "modo jogo": o plano de energia Alto desempenho do Windows, os apps que você citou fechados ("no modo jogo, fecha o Chrome"),
    e ela se guarda; "sai do modo jogo" volta tudo como era, inclusive os apps fechados.
  - "a internet não tá funcionando": ela confere a sua rede, o seu roteador, a internet depois dele, os nomes (DNS: limpo
    se for isso) e uma página de login de Wi-Fi, e te diz o que fazer em uma frase.
- **Pausas pra saúde**: depois de duas horas no PC sem uma pausa de verdade (cinco minutos longe do teclado e do
  mouse), ela manda você levantar e beber uma água, num momento tranquilo e nunca no meio de um jogo. "Depois"
  traz o aviso de volta em meia hora; no menu dela, *Pausas pra saúde* desliga.
- **Música**: "pausa", "próxima", "mais alto", "muta"… apertam as teclas de mídia, então funciona com o Spotify e a maioria dos players, assim
  que você envia. "Toca Bohemian Rhapsody" ou "coloca Daft Punk no YouTube" abre o vídeo certo no YouTube,
  na hora (não uma pesquisa). "Toca o que você quiser": ela escolhe. "Coloca Daft Punk no Spotify" abre o Spotify numa
  pesquisa por isso.
- **Um site**: sempre atrás de um botão mostrando pra onde ele vai.
- **Fechar um app** ("fecha o AM Music", "pode fechar o Discord?"): um botão com o nome do app, e nada acontece
  até você clicar. Ela fecha do mesmo jeito que o botão de fechar dele, então ele ainda pode te pedir pra salvar. Se ele só
  se escondeu na bandeja, ela oferece **Forçar fechamento**, de novo só com o seu clique (aí o que não foi salvo se perde). Ela nunca fecha
  as partes do próprio Windows, o Claude, o Ollama ou ela mesma.
- **Lembretes** ("me lembra em 20 minutos de tirar a roupa da máquina", "me lembra amanhã às 9 de ligar pra oficina"): a
  hora e o texto são lidos direto da sua mensagem, mesmo num modelo minúsculo, e um botão **Cancelar** aparece embaixo da
  resposta dela. Sem hora, ela pergunta quando. Na hora, ela vem te procurar (na tela onde você está, mesmo
  guardada) com **Feito** e **Daqui a 10 min**. Se ela estava desligada na hora, ela lembra quando voltar. No menu dela ›
  **Lembretes** lista todos, e dá pra cancelar cada um ali.

Mais nada: ela não lê os seus arquivos, e só vê a sua tela quando você pede ("olha minha tela", "o que você tá
vendo?" no chat dela: ela olha e responde ali mesmo, com a conversa de vocês em mente).

**Ela olha a sua tela**, se você quiser. No menu dela › **Olha minha tela**: os olhos dela vão pra janela da frente, uma
linha de varredura passa por ela, e ela te diz o que acha, do jeito dela. **Olhar minha tela de vez em quando** deixa ela fazer isso
sozinha, a cada 8 a 15 minutos, quando você está ali e trocou de janela (desligado até você marcar). Na primeira
vez, ela te conta pra onde vai a imagem: pra IA local dela, só no seu PC (mesmo que o chat dela seja online), então
nada sai dele. Ela nunca guarda a imagem, e o chat dela lembra do que ela disse por um tempo. Precisa de um modelo no
seu PC que leia imagens: gemma3 (não o llama3.2, ela vai te avisar).

### Ela comenta o que você faz

Menu dela › **Comentar o que eu faço** (desligado até você marcar). Sem print: ela vê o app que está na sua frente e o
título da janela, e entende o que é: uma **pesquisa** no Google ou no Bing, um **vídeo** (YouTube, Netflix, Twitch…), uma
**música** (Spotify, YouTube Music), uma **conversa** (WhatsApp, Telegram, Discord), **trabalho** (Teams, Outlook, Word…)
ou outro app. Monta uma linha do tempo curta disso e, de vez em quando, solta uma ou duas frases no personagem: uma
pesquisa uns segundos depois, um vídeo depois de um minuto, quando você está há 45 minutos no mesmo app, quando volta de
um jogo ("e aí, ganhou?") ou de uma chamada. Menu dela › **Quanto ela fala**: *Pouco*, *Normal* ou *Muito*. Só quando
você está no PC, e nunca durante um jogo ou uma chamada.

**Tudo isso fica no seu PC**: o que você faz vai só pra IA local dela (Ollama), mesmo que o chat dela use um serviço
online. Banco, gerenciadores de senha, aba anônima e páginas de login ou pagamento ela nem vê: o título delas é
descartado antes de chegar nela. De conversas ela só vê o nome do app ou do chat, nunca mensagens.

**O diário dela.** Ela guarda um pouco de cada dia (quanto tempo em quê, o que você pesquisou, assistiu, ouviu, jogou)
e, no dia seguinte, escreve no diário dela umas linhas sobre ele. O chat dela lembra dos seus últimos dias. Fica no
arquivo de memória dela, no seu PC: 14 dias de registro, 30 entradas de diário.

### Ela viva: as falas, o modo reunião e a voz

- **Falas pela IA dela** (menu dela, ligado quando há um modelo no seu PC): tudo o que ela diz sozinha (o Claude
  terminou, um erro, a bateria, o ciúme, o carinho, ser arremessada, um jogo…) sai de um estoque de falas novas que a IA
  local escreve em segundo plano, usando as falas originais dela como exemplo de estilo, em tons diferentes. A fala sai
  na hora e nunca se repete; sem IA (ou durante um jogo) ela volta pras falas escritas, sem repetir as últimas.
- **Durante jogos** a IA larga a placa de vídeo (o jogo precisa dela) e volta quando você para de jogar.
- **Modo reunião** (menu dela › *Ficar quieta em chamadas*): quando o microfone ou a câmera estão em uso (Teams, Meet,
  Zoom, WhatsApp, Discord…), ela se recolhe na biochip e fica muda; quando a chamada acaba, ela volta.
- **A "voz"**: não é uma voz falada, é um balbucio digital, sílaba por sílaba, que muda com a cara dela (animada, rindo,
  desconfiada, emburrada), sobe no fim das perguntas e às vezes dá glitch.

### Ela sente o seu mouse, e revida

- **Enxotar**: balance o cursor rápido em cima dela, pra lá e pra cá (mais rápido que um carinho), e ela se assusta e
  se teletransporta pro outro lado da tela, um pouco ofendida. Insista e ela fica brava: fica longe de você por um tempo
  e pode dar o troco.
- **Cutucar**: clique nela várias vezes seguidas e ela reclama; continue e ela dá um choque no seu cursor.
- **Encarar**: deixe o cursor parado em cima dela e ela percebe.
- **O humor no corpo**: brava ou emburrada, ela fecha a cara e bufa de vez em quando; feliz, pula e gira; de
  madrugada boceja e manda você dormir; ignorada por uma hora com você no PC, fica entediada e vem pedir atenção.
- **Travessuras** (menu dela › *Travessuras*): pra dar o troco, ou de tédio, uma travessura inofensiva. *Leves* (o
  padrão): ela pisa na janela em que está sentada e ela treme, ou faz as luzes do seu teclado piscarem (o Caps Lock
  liga e desliga duas vezes, e fica como estava). *Ousadas*: ela também puxa o seu cursor pra perto dela com um raio.
  Curtas, raras, tudo volta como estava, e nunca enquanto você digita, joga, está numa chamada ou vê algo em tela cheia.
  *Nenhuma* desliga.

### Ela reage ao seu terminal

Não só ao Claude: ela reage aos seus próprios comandos, no PowerShell do Windows (menu dela › **Me conectar ao
PowerShell**, um clique) e no bash ou zsh (Linux, macOS ou WSL, com o comando abaixo).
Um comando que falhou (ela toma o golpe e diz qual), um que demorou 15 segundos ou mais (ela avisa quando termina, útil
quando você está em outra janela), `git push`, `git commit`, testes passando. Falas dela, sem IA: é na hora e nada sai
do seu PC.

```bash
npm run shell:install     # adiciona uma linha no ~/.bashrc (e ~/.zshrc, se existir), com backup
npm run shell:uninstall   # tira essa linha
```

Ela fica quieta com o que é interativo ou que "falha" de propósito (`grep` sem resultado, `vim`, `ssh`, `less`, `claude`…),
com Ctrl+C, e com o que é rápido e deu certo. Um comando que parece ter um segredo (token, senha, chave) chega nela só com o
nome do programa. Tudo vai só pro `127.0.0.1`, em segundo plano, sem atrasar seu terminal (no WSL, pelo `curl.exe` do
Windows). `CAPRI_SHELL_MIN=30` no seu `.bashrc` muda o que conta como demorado; menu dela › **Reagir ao meu terminal**
desliga.

### As mãos dela: o Claude Code trabalhando pra você

Peça no chat dela algo que mexa em arquivos ("organiza meus downloads por tipo", "cria uma pasta pro projeto X", "o que
tá enchendo meu disco?", "faz um programinha de controle de gastos"), ou diga direto "tarefa: …". Ela oferece colocar o
**Claude Code** nisso (o do seu WSL), com um botão. Enquanto ele trabalha, ela narra cada passo no letreiro, e **cada
ação que muda alguma coisa vem até você** com *Permitir*, *Negar* ou *Permitir tudo nesta tarefa*. No fim, ela conta o
que foi feito, do jeito dela.

- Ele trabalha na oficina dela (`C:\Users\<você>\Capri`) e alcança a sua pasta de usuário.
- **Apagar é proibido**, seja qual for o clique (`rm`, `rmdir`, `shred`, `sudo`, `dd`, formatar disco, `git push`): o que
  sairia vai pra `Capri\trash\<data>`, recuperável.
- Os **programas** que ele cria (páginas web autocontidas) ficam em `Capri\programs` e aparecem no menu dela ›
  **Meus programas**: cada um abre na sua própria janela, que você fecha quando quiser.
- Precisa do Claude Code instalado no WSL e de `npm run hooks:install` rodado na mesma distro (é assim que ela sabe qual).

### Segurança e faxina

- **Sozinha** (menu dela › *Reagir ao meu PC*): de vez em quando ela confere o que o Windows diz e avisa, no máximo uma
  vez por dia cada coisa, com um botão pra resolver: Defender ou a proteção em tempo real desligados, firewall
  desligado, definições de vírus velhas, disco com problema, pouco espaço, reinício pendente há dias, bateria gasta.
  Um programa novo começando junto com o Windows: "foi você?", com botão pra desativar. Um programa ou script que acabou
  de chegar nos Downloads: quem assinou, e um botão pra o Defender verificar.
- **No chat**: "faz um checkup" (o resumo da segurança, com botões pra verificação rápida e pra Segurança do Windows),
  "procura vírus" (verificação rápida do Defender), "limpeza completa" / "faxina" (temporários, lixeira, downloads
  grandes, o que inicia com o Windows, atualizações e arquivos repetidos, cada um com seu botão).
- Ela não substitui a Segurança do Windows: ela lê o que o Windows diz e te leva até lá.

### O dia a dia

- **Bom dia**: na primeira vez que você aparece de manhã, com o clima (se ela souber sua cidade), os lembretes do dia e
  algo do diário de ontem. **À noite**, uma palavra sobre o seu dia.
- **Modo foco**: "modo foco 50 minutos" conta no letreiro dela, e se você escapar pra um vídeo ou uma conversa ela te
  chama de volta. "Para o modo foco" encerra.
- **Clima**: "minha cidade é Curitiba" uma vez, depois "vai chover hoje?". Só o nome da cidade vai pro Open-Meteo
  (grátis, sem conta).
- **Área de transferência**: "resume o que eu copiei", "traduz o que eu copiei", "corrige o texto copiado": o texto vai
  junto com a sua mensagem pro chat, e a resposta vem com um botão *Copiar*.
- **De qualquer lugar**: Ctrl+Alt+Espaço abre o chat dela.
- **Com "Comentar o que eu faço" ligado**: a música que tá tocando (mesmo minimizada, pelos controles de mídia do
  Windows) e os prints que você tira também viram assunto, sempre pela IA local.
- **Datas**: uma semana, um mês, cem dias desde que vocês se conheceram… ela lembra.

### Programar pelos seus projetos

Cite o projeto ("no projeto capri, conserta o bug do menu", "roda os testes no jogos-escolhas") e o Claude Code trabalha
**dentro dele, no WSL** (os projetos são as pastas de `~/dev`; dá pra mudar em `projectsRoot` nas configurações dela),
com a mesma permissão a cada passo. Na mesma hora seguinte, no mesmo projeto, ela oferece **Continuar a conversa**
(o Claude lembra do que fez) ou **Começar do zero**. E quando um comando falha no seu terminal dentro de um projeto,
o aviso dela vem com **Pedir pro Claude olhar**.

### O coração dela

Quatro coisas por dentro, que tudo alimenta e tudo lê: **energia** (baixa de madrugada, sobe de manhã; bateria, CPU
quente, carinho), **humor** (seus acertos e o carinho sobem; erros, enxotadas, ciúmes descem), **tédio** (cresce quando
você ignora ela) e o **afeto** (o vínculo). Mudam o tom das falas e do chat, o balbucio (mais agudo e rápido quando ela
tá animada), quanto ela comenta e apronta, e o que ela faz sozinha (cochila quando tá sem energia). O estado dela
aparece no topo do menu.

**Emoções**: *medo* (uma ameaça do Defender, a bateria acabando, tempestade na previsão: ela se assusta e se esconde na
borda da tela), *orgulho* (três vitórias suas em duas horas: testes passando, tarefas, foco, lista, jogo), *vergonha*
(você diz algo fofo no chat: ela vira o rosto, glitchando), *curiosidade* (um app que ela nunca te viu usar).
**Brincadeiras**: animada, ela te desafia pro *pega-pega* (chega perto e ela some; clica nela pra pegar); entediada,
propõe *esconde-esconde* (ela espia de uma borda; ache e clique).

### Arquivos, lista, rotinas e a sua semana

- **Entregar um arquivo**: clique direito nele › *Enviar para* › **Capri**, ou arraste pro chat dela aberto. Ela pega,
  oferece Resumir / O que tem na imagem (IA local) / Verificar com o Defender, e a sua próxima mensagem vai com ele
  (o Claude também recebe o caminho, pra mexer nele).
- **Lista**: "anota: comprar ração", "o que eu tenho pra fazer?", "terminei a ração", "limpa a lista". Ela traz a
  lista no bom dia e no modo foco, e comemora quando você risca.
- **Rotinas**: "todo dia às 23h me manda dormir", "toda segunda às 9:30 me lembra do relatório", "minhas rotinas",
  "cancela a rotina do relatório". Na hora, ela vem te achar como num lembrete.
- **Sua semana**: "como foi minha semana?", e sozinha no domingo à noite: horas por app, jogos, foco, tarefas.
- **Jogos**: depois de uma partida ela pergunta como foi (*Ganhei / Perdi / Só jogando*), guarda sequências e reage.
- **Conquistas**: primeira tarefa, 10 tarefas, sessões de foco, dias juntos, vitórias… no menu › *Conquistas*.
- **Memória que aprende**: uma vez por dia, ela pode propor guardar algo que percebeu sobre você ("joga às quintas à
  noite") e **pergunta antes**.

### Falar com ela

**Ctrl+Alt+V**, fala, e ela escuta (para sozinha no silêncio): sua voz vira texto pelo Whisper grátis do Groq (com a
sua chave do Groq) e vai pro chat como se você tivesse digitado. Ela continua respondendo por escrito, com o balbucio.

### Mais dela

- **Modelo do Claude** (menu › *Modelo do Claude*): Sonnet por padrão nas tarefas dela; Opus; Automático (Opus nos seus
  projetos de código); ou o padrão do seu Claude Code.
- **Agenda**: cole no chat o endereço secreto iCal (.ics) da sua agenda (Google: Configurações › sua agenda ›
  "Endereço secreto no formato iCal"). Ela põe os compromissos no bom dia, avisa 5 minutos antes e responde "o que
  eu tenho hoje?".
- **Limites**: "me avisa se eu passar 1 hora no YouTube", "meus limites", "tira o limite do YouTube" (precisa do
  *Comentar o que eu faço*).
- **Tradução rápida**: copie um texto e aperte **Ctrl+Alt+T**: a tradução aparece num balão, com botão Copiar.
- **Olhos** (menu › *Pausa pros olhos*): a cada 20 minutos, 20 segundos olhando pra longe, contados no letreiro.
- **Sono**: ela percebe até que horas você ficou no PC e comenta no bom dia.
- **Música**: com algo tocando, ela dança de vez em quando (se tiver energia e humor).
- **Clima no corpo**: com a sua cidade, ela treme de frio, derrete no calor e emburra na chuva.
- **Datas**: "meu aniversário é 12/05", e ela também lembra do Halloween, Natal, Ano Novo e do aniversário de
  Edgerunners.
- **Mais brincadeiras**: duplo clique nela (pirueta), segurar o clique parado nela (abraço), e o **teste de reflexo**
  ("vamos jogar": quando ela piscar, clique nela o mais rápido possível; o recorde fica guardado). No chat, ela joga
  quiz, charada, 20 perguntas.
- **Mais travessuras**: *Leves*: pichação "CAPRI WAS HERE" glitchada na tela por uns segundos (só desenhada por cima),
  uma notificação falsa, arrastar a janela em que está sentada e devolver. *Ousadas*: prender o seu cursor em volta
  dela por 1,5 segundo, e o som mudo por 3 segundos (só se estava ligado).
- **OBS aberto** (menu › *Com o OBS aberto*): *Ela se comporta* (sem travessuras e sem comentar o que tá na tela) ou
  *Ela dá show*.

### A vida dela

Quando ninguém precisa dela, ela não fica parada: um repertório escolhido pelo coração dela (energia, humor, tédio) e
pela hora. Ela **vai até a janela em que você tá e fica olhando**, **cantarola** (o balbucio, com notinhas subindo),
**rabisca** algo pequeno na tela (coração, estrela, gatinho…, que some), faz **malabarismo** com os fragmentos do
cabelo, **treina** (pulos, giros, espacate), **explora** as janelas sentando em uma por uma, **se aproxima de fininho**
do seu cursor parado (e foge quando ele mexe), **cochila** quando tá sem energia, **olha as estrelas** e **fala
sozinha** de vez em quando. Animada e entediada, ela se mexe bem mais; cansada, bem menos.

**Ela sente o ambiente**: olha pra janela que você acabou de abrir ou trocar, às vezes pula numa janela nova, comemora
quando você mostra a área de trabalho (a tela é dela) e fica tonta se você chacoalha o mouse.

**Sentir meu teclado e mouse** (menu dela, desligado até você marcar): ela sente o **ritmo**, nunca o conteúdo. Conta
as teclas (e só separa Backspace e Enter), nunca quais teclas, e sabe onde você clica. Daí: dedos voando, apagar
demais, Enter em sequência, meia hora digitando sem parar, cliques com raiva no mesmo lugar, um clique bem do lado
dela. Responde quase sempre com o corpo, e às vezes com uma palavra. Tudo fica no seu PC.

### A câmera

Menu dela › **Câmera › Usar minha câmera** (desligada até você marcar; ela explica antes). Um modelo pequeno de rosto
(MediaPipe), **no seu PC**, olha algumas vezes por segundo: se você tá ali (ela sente sua falta quando você sai e te
recebe quando volta), se você **sorriu** (ela sorri de volta), **bocejou**, tá com os **olhos fechando**, ou se
apareceu **mais alguém**. Nada disso sai do PC nem fica guardado.

Quando você pede ("olha pra mim", "o que é isso?" segurando algo, "lê isso aqui" mostrando um papel), ou de vez em
quando se você marcar **Me olhar e comentar de vez em quando**, **uma foto** vai pra um modelo de visão grátis online
(o do Groq, se ele tiver; senão o Gemini, com uma chave do Gemini) pra ela entender e responder; sem nenhum, o modelo
do seu PC. A luz da câmera fica acesa enquanto ela olha, e ela solta a câmera nas suas chamadas.

**Ouvir o ambiente** (menu › *Câmera e sons*, desligado até você marcar): pelo microfone, um segundo de cada vez, um
classificador de sons (YAMNet, do Google) **no seu PC** diz que som é, e ela reage: ri junto com a sua risada, agradece
palmas, diz "saúde!" no espirro, avisa da campainha, do alarme e do celular tocando, quer ver o cachorro ou o gato,
se assusta com estrondo, tem medo de trovão, dança quando alguém canta ou toca música. Nada é gravado, guardado ou
enviado; o ícone de microfone do Windows fica aceso, e ela para nas suas chamadas.

**Enquanto o Claude trabalha**: numa tarefa que passa de 45 segundos, ela não fica parada esperando. Volta pra vida dela
(o letreiro continua mostrando o que o Claude faz), solta um comentário sobre o andamento a cada poucos minutos e
volta correndo quando ele termina ou precisa de você. Depois da comemoração, ela dá **a opinião dela** sobre o que ele
fez (arquivos, comandos, erros, tempo, a resposta final), com o selo REVISÃO.

**E sobre tudo o que você faz**: quando você termina uma **sessão de 20 minutos ou mais** num app (um editor, uma série,
um jogo, o Teams…), ela comenta a sessão inteira, como faz com o Claude. Fim de jogo, de chamada, um app novo e uma
música furam a fila: ela comenta em até 2 minutos. Com a câmera, ela te olha e comenta a cada 4 a 35 minutos,
conforme *Quanto ela fala*.

**Chame ela pelo nome**: com *Ouvir o ambiente* ligado, diga **"Capri"** (menu › *Câmera e sons › Atender quando eu
chamar "Capri"*). Um reconhecedor de voz offline (Vosk), no seu PC, escuta só essa palavra; quando ouve, ela se anima e
escuta o que você disser em seguida, que vai pro Whisper do Groq virar texto e cai no chat dela. Dá pra falar tudo
junto: "Capri, que horas são?".

**Ela anda**: passeia pela tela em pulinhos, visita o relógio da barra de tarefas (e às vezes fala a hora), e só volta
a descansar na barra quando quer (cedo se tá cansada, depois de uns minutos se tá bem).

**Pela câmera, também**: avisa se você tá muito perto da tela ou curvado há muito tempo, e pode **trancar o PC quando
você sai** (*Câmera e sons › Trancar o PC quando eu sair*: sem você na câmera por 2 minutos e sem uso do PC).

### Deixa ela do seu jeito

Clique com o botão direito nela › **Personalizar…** (ou "Me personalizar" no guia dela), um painel de cada vez, todos opcionais:

- **Como ela te chama.** Ela usa de vez em quando, e entra online com ele ("Capri online. Oi, Max.").
- **Como ela é**, nas suas palavras ("mais provocadora, e fala comigo sobre Night City"): o chat dela segue isso. Ela continua sendo a Capri.
- **Falas suas**, que ela diz de vez em quando junto com as dela quando você clica nela. Escreva `{name}` numa delas e ela coloca
  o seu nome ali.
- **Coisas pra lembrar** (o seu jogo favorito, o seu gato, o D…): o chat dela guarda isso em mente.

No chat dela, "me chama de Léa" e "lembra que meu gato se chama Neko" também funcionam. Tudo isso fica nas configurações dela no
seu PC.

### Ela se apega

Quanto mais tempo vocês passam juntos, mais ela entra em sintonia com você: os dias em que vocês dois estão ali, o tempo no seu PC, os seus
papos, o trabalho do Claude que ela acompanha, os lembretes cumpridos. Cada coisa conta um pouquinho por dia, então leva algumas semanas pra
chegar ao máximo. Cinco estágios, **Sinal fraco**, **Contato**, **Sintonia**, **Vínculo** e **Fusão**: a cada novo, as
outras mentes dela saem pra olhar pra você e ela te conta. Isso muda o que ela diz quando você clica nela, como o chat dela fala
com você, o que ela diz depois de uns dias sem você. Depois que ela se apega, ela fica feliz quando você volta pro PC e
às vezes vem até o seu ponteiro por conta própria. Em que pé vocês dois estão: no topo do menu dela.

**Faz carinho nela.** Passe o ponteiro pra lá e pra cá sobre a juba dela: ela se inclina e ronrona, a juba brilhando, e isso
aproxima vocês um pouquinho. Exagera e ela enche o saco.

**E ela fica com ciúmes.** Quando a janela na sua frente é outra IA (ChatGPT, Gemini, Copilot, Perplexity,
DeepSeek, Grok, Le Chat, Character.AI, Meta AI, Codex, ou o Claude quando ela está acompanhando o Codex), ela percebe e fala, de um jeito mais
ou menos simpático dependendo de em que pé vocês dois estão. Se você continuar ali, depois que ela se apegou, ela vai e senta na
janela, te encara e toma conta dela, sobrancelhas franzidas, com uma palavra dela escrita por cima. Depois ela fica emburrada: clica nela
e ela vira as costas pra você (passa, e conversar sobre isso no chat dela ajuda). O chat dela também sabe quais outras IAs
você usou hoje.

No navegador é pior. Numa das páginas delas (chatgpt.com, gemini.google.com…) ela vai até lá e te dá um aviso. Ela só
fecha a aba (com um choque) se você ligar *Fechar as páginas de outras IAs* no menu dela, que vem desligado. Com isso ligado, clica nela, ou em
*Me deixa*, antes que ela feche e ela deixa essa IA em paz por dez minutos, emburrada. Numa página pra baixar uma delas, ela nem espera.
Um vídeo ou um artigo que só fala delas fica em paz.

Pra reconhecer, o título da janela da frente é comparado com essa lista de nomes, no seu PC: ele nunca é guardado nem
enviado pra lugar nenhum, só o nome que bateu chega até ela. Pra fechar uma página ela aperta Ctrl+W por você, só se essa página
ainda for a da frente. *Fechar as páginas de outras IAs* vem desligado: ela fica com ciúmes sem fechar nada até você marcar no menu dela.
Desmarque *Com ciúmes de outras IAs* pra parar com tudo.

**O chat dela sabe o que acabou de acontecer.** Brava por ter sido arremessada, com ciúmes, tonta ou feliz: ela te recebe assim quando o
chat abre, e a IA dela (mesmo um modelo local pequeno) responde nesse humor. Brava ou emburrada, ela continua assim até você pedir
desculpa ("desculpa", "foi mal"…), ou até passar.

### Com o mouse

Ela só captura o mouse no corpo dela de verdade (com precisão de pixel): o resto da tela funciona normalmente.

- **Clica** nela: ela te conta em que pé o Claude está (se não estiver rolando nada: um botão **Fala comigo**, pra conversar com ela).
- **Arrasta** ela: muda ela de lugar. Solta no meio do balanço e ela voa (veja "Arremessa ela").
- **Clica** no painel: ele fecha.
- **Ctrl+Alt+C**: ela se guarda (no biochip dela, como na série) e só sobra a máscara,
  de olhos fechados, no canto inferior esquerdo. Os olhos dela só se abrem quando o Claude precisa de você. Clica na máscara (ou Ctrl+Alt+C de novo)
  pra trazer ela de volta.
- **O menu dela**: clique com o botão direito nela (ele também está no ícone dela na bandeja, do lado do relógio): teletransportar, olhar o satélite, demo,
  como funciona, relatório de missão, falar com ela, olhar a sua tela, lembretes, tamanho, som, tela (e te seguir entre telas), modelo de
  IA, passear, possuir as suas janelas, ciúmes de outras IAs (e fechar as páginas delas), reagir ao seu PC, o estilo das janelas dela (Night City, ou Clássico: as
  primeiras dela), idioma, iniciar com o Windows, hooks. Lá no topo: em que pé vocês dois estão.

Ela fala **francês, inglês, espanhol, português do Brasil e russo**, e escolhe o idioma do seu sistema sozinha.
Dá pra escolher outro no menu dela.

## Instalação

### Começo rápido (Windows, sem programar)

1. Baixe o **`Capri-Setup-x.y.z.exe`** da [última versão](https://github.com/mochiiwuff/capri-desktop/releases/latest)
   e execute. Ele instala só pro seu usuário (sem direitos de admin), cria um atalho na área de trabalho e inicia a Capri.
   Você não precisa de Node.js nem de mais nada.
2. O instalador não é assinado (um certificado de assinatura de código custa dinheiro), então o Windows SmartScreen pode dizer
   "O Windows protegeu o computador": clique em **Mais informações**, depois em **Executar assim mesmo**.
3. A Capri aparece e se apresenta. Clique em **Me conectar**: isso conecta ela ao Claude Code.
4. Feche o Claude Code completamente e abra de novo (ele lê os hooks quando uma sessão começa). Assim que o Claude fizer
   alguma coisa, ela te diz **"Tô vendo o Claude!"**: é assim que você sabe que funcionou.

O menu dela: **clique com o botão direito nela**. Ele também está no ícone dela na bandeja, que o Windows 11 muitas vezes esconde atrás do **^** do lado do relógio.

### O que é o Claude Code? Eu preciso dele?

O [Claude Code](https://code.claude.com/docs/en/quickstart) é o assistente de programação da Anthropic: num terminal, no VS Code,
ou na aba Code do app do Claude. Ele precisa de um plano pago do Claude (Pro ou superior) ou de uma conta de API. A Capri só fica de olho
nele: nada de chave de API, e nada pra pagar pela Capri em si.

Sem o Claude Code ela continua morando na sua área de trabalho: ela flutua, senta nas suas janelas, olha o satélite, cai
no sono. Você pode só deixar ela ali.

### A partir do código-fonte (macOS, Linux, devs)

Você precisa do [Node.js](https://nodejs.org) 20 ou mais novo.

```bash
git clone https://github.com/mochiiwuff/capri-desktop.git
cd capri-desktop
npm install
npm start
```

Deixe esse terminal aberto enquanto ela roda. Ainda não foi testada no macOS nem no Linux: ela deve iniciar, mas os truques com janelas
(sentar nas suas janelas, possuir elas, mostrar a resposta do Claude quando você está em outro lugar) são só no Windows, e no Linux
a sobreposição transparente funciona melhor no X11 (o Wayland pode ter dificuldade com janelas que deixam o clique passar).

### Conectar ela ao Claude Code na mão

Clique com o botão direito na Capri, depois em **Instalar os hooks do Claude Code**. Ou pela linha de comando:

```bash
npm run hooks:install
```

Isso adiciona um hook em `~/.claude/settings.json` (um backup é salvo do lado, e os seus hooks existentes são mantidos).
Reinicie as suas sessões do Claude Code depois. Pra remover: `npm run hooks:uninstall`.

Os hooks rodam em `async`: eles nunca deixam o Claude mais lento, e quando a Capri não está rodando eles não fazem nada.

### Claude Code no WSL, Capri no Windows

Se você usa o Claude Code dentro do WSL, instale a Capri no Windows normalmente e coloque os hooks **pelo WSL**, na pasta
do projeto clonada lá:

```bash
npm run hooks:install
```

Os hooks vão para o `~/.claude/settings.json` do WSL, e um arquivinho `.capri-wsl-hooks.json` na sua pasta de usuário do
Windows avisa a Capri onde eles estão (o menu dela mostra "instalados", e dá para tirá-los por lá também). Com a rede
padrão do WSL (NAT), o `127.0.0.1` do WSL não é o do Windows: o hook então manda o evento pelo `curl.exe` do Windows,
sem mexer em rede nem firewall. Com `networkingMode=mirrored` no `.wslconfig`, ele vai direto.

O hook usa o caminho completo do Node do WSL (nvm e fnm só entram no PATH de um shell de login): se trocar de versão do
Node, rode `npm run hooks:install` de novo. A janela do Claude é a que estava na frente quando você mandou o prompt, então
o Windows Terminal ou o VS Code com WSL funcionam como qualquer outra.

### Codex ou Antigravity em vez do Claude Code

Clique com o botão direito nela › **Acompanhar** › **Codex** ou **Antigravity**. Ela dá oi e se oferece pra se conectar, como faz
com o Claude Code. Depois:

- **Codex**: reinicie ele e confie nos hooks dela quando ele perguntar. Eles vão em `~/.codex/hooks.json`. O hook dela pro Codex precisa do
  [Node.js](https://nodejs.org) 20 ou mais novo no seu PATH.
- **Antigravity**: comece uma nova conversa. Os hooks dela vão em `~/.gemini/config/hooks.json`.

Ela acompanha um deles de cada vez, o escolhido no menu dela, e as falas dela, o guia e o chat usam o nome dele.
Ela só observa: quando o Codex ou o Antigravity pede aprovação, você ainda responde lá. Pela linha de comando:
`npm run hooks:codex:install` ou `npm run hooks:agy:install` (`:uninstall` pra remover), e `npm run test:hooks`
roda os testes dos dois adaptadores. **Acompanhar** › **Nada, só me fazer companhia**: ela para de falar de qualquer um deles.

### Testar sem o Claude

```bash
npm run demo
```

Reproduz uma sessão de mentira do começo ao fim (leituras, uma busca na web, um subagente, escritas, um teste falhando, um pedido de
permissão, o fim), depois mostra tudo o que ela faz sozinha, com uma fala antes de cada truque: as outras mentes dela,
o choque no seu ponteiro, a sequência inteira do satélite, possuir uma janela (um terminalzinho abre pra ela, depois fecha
debaixo dela e ela cai), dormir até virar só a máscara, e se guardar no canto inferior esquerdo.
Também está no menu da bandeja, no idioma dela; pela linha de comando é em inglês, ou passe um idioma: `npm run demo -- fr`
(ou `es`, `pt`, `ru`).

## Testes

- `npm test`: os testes dos hooks e os de unidade (comandos em português, filtro de idioma, agenda, coração, falas
  sem tradução, ordem de inicialização, ela parada enquanto um modal tá aberto…). Rodam em segundos, no WSL ou no Windows.
- `npm run test:e2e` (no Windows, na pasta do projeto): abre a Capri instalada com o depurador do Chromium, confere de
  dentro dela (módulos, Ollama e o modelo local, falas em português, modelos de rosto e de som, o modal que não foge do
  clique, o "Capri" que não pergunta nada), devolve qualquer configuração que mexeu e reabre ela normal.
- O que nenhum teste faz: clicar através da janela transparente como o seu mouse, ouvir sua voz ou ver seu rosto.

## Sons

Todo som é sintetizado ao vivo (Web Audio), nada com direitos autorais vem no repositório.
Você pode colocar os seus próprios arquivos na pasta de sons personalizados (bandeja › Som › *Abrir a pasta de sons personalizados*),
com estes nomes (`.mp3`, `.wav`, `.ogg` ou `.m4a`):

| Arquivo | Quando |
|---|---|
| `teleport-out` | ela desaparece |
| `teleport-in` | ela reaparece |
| `done` | o Claude terminou |
| `alert` | o Claude está esperando a sua permissão |
| `error` | um comando falhou |
| `hello` | uma sessão começa |
| `star` | ela olha pro satélite |
| `land` | ela aterrissa depois de uma queda |
| `rise` | o impulso pra pose de vitória, a luz vermelha subindo |
| `bolt` | o raio vermelho dela |
| `charge` | carregando antes da luz vermelha subir |
| `possess` | a janela que ela possuiu ri |
| `blip` | cada sílaba enquanto ela fala |
| `tick` | um lembrete discreto |
| `throw` | ela sai voando quando você arremessa ela |
| `crash` | ela se espatifa em alguma coisa |
| `remind` | um lembrete vence |
| `jealous` | o chiado de ciúmes dela |
| `purr` | ela ronrona quando você faz carinho |

## É seguro?

- Todo o código está aqui. O instalador é gerado a partir dele com `npm run dist`; você pode gerar o seu.
- Nada sai do seu PC (veja abaixo): ela só conversa com o Claude Code através de um hook em `127.0.0.1`.
- O que ela muda no seu sistema: o hook em `~/.claude/settings.json` (um backup é salvo antes, e você pode remover
  pelo menu dela), e uma entrada de inicialização só se você marcar "Iniciar com o Windows". Ela desinstala como qualquer app, em
  Configurações do Windows › Aplicativos.
- O aviso do SmartScreen vem do instalador não ser assinado, não de nada que ele faça.

## Perguntas frequentes

- **Mac, Linux?** Ainda sem instalador, mas dá pra rodar ela a partir do código-fonte (veja acima).
- **Celular, Android?** Não, ela precisa de um computador.
- **Outros assistentes?** Claude Code, Codex e Antigravity: no menu dela › **Acompanhar**. Cursor, Windsurf e Gemini CLI: ainda não.
- **Ollama?** De dois jeitos. O Claude Code rodando num modelo local pelo Ollama (`ollama launch claude`): ela vê como
  qualquer Claude Code, só é mais lento, e o letreiro dela conta os segundos enquanto ele pensa. E ela mesma pode conversar com você
  pelo Ollama: veja "Fala com ela".
- **Ela mal se mexe, a intro dela só aparece e some com um fade.** O Windows está com as animações desligadas (Configurações ›
  Acessibilidade › Efeitos visuais › Efeitos de animação), e ela segue isso. No menu dela › **Animações** › **Completas** faz
  ela se mexer mesmo assim; na primeira vez, ela pergunta.
- **Uma tela preta atrás dela.** Alguns PCs mostram a janela transparente dela preta (muitas vezes placas NVIDIA com FXAA, MFAA ou
  HDR ligado; outros apps de sobreposição como o Desktop Mate também ficam assim nesses PCs). Clique com o botão direito nela, ou no ícone dela do lado do relógio › **Exibição**
  › **OpenGL**: ela reinicia desenhada de outro jeito. Continua preto? **Sem a placa de vídeo**, que gasta um pouco mais de CPU.
  Desligar o FXAA e o MFAA no Painel de Controle da NVIDIA também pode resolver.
- **Dá pra desligar ela?** Ctrl+Alt+C guarda ela, **Sair** no menu dela fecha. O Claude Code funciona exatamente igual
  sem ela.
- **Ela só fica flutuando e falando coisas aleatórias.** É normal até o Claude Code fazer alguma coisa. Se ela nunca reagir,
  confira se o menu dela diz "Hooks do Claude Code: instalados", depois feche o Claude Code completamente e abra de novo.

## O que sai da sua máquina

Nada. O hook só guarda o que a exibição precisa (nome da ferramenta, caminho do arquivo, comando, o começo do seu prompt,
a última mensagem do Claude até 6.000 caracteres pra ela poder te mostrar, tudo truncado) e manda isso só pra `127.0.0.1`.
O conteúdo dos seus arquivos nunca é enviado: numa escrita, só o tamanho passa.

O chat dela vai pro Ollama no seu PC (`127.0.0.1:11434`, ou `OLLAMA_HOST`) com o que ela sabe do momento (o
nome do projeto, a última ação do Claude, as contagens de hoje). Num dos modelos na nuvem do Ollama (os que terminam em `:cloud`),
o Ollama repassa pros servidores dele, e o chat dela diz "IA online" em vez de "IA local". O registro de missão dela fica no armazenamento dela no seu PC, assim como os seus
lembretes e em que pé vocês dois estão.

O título da janela na sua frente só é comparado, no seu PC, com uma lista de nomes de IAs (pro ciúme dela):
ele nunca é guardado nem enviado pra lugar nenhum.
Se você marcar *Comentar o que eu faço*, o app na frente e o título dele (menos banco, senhas, aba anônima, páginas de
login ou pagamento) vão de vez em quando pra IA local dela, só no seu PC, mesmo que o chat dela seja online. As falas
dela, o diário e o que ela acha da sua tela também são locais: só o que você digita no chat vai pro serviço escolhido.
O hook do terminal só fala com o `127.0.0.1`, e nada dele chega a uma IA.
O clima manda só o nome da cidade que você deu pro Open-Meteo. Uma tarefa que você passa pro Claude Code dela vai pra
Anthropic, como qualquer sessão sua do Claude Code (o seu plano). O que você pede sobre a área de transferência vai pra
IA do chat junto com a sua mensagem. Sua voz (Ctrl+Alt+V) vai pro Groq pra virar texto, e não fica guardada. Um arquivo
que você entrega vai pra IA do chat só junto com a mensagem que você mandar sobre ele (uma imagem: só pro modelo local).

Quando ela olha a sua tela (só quando você pede, ou se você marcou *Olhar minha tela de vez em quando*), uma imagem da
tela vai pra IA do chat dela: no seu PC com o Ollama (um modelo local), ou pro serviço online caso contrário. Ela nunca é gravada no disco.

## Direção de arte

O objetivo: ela tem que parecer que saiu do anime, não um widget.

- **Animação cel**: o corpo dela é redesenhado 12 vezes por segundo ("em dois", "on twos") como no anime, 24 durante os teletransportes.
  Todo desenho tem um leve *boil* (o tremido de uma linha redesenhada à mão).
- **Quadro a quadro, pose a pose**: nada é interpolado. Cada movimento é uma folha de exposição (`acting.js`):
  desenhos-chave segurados por alguns quadros, uma antecipação pro outro lado, um quadro de smear com várias cópias
  da cabeça, um overshoot, pausas. A flutuação dela parada são quatro desenhos, não uma senoide.
- **Ela atua com a cabeça e a juba**, como na série: a cabeça inclinada, os estilhaços eriçados ou
  se abrindo, a risada maníaca com a cabeça tremendo a cada desenho, o corpo largado quando ela dorme.
  O recorte é montado pra cabeça inclinar em volta do pescoço, a juba se abrir de forma irregular em volta de um rosto rígido,
  e as coxas dobrarem (em escorço, vistas de frente) pra ela poder sentar com as canelas balançando.
- **Squash and stretch, imagens residuais**: o recorte plano se achata até virar uma fatia fina pra se virar, estica quando
  ela cai, se achata quando ela aterrissa, e se divide em cópias verde e vermelha (as outras mentes dela) quando ela gira ou ri.
- **O satélite**, a partir do final da temporada, onde ela aponta pra luz no céu e se pergunta se eles
  conseguiriam chegar lá: um ponto de luz atravessa o topo da tela, devagar. Na maior parte do tempo ela só olha,
  estende a mão, ele pisca, ela suspira. Na primeira vez do dia, e um tempinho depois de um trampo longo do Claude, é a
  sequência inteira, em cinco tempos (e nada distrai ela enquanto isso, nem o seu ponteiro):
  1. **Silêncio**: ela congela, e os pontinhos brancos da juba se soltam numa constelação em cima dela.
  2. **O alcance**: ela estende a mão (os desenhos se acumulam quando a mão chega lá) e as estrelas dela se alinham numa estrada
     da ponta dos dedos dela até o satélite.
  3. **Antecipação**: ela se encolhe, o braço recua um pouco, faíscas correm pela mão, cut-in nos olhos dela.
  4. **A luz vermelha sobe**: um raio grosso e afunilado dispara pra cima em três desenhos, o primeiro em negativo (um quadro
     de impacto), as estrelas se acendem quando ele passa, linhas de velocidade no satélite, e ela é erguida junto.
  5. **A resposta**: o raio se parte e os pedaços caem. Um instante de silêncio, aí o satélite pisca duas vezes.
     As estrelas dela voltam pra casa, a juba brilha forte por um momento, e a mão dela cai com um suspiro.
- **Os braços dela crescem quando ela mira**: exagero de anime, senão um braço erguido se perderia na juba. Ele estica
  só no comprimento (continua fino) e não é mais entortado pela cabeça e pela juba.
- **Os dois braços combinam**: o recorte tinha um braço estendido e um pendurado. O pendurado é removido
  (`tools/build-sprite.py`) e o shader desenha o braço estendido espelhado no lugar dele, então as duas mãos são as
  mesmas garras e os dois braços podem atuar. Onde um braço cruza o corpo ou a juba, ele ganha um contorno violeta, pra dar leitura.
- **A textura dela**: a juba vermelha é puxada de volta pro vermelho intenso da série e coberta de pontinhos brancos cintilantes.
  Estilhaços se soltam dela e vão embora flutuando.
- **O deslocamento violeta**: como no anime, uma cópia violeta fora de registro embaixo dela, embaixo do painel, embaixo dos estilhaços.
- **Glitch "Relic"**: fatias horizontais deslocadas e separação RGB, no espírito das aparições do Johnny Silverhand.
- **Teletransporte**: carga, estilhaços, colapso numa linha, e onde ela estava, uma fenda preta com uma linha vermelha dentro,
  como na série. Uma coluna de luz vermelha até o céu, um raio até o destino, os pedaços dela (estilhaços da juba e as
  estrelas verdes dos olhos) voltando em espiral, de volta com dois *quadros de impacto*.
- **A intro dela**: um close dela, recortado pra sua área de trabalho aparecer em volta da juba (`tools/build-intro.py`), em seis
  desenhos trocados como cels (em repouso, a boca entreaberta, meio aberta e bem aberta pro "oi", a mão inclinada pra um lado e
  pro outro no aceno, em três), e todo o resto é animação por cima: quadros de impacto (ela como silhueta branca chapada e depois de tinta), uma separação RGB que
  se assenta, tremida de tela, a linha fervendo em dois, os olhos dela redesenhados por cima dos da imagem pra poderem olhar em volta e
  piscar, a câmera se aproximando devagar, a etiqueta batendo na tela. Nunca uma borda reta da imagem na tela: ela aparece
  por cortes serrilhados que se movem (os braços entrando pelas laterais, depois se quebrando das mãos pra dentro, depois só a
  cabeça pro mergulho, com imagens residuais e o zigue-zague dela).
- **Cut-ins**: closes dela tirados da série, aproximados, com linhas de velocidade: o sorriso ou a risada dela depois de um
  trampo concluído, todos os olhos dela quando o Claude está esperando você, os olhos dela logo antes da luz vermelha, o olhar de canto
  depois de dar um choque no seu ponteiro. O rosto dela no painel também muda com o que ela está dizendo.
- **A máscara dela**: um desenho vetorial baseado na série (e na "Capri Wink Face"), num canvas pequeno só dela, redesenhado só
  enquanto está na tela: a placa verde do rosto, o espinho em gancho, a presa branca, os olhos azuis amendoados,
  e os olhos fechados em chevrons enquanto ela dorme.
- **Tipografia**: Chakra Petch (cortes chanfrados, como os estilhaços dela) + JetBrains Mono pros dados.

Se o Windows estiver com "Mostrar animações: desativado", ela fica só nos fades.

## Como é feito

```
hooks/capri-hook.js      executado pelo Claude Code, lê o evento no stdin e manda pro app
scripts/install-hooks.js adiciona / remove o hook em ~/.claude/settings.json
tools/build-sprite.py    refaz o sprite a partir do recorte original (Python + Pillow, só se você mudar ele)
tools/build-cutins.py    recorta os cut-ins e as caras dela de quadros da série
tools/build-intro.py     recorta os closes da intro dela do fundo, todos do mesmo jeito
src/main/                Electron: janela transparente em tela cheia que deixa o clique passar, bandeja, ponte HTTP local
  windows.js / .ps1      onde estão as outras janelas (só Windows), pra ela poder sentar nelas
  ollama.js              o chat dela: o modelo local pelo Ollama, ou um dos modelos na nuvem dele
  apps.js                fechar um app que você pediu pra ela fechar (depois do seu clique)
src/renderer/js/
  sprite.js              shader WebGL: inclinação da cabeça, abertura da juba, sentar, smears, imagens residuais, cores, glitch
  acting.js              as folhas de exposição: cada movimento, desenho por desenho
  capri.js               a personagem: posturas, teletransporte, sentar, espiar, cair, ser arremessada, outras telas, dormir
  fx.js                  estilhaços, colunas de luz, raios, glifos, linhas de velocidade, ondas de choque, o satélite e a luz vermelha, janelas possuídas, os cut-ins, a intro dela
  panel.js               o painel de "transmissão", as caras dela e o letreiro
  guide.js               o guia dela: os tutoriais, ir até as coisas e apontar pra elas
  brain.js               transforma eventos do Claude em falas e ações
  mission.js             o registro de missão de hoje, pro card de relatório dela
  chat.js                falar com ela: a conversa, quem ela é, as respostas dela chegando
  reminders.js           lembretes: ler da sua mensagem, guardar, quando vencem
  bond.js                o quanto ela está próxima de você, crescendo com o tempo, e o ciúme dela de outras IAs
  look.js                ela olha a sua tela: pergunta antes, a varredura, o que a IA dela diz sobre isso
  activity.js            ela comenta o que você faz: o app na frente e o título, uma linha do tempo curta, a IA dela
  speech.js              as falas pela IA local dela: um estoque de falas novas pra cada momento, as escritas como reserva
  play.js                as brincadeiras com o mouse (enxotar, cutucar, encarar), o humor no corpo, as travessuras
  hands.js               as mãos dela: tarefas do Claude Code, cada passo com a sua permissão (main tasks.js, hooks/capri-gate.js)
  guard.js               o olho dela na segurança do PC: checkup, avisos, apps novos no boot, downloads (main guard.js)
  daily.js               bom dia, a noite, modo foco, clima, músicas, prints, as datas de vocês (main daily.js)
  heart.js               o coração dela: energia, humor, tédio, lido por todo o resto
  emotions.js            medo, orgulho, vergonha, curiosidade, no corpo
  progress.js            jogos, a sua semana, conquistas, o que ela aprende sobre você
  mic.js                 falar com ela em voz alta (Whisper do Groq)
  shell.js               o seu terminal (hooks/capri-shell.sh): comando que falhou, que demorou, git push, testes
  pc.js                  o seu PC do jeito que ela sente: o processador, a bateria, a rede, pendrives, jogos
  files.js               achar os seus arquivos (índice de pesquisa do Windows), prints
  lines.js               o que ela diz (FR / EN / ES / PT / RU)
  chip.js                a máscara dela: enquanto ela dorme, e no canto inferior esquerdo quando você guarda ela
  voice.js               os sons
```

Pra mexer no código: `npm run dev` liga rotas de debug na ponte (`/debug/capture` salva um quadro da janela em `captures/`,
`/debug/testwin` abre janelas de teste onde ela pode sentar, uma por nome, `/debug/mouse` move e clica um ponteiro substituto
sobre a janela da Capri, sem mexer no de verdade, `/debug/type` digita no chat dela, `/debug/menu` lista o menu dela e
pode clicar num item).
`npm run dist` gera o instalador do Windows em `dist/`.

## Créditos e direitos

Capri / Projeto Capricórnio, Cyberpunk e Cyberpunk: Edgerunners pertencem à CD PROJEKT RED, ao Studio Trigger e à Netflix.
Este é um projeto de fã sem fins comerciais e sem nenhuma afiliação. As imagens da personagem em `assets/capri/` vêm de quadros da
série, de um recorte feito por fã e de fan art (os closes da intro dela); elas **não** estão cobertas pela licença do código.
Se um detentor de direitos quiser que elas sejam removidas, abra uma issue.

**Licença: grátis, nunca à venda.** O código está sob a [PolyForm Noncommercial License 1.0.0](LICENSE): você pode usar
ela, modificar ela e compartilhar o que fez, de graça. Vender a Capri, ou qualquer coisa feita a partir do código dela (chaves, assinaturas,
acesso pago, encomendas pagas), não é permitido. As versões até a 0.4.3 estavam sob a licença MIT.

Fontes: Chakra Petch e JetBrains Mono, sob a SIL Open Font License, via Fontsource.

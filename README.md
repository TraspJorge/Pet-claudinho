# Pet-claudinho

Mod do Claude Code: um mini Claude que fica acima do prompt e representa os agentes.

![demo](claudinho-demo.gif)

Cada agente (o principal e os subagentes) ganha uma trilha e uma cor própria. O bichinho:

- anda e carrega blocos até o montinho conforme as tarefas avançam;
- pensa quando chega raciocínio e dorme (zzz) quando o agente fica parado;
- tropeça quando uma ferramenta dá erro e espera quando pede permissão;
- comemora no fim do pedido, contempla o montinho pronto e se despede quando um subagente termina;
- chicoteia o robô de outra IA, quando outra IA está em ação.

## Situações

Cada agente tem uma destas situações a cada momento.

| | Situação | O que significa |
| --- | --- | --- |
| <img src="docs/estados/andando.svg" width="160" alt="Andando"> | **Andando** | Tem tarefa pronta para entregar: pega um bloco, leva até o montinho à esquerda e volta para a mina. As pernas se alternam a cada passo. |
| <img src="docs/estados/minerando.svg" width="160" alt="Minerando"> | **Minerando** | Está na mina (o estoque, à direita) trabalhando numa tarefa. A picareta bate e saltam faíscas; com 3 ou mais coisas ao mesmo tempo ela bate mais rápido. |
| <img src="docs/estados/pensando.svg" width="160" alt="Pensando"> | **Pensando** | Chegou raciocínio ou uma ferramenta de leitura está rodando (Read, Grep, Glob, WebSearch, WebFetch). Senta com o punho no queixo, como O Pensador, e as reticências acendem uma a uma. |
| <img src="docs/estados/esperando.svg" width="160" alt="Esperando permissão"> | **Esperando permissão** | Pediu permissão e você ainda não respondeu. Levanta a mão e uma exclamação amarela pisca. Só aparece depois de 1 s, para o que é liberado sozinho não piscar. |
| <img src="docs/estados/tropecando.svg" width="160" alt="Tropeçando"> | **Tropeçando** | Uma ferramenta deu erro. Cai inclinado, com olhos em X e estrelas girando por 1,6 s. |
| <img src="docs/estados/comemorando.svg" width="160" alt="Comemorando"> | **Comemorando** | O pedido terminou. Pula de braços para cima, com confete, por 1,8 s. |
| <img src="docs/estados/contemplando.svg" width="160" alt="Contemplando"> | **Contemplando** | Todas as tarefas foram entregues e o montinho ficou pronto. Olhos felizes e dois brilhos piscando. |
| <img src="docs/estados/despedindo.svg" width="160" alt="Despedindo"> | **Despedindo** | Um subagente terminou. Acena por 1,2 s, dá um pulinho e cai para baixo do chão, saindo da cena. |
| <img src="docs/estados/chicoteando.svg" width="160" alt="Chicoteando outra IA"> | **Chicoteando outra IA** | O Claude chamou outra IA (um MCP ou comando como codex, gemini, ollama, aider). Um robozinho aparece e leva a chicotada; no estalo ele encolhe com olhos > < e a antena fica vermelha. |
| <img src="docs/estados/dormindo.svg" width="160" alt="Dormindo"> | **Dormindo** | Ficou 20 s parado sem fazer nada. Respira devagar, de olhos fechados, com os zzz subindo. |
| <img src="docs/estados/parado.svg" width="160" alt="Parado"> | **Parado** | Acabou de ficar ocioso, antes de adormecer. De pé, esperando o próximo pedido. |

As imagens são animadas e ficam em `docs/estados/`. São geradas por `python3 docs/gerar_estados.py`, que reproduz os quadros e o ritmo do desenho do `hooks/register.tsx`.

## Instalação

```bash
git clone https://github.com/TraspJorge/Pet-claudinho.git
claude plugin marketplace add ./Pet-claudinho
claude plugin install claudinho@claudinho-local
```

Abra uma sessão nova do Claude Code depois de instalar.

## Comando `/claudinho`

| Uso | Efeito |
| --- | --- |
| `/claudinho` | Esconde ou mostra os bichinhos |
| `/claudinho zerar` | Recomeça os montinhos |
| `/claudinho demo` | Demonstração de 45 s com 4 agentes de mentira, sem custo |
| `/claudinho cor azul` | Muda a cor do principal: laranja, verde, azul, roxo, rosa ou amarelo (`cor padrão` volta ao laranja) |

O comando não aparece na lista de comandos, mas funciona se digitado inteiro.

## Desenvolvimento

```bash
claude plugin validate .
```

O estado compartilhado entre os ganchos está descrito em `types/index.d.ts`.

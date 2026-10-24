# Pet-claudinho

Mod do Claude Code: um mini Claude que fica acima do prompt e representa os agentes.

![demo](claudinho-demo.gif)

Cada agente (o principal e os subagentes) ganha uma trilha e uma cor própria. O bichinho:

- anda e carrega blocos até o montinho conforme as tarefas avançam;
- pensa quando chega raciocínio e dorme (zzz) quando o agente fica parado;
- tropeça quando uma ferramenta dá erro e espera quando pede permissão;
- comemora no fim do pedido, contempla o montinho pronto e se despede quando um subagente termina;
- chicoteia o robô de outra IA, quando outra IA está em ação.

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

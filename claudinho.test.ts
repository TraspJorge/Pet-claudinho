import { expect, mock, test } from 'claude-code/testing'

type Corpo = Parameters<Parameters<typeof test>[1]>[0]
type Registrar = Parameters<Parameters<typeof test>[1]>[1]

// Resposta fixa de uma requisição ao modelo
const resposta = (turnId: string, index: number) => ({
  turnId,
  index,
  answer: '',
  toolUses: [],
  stopReason: 'end_turn' as const,
  usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 5, cache_creation_input_tokens: 1, model: 'claude-teste-1' },
})

// Percorre o fluxo de uma requisição até o fim
const executar = async (stream: AsyncGenerator<unknown, unknown>) => {
  for await (const _ of stream) {
    // só consome os pedaços
  }
}

// Subagentes da sessão no teste
const SUBS = {
  um: { id: 'sub1', description: 'revisar o ETL', type: 'Explore', status: 'running' as const },
  dois: { id: 'sub2', description: 'montar o zip', type: 'general-purpose', status: 'completed' as const },
}

// O general-purpose trabalhando (em SUBS ele já terminou)
const DOIS_TRABALHANDO = { ...SUBS.dois, status: 'running' as const }

// Parte de baixo da corrente: relógio simulado, lista de agentes, requisição e ferramentas; devolve o relógio
const simular = (
  on: Registrar,
  subagentes: (typeof SUBS)[keyof typeof SUBS][] = [SUBS.um],
  comRequisicao = true,
  ferramenta: Record<string, unknown> = { result: {}, text: 'ok' },
) => {
  const relogio = mock.clock(on, { now: 1_000_000 })
  on('agent.list', async () => ({ value: subagentes }))
  if (comRequisicao) {
    on('turn.step', async function* (_$, e) {
      return resposta(e.turnId, e.index)
    })
  }
  on('tool.call', async () => ferramenta as never)

  return relogio
}

const passo = (agentId?: string, index = 0) => ({
  turnId: 't1',
  index,
  model: 'm',
  messageCount: 1,
  ...(agentId ? { agentId } : {}),
})

// Lista de tarefas do Claude Code: concluídas e pendentes
const todos = (feitas: number, pendentes: number) => [
  ...Array.from({ length: feitas }, (_, i) => ({ content: `feita ${i}`, status: 'completed', activeForm: 'fazendo' })),
  ...Array.from({ length: pendentes }, (_, i) => ({ content: `pendente ${i}`, status: 'pending', activeForm: 'fazendo' })),
]
const escreverLista = ($: Corpo, feitas: number, pendentes: number) =>
  $.tool.call({ tool: 'TodoWrite', tool_use_id: 'todo', todos: todos(feitas, pendentes) } as never)
const chamarFerramenta = ($: Corpo, id: string) => $.tool.call({ tool: 'Bash', tool_use_id: id, command: 'ls' } as never)

// Monta a faixa acima do prompt numa tela
const montarFaixa = ($: Corpo, surface: 'terminal' | 'vscode' | 'desktop' = 'vscode', isWorking = true) =>
  $.ui.mount({
    plugin: 'claudinho',
    surface,
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking, maxRows: 10, bodyColumns: 100 } as never,
  })

// O desenho inteiro da cena: um só, com todos os agentes
const cenaDe = async (faixa: Awaited<ReturnType<typeof montarFaixa>>) =>
  String((await faixa.findAll({ type: 'Svg' }))[0]?.props.source)

// O trecho do desenho que é o bichinho de um agente, pelo nome gravado nele
const bichoDe = async (faixa: Awaited<ReturnType<typeof montarFaixa>>, nome: string) => {
  const svg = await cenaDe(faixa)
  const inicio = svg.indexOf(`data-agente="${nome}"`)

  return inicio < 0 ? 'undefined' : svg.slice(inicio, svg.indexOf('<!--/agente-->', inicio))
}

// Lê um atributo data-* do desenho do bichinho
const atributo = (svg: string, nome: string) => new RegExp(`data-${nome}="([^"]*)"`).exec(svg)?.[1]
const numero = (svg: string, nome: string) => Number(atributo(svg, nome))

// Como está o bichinho principal agora
const olhar = async ($: Corpo, isWorking = true) => {
  const faixa = await montarFaixa($, 'vscode', isWorking)
  const svg = await bichoDe(faixa, 'Principal')
  await faixa.unmount()

  return svg
}

test('sem dados mostra o bichinho principal com o montinho vazio', async ($, on) => {
  simular(on, [])
  const faixa = await montarFaixa($)

  const desenhos = await faixa.findAll({ type: 'Svg' })
  expect(desenhos).toHaveLength(1)
  expect(String(desenhos[0].props.alt)).toContain('0 de 0 tarefas no montinho')
  expect(await bichoDe(faixa, 'Principal')).not.toBe('undefined')
})

test('desenha todos os agentes num desenho só, sem barra de progresso, texto nem botões', async ($, on) => {
  simular(on)
  await executar($.turn.step(passo()))
  await executar($.turn.step(passo('sub1')))
  const faixa = await montarFaixa($)

  // Um desenho só, com os dois agentes (principal e Explore); nada de texto, resumo ou botões
  const desenhos = await faixa.findAll({ type: 'Svg' })
  expect(desenhos).toHaveLength(1)
  const cena = await cenaDe(faixa)
  expect(cena.match(/data-agente=/g)).toHaveLength(2)
  expect(cena).not.toContain('<text')
  expect(String(desenhos[0].props.alt)).not.toContain('Agentes')
  expect(await faixa.findAll({ type: 'Button' })).toHaveLength(0)
})

test('sem tarefa para levar vai ao estoque e fica lá minerando, sem passear de um lado para o outro', async ($, on) => {
  const relogio = simular(on, [])
  await executar($.turn.step(passo()))

  // Com 100 colunas a ida ao estoque leva uns 6 s
  await relogio.advance(3000)
  const indo = await olhar($)
  await relogio.advance(5000)
  const naMina = await olhar($)
  await relogio.advance(8000)
  const aindaNaMina = await olhar($)

  expect(atributo(indo, 'estado')).toBe('andando')
  expect(atributo(indo, 'sentido')).toBe('direita')
  // Chegou ao estoque e ficou: minerando, no mesmo lugar, sem voltar nem passear
  expect(atributo(naMina, 'estado')).toBe('minerando')
  expect(atributo(naMina, 'p')).toBe('1.000')
  expect(atributo(aindaNaMina, 'estado')).toBe('minerando')
  expect(atributo(aindaNaMina, 'p')).toBe('1.000')
  expect(atributo(aindaNaMina, 'sentido')).toBe('direita')
  expect(aindaNaMina).toContain('class="picareta"')
})

test('minerando, a picareta vai para trás e bate para a frente, com faíscas na batida', async ($, on) => {
  const relogio = simular(on, [])
  await executar($.turn.step(passo()))
  await relogio.advance(8000)

  const angulo = (svg: string) => Number(/rotate\((-?\d+) 26 22\)/.exec(svg)?.[1])
  const quadros: string[] = []
  for (let i = 0; i < 4; i++) {
    await relogio.advance(300)
    quadros.push(await olhar($))
  }
  const angulos = quadros.map(angulo)

  // Alterna entre o balanço para trás (negativo) e a batida para a frente (positivo)
  expect(new Set(angulos.map(a => Math.sign(a))).size).toBe(2)
  // As faíscas aparecem só na batida
  expect(quadros.filter(q => q.includes('fill="#f5c542"')).length).toBeGreaterThan(0)
  expect(quadros.filter(q => !q.includes('fill="#f5c542"')).length).toBeGreaterThan(0)
  expect(quadros.every(q => !q.includes('<text'))).toBe(true)
})

test('quando uma tarefa fica pronta ele pega o bloco na mina, leva ao quadradinho e volta a minerar', async ($, on) => {
  const relogio = simular(on, [])
  await executar($.turn.step(passo()))
  await escreverLista($, 0, 2)
  await relogio.advance(8000)
  expect(atributo(await olhar($), 'estado')).toBe('minerando')

  // Uma tarefa fica pronta: pega o bloco na hora e sai da mina carregando
  await escreverLista($, 1, 1)
  await relogio.advance(600)
  const saindo = await olhar($)
  expect(atributo(saindo, 'carregando')).toBe('true')
  expect(atributo(saindo, 'sentido')).toBe('esquerda')

  // Deposita no quadradinho, à esquerda
  await relogio.advance(7000)
  const entregou = await olhar($)
  expect(atributo(entregou, 'levadas')).toBe('1')
  expect(atributo(entregou, 'carregando')).toBe('false')

  // E volta para a mina, para continuar minerando a outra tarefa
  await relogio.advance(7000)
  const devolta = await olhar($)
  expect(atributo(devolta, 'p')).toBe('1.000')
  expect(atributo(devolta, 'estado')).toBe('minerando')
  expect(atributo(devolta, 'levadas')).toBe('1')
})

test('pega no estoque um bloco de tarefa concluída, leva e põe no montinho do chão', async ($, on) => {
  const relogio = simular(on, [])
  await executar($.turn.step(passo()))
  // Três tarefas, uma concluída: dois blocos ficam esperando no chão e um é levado
  await escreverLista($, 1, 2)

  expect(atributo(await olhar($), 'chao')).toBe('3')

  // Vai ao estoque, à direita, e pega o bloco
  await relogio.advance(6500)
  const pegou = await olhar($)
  expect(atributo(pegou, 'carregando')).toBe('true')
  expect(atributo(pegou, 'sentido')).toBe('esquerda')
  expect(atributo(pegou, 'chao')).toBe('2')

  // Volta ao montinho, à esquerda, e põe o bloco no chão
  await relogio.advance(7000)
  const depositou = await olhar($)
  expect(atributo(depositou, 'levadas')).toBe('1')
  expect(atributo(depositou, 'carregando')).toBe('false')
  expect(atributo(depositou, 'chao')).toBe('2')
  expect(depositou).not.toContain('<text')
})

test('sem lista de tarefas, cada chamada de ferramenta é uma tarefa e vai para o montinho', async ($, on) => {
  const relogio = simular(on, [])
  await executar($.turn.step(passo()))
  await chamarFerramenta($, 'a')
  await chamarFerramenta($, 'b')

  expect(atributo(await olhar($), 'chao')).toBe('2')

  // Duas viagens completas
  await relogio.advance(26_000)
  const depois = await olhar($)
  expect(atributo(depois, 'levadas')).toBe('2')
  expect(atributo(depois, 'chao')).toBe('0')
  expect(depois).not.toContain('<text')
})

test('quando o agente usa a lista de tarefas, as chamadas de ferramenta deixam de contar', async ($, on) => {
  simular(on, [])
  await executar($.turn.step(passo()))
  await escreverLista($, 0, 2)
  await chamarFerramenta($, 'a')
  await chamarFerramenta($, 'b')
  await chamarFerramenta($, 'c')

  expect(atributo(await olhar($), 'chao')).toBe('2')
  expect(await olhar($)).not.toContain('<text')
})

test('sentado enquanto raciocina e fica exatamente onde estava; ao escrever volta a andar dali', async ($, on) => {
  const relogio = simular(on, [], false)
  let sentado = ''
  let sentadoDepois = ''
  let andando = ''
  on('turn.step', async function* (_$, e) {
    await relogio.advance(2000)
    // Chega raciocínio: o agente senta onde estava
    yield { kind: 'thinking' as const, index: 0, text: 'hmm' }
    sentado = await olhar($)
    await relogio.advance(2000)
    sentadoDepois = await olhar($)

    // Chega texto: o agente escreve e volta a andar
    yield { kind: 'text' as const, index: 1, text: 'pronto' }
    await relogio.advance(1000)
    andando = await olhar($)

    return resposta(e.turnId, e.index)
  })

  await executar($.turn.step(passo()))

  // Pose do Pensador, com as reticências, e sem se mover enquanto pensa
  expect(atributo(sentado, 'estado')).toBe('pensando')
  expect(sentado).toContain('opacity=')
  expect(numero(sentado, 'p')).toBeGreaterThan(0)
  expect(atributo(sentadoDepois, 'p')).toBe(atributo(sentado, 'p'))
  // Escrevendo, anda de novo a partir de onde parou
  expect(atributo(andando, 'estado')).toBe('andando')
  expect(numero(andando, 'p')).toBeGreaterThan(numero(sentado, 'p'))
})

test('quando ninguém trabalha mais o relógio desliga e o bichinho fica parado', async ($, on) => {
  const relogio = simular(on, [SUBS.dois])
  on('turn.complete', async () => ({ text: '' }))
  await executar($.turn.step(passo()))
  await relogio.advance(2000)

  // O turno do principal termina: ninguém mais trabalha
  await $.turn.complete({ turnId: 't1', answer: 'fim' } as never)
  await relogio.advance(3000) // passada a comemoração
  const parado = await olhar($, false)
  await relogio.advance(5000)

  expect(atributo(parado, 'estado')).toBe('parado')
  expect(atributo(await olhar($, false), 'p')).toBe(atributo(parado, 'p'))
})

test('cada agente ganha um bichinho de cor própria, mesmo antes de responder', async ($, on) => {
  simular(on, [SUBS.um, DOIS_TRABALHANDO])
  // O motor avisa quando um agente nasce; só o principal respondeu até agora
  on('agent.spawn', async () => ({ model: 'claude-teste-1' }))
  await executar($.turn.step(passo()))
  await $.agent.spawn({ prompt: 'revisar', subagentType: 'Explore', description: 'revisar o ETL' } as never)

  const faixa = await montarFaixa($)
  const principal = await bichoDe(faixa, 'Principal')
  const um = await bichoDe(faixa, 'Explore: revisar o ETL')
  const dois = await bichoDe(faixa, 'general-purpose: montar o zip')

  // O principal é laranja; os subagentes, de outras cores, na ordem em que apareceram
  expect(principal).toContain('fill="#D97757"')
  expect(um).toContain('fill="#5fbf8f"')
  expect(dois).toContain('fill="#5aa9e6"')
  expect(um).not.toContain('fill="#D97757"')
})

test('no terminal desenha uma linha só, com um bichinho por agente e sem nenhum nome nem número', async ($, on) => {
  simular(on)
  await executar($.turn.step(passo()))
  await executar($.turn.step(passo('sub1')))
  await escreverLista($, 0, 3)
  const faixa = await montarFaixa($, 'terminal', true)

  // Os dois bichinhos (principal e Explore) juntos, depois o montinho vazio e os 3 blocos do estoque
  expect(await faixa.find({ type: 'Text', text: /^▟██▙ ▟██▙ │\s+·\s+░░░/ })).toBeDefined()
  // Nada de nome, contagem ou estado escritos
  expect(await faixa.find({ type: 'Text', text: /Principal|Explore|pensando|›››|\d\/\d/ })).toBeUndefined()
})

test('o comando esconde e mostra os bichinhos e recomeça os montinhos', async ($, on) => {
  simular(on, [])
  await executar($.turn.step(passo()))
  await escreverLista($, 0, 4)
  const comando = (args: string) => $.command.run({ command: 'claudinho', args, origin: { kind: 'composer' } } as never)

  expect(atributo(await olhar($), 'chao')).toBe('4')
  await comando('zerar')
  expect(atributo(await olhar($), 'chao')).toBe('0')

  // O mesmo comando alterna entre esconder e mostrar
  expect(JSON.stringify(await comando(''))).toContain('Bichinhos escondidos.')
  expect(JSON.stringify(await comando(''))).toContain('Bichinhos de volta.')
})

test('o estoque é cinza, o bloco ganha a cor do agente ao ser entregue e cada bichinho só tem a cor dele', async ($, on) => {
  const relogio = simular(on, [SUBS.um, SUBS.dois])
  await executar($.turn.step(passo()))
  await executar($.turn.step(passo('sub1')))
  await executar($.turn.step(passo('sub2')))
  // O principal tem 3 tarefas e o Explore tem 2; o general-purpose não tem nenhuma
  await escreverLista($, 1, 2)
  await $.tool.call({ tool: 'TodoWrite', tool_use_id: 'todo2', agentId: 'sub1', todos: todos(1, 1) } as never)
  await relogio.advance(14_000)

  const faixa = await montarFaixa($)
  const cena = await cenaDe(faixa)
  const principal = await bichoDe(faixa, 'Principal')
  const um = await bichoDe(faixa, 'Explore: revisar o ETL')

  // O estoque no chão é neutro: nenhum bloco dele tem cor de agente
  expect(cena).toContain('class="s"')
  expect(cena).not.toContain('opacity="0.55"')
  // Os blocos entregues viraram a cor de quem os levou, cada um no seu quadradinho
  expect(cena).toContain('fill="#D97757" opacity="1"')
  expect(cena).toContain('fill="#5fbf8f" opacity="1"')
  // Cada bichinho usa só a cor dele
  expect(principal).toContain('#D97757')
  expect(principal).not.toContain('#5fbf8f')
  expect(um).toContain('#5fbf8f')
  expect(um).not.toContain('#D97757')
})

test('o bloco levado na cabeça já tem a cor do agente e o estoque continua neutro', async ($, on) => {
  const relogio = simular(on, [])
  await executar($.turn.step(passo()))
  await escreverLista($, 1, 1)
  await relogio.advance(6500)

  const faixa = await montarFaixa($)
  const principal = await bichoDe(faixa, 'Principal')
  const cena = await cenaDe(faixa)

  // Com o bloco na cabeça: a cor do agente aparece no bichinho; no chão resta só o bloco pendente, em cinza
  expect(atributo(principal, 'carregando')).toBe('true')
  expect(principal).toContain('fill="#D97757" opacity="1"')
  expect(cena.match(/class="s" x=/g)).toHaveLength(1)
})

test('cada agente monta o seu quadradinho arrumado: 1, 4, 9... sem espalhar nem mudar blocos de lugar', async ($, on) => {
  const relogio = simular(on, [])
  await executar($.turn.step(passo()))
  await escreverLista($, 4, 0)
  // Quatro viagens completas
  await relogio.advance(52_000)

  const cena = await cenaDe(await montarFaixa($))
  const bloco = (x: number, y: number) => `<rect x="${x}" y="${y}" width="6" height="6" rx="1" fill="#D97757" opacity="1"/>`

  // 2x2: a base à esquerda, a segunda coluna subindo e a linha de cima fechando o quadrado
  expect(cena).toContain(bloco(6, 32))
  expect(cena).toContain(bloco(13, 32))
  expect(cena).toContain(bloco(13, 25))
  expect(cena).toContain(bloco(6, 25))
  // E nada além dos quatro blocos entregues (os de cor opaca)
  expect(cena.match(/opacity="1"\/>/g)?.length).toBe(4)
})

test('cada pedido novo zera os montinhos e as posições; comando com barra não apaga nada', async ($, on) => {
  const relogio = simular(on, [])
  on('prompt.submit', async (_$, e) => ({ text: e.text }))
  await executar($.turn.step(passo()))
  await escreverLista($, 3, 3)
  await relogio.advance(14_000)

  // Já entregou um bloco e andou
  const antes = await olhar($)
  expect(numero(antes, 'levadas')).toBeGreaterThanOrEqual(1)
  expect(antes).not.toContain('<text')

  // Um comando com barra não apaga nada
  await $.prompt.submit({ text: '/claudinho', command: { name: 'claudinho', args: '' } } as never)
  expect(numero(await olhar($), 'levadas')).toBeGreaterThanOrEqual(1)

  // Um pedido novo recomeça do zero: sem tarefas, sem entregas, de volta ao canto
  await $.prompt.submit({ text: 'faça outra coisa' } as never)
  const depois = await olhar($)
  expect(atributo(depois, 'levadas')).toBe('0')
  expect(atributo(depois, 'chao')).toBe('0')
  expect(atributo(depois, 'p')).toBe('0.000')
})

test('/claudinho demo mostra o principal e três subagentes; o terceiro some aos 20 s e no fim sobra o principal', async ($, on) => {
  const relogio = simular(on, [])
  const comando = (args: string) => $.command.run({ command: 'claudinho', args, origin: { kind: 'composer' } } as never)

  expect(JSON.stringify(await comando('demo'))).toContain('Demonstração')
  const faixa = await montarFaixa($, 'vscode', false)
  expect(await faixa.findAll({ type: 'Svg' })).toHaveLength(1)
  expect((await cenaDe(faixa)).match(/data-agente=/g)).toHaveLength(4)

  const principal = await bichoDe(faixa, 'Principal')
  const um = await bichoDe(faixa, 'Explore: revisar o ETL')
  const dois = await bichoDe(faixa, 'general-purpose: montar o zip')
  const tres = await bichoDe(faixa, 'Plan: conferir testes')

  // Quatro cores diferentes, um em cada estado
  expect(principal).toContain('#D97757')
  expect(um).toContain('#5fbf8f')
  expect(dois).toContain('#5aa9e6')
  expect(tres).toContain('#8f8cf4')
  expect(atributo(principal, 'estado')).toBe('andando')
  expect(atributo(um, 'estado')).toBe('andando')
  expect(atributo(dois, 'estado')).toBe('pensando')
  // Já entregou tudo: olha o montinho pronto
  expect(atributo(tres, 'estado')).toBe('contemplando')

  // Aos 20 s o terceiro termina e some
  await relogio.advance(21_000)
  // O terceiro está se despedindo; passada a despedida, some
  expect(atributo(await bichoDe(await montarFaixa($, 'vscode', false), 'Plan: conferir testes'), 'estado')).toBe('despedindo')
  await relogio.advance(3000)
  const aos21 = await montarFaixa($, 'vscode', false)
  expect((await cenaDe(aos21)).match(/data-agente=/g)).toHaveLength(3)
  expect(await bichoDe(aos21, 'Plan: conferir testes')).toBe('undefined')

  // Passados 45 s todos terminam: sobra só o principal, parado
  await relogio.advance(23_000)
  const fim = await montarFaixa($, 'vscode', false)
  expect((await cenaDe(fim)).match(/data-agente=/g)).toHaveLength(1)
  expect(atributo(await bichoDe(fim, 'Principal'), 'estado')).toBe('parado')
})

test('limpa o "(from the ... plugin)" da descrição do comando na lista', async ($, on) => {
  simular(on, [])
  on('command.describe', async (_$, e) => ({ description: e.description, isHidden: e.isHidden }))

  const resultado = await $.command.describe({
    command: 'claudinho',
    description: 'Esconde ou mostra os bichinhos (from the claudinho plugin)',
    isHidden: false,
    immediate: false,
    provider: { plugin: 'claudinho', tier: 'user' },
  } as never)

  expect(JSON.stringify(resultado)).toContain('Esconde ou mostra os bichinhos')
  expect(JSON.stringify(resultado)).not.toContain('from the')
  // Sai da lista de comandos, mas segue rodando se digitado inteiro e a faixa continua na tela
  expect(JSON.stringify(resultado)).toContain('"isHidden":true')
})

test('com o comando escondido da lista a faixa continua na tela e o comando ainda roda', async ($, on) => {
  simular(on, [])
  on('command.describe', async (_$, e) => ({ description: e.description, isHidden: e.isHidden }))
  await $.command.describe({
    command: 'claudinho',
    description: 'x',
    isHidden: false,
    immediate: false,
    provider: { plugin: 'claudinho', tier: 'user' },
  } as never)

  expect(await (await montarFaixa($)).findAll({ type: 'Svg' })).toHaveLength(1)
  const resposta = await $.command.run({ command: 'claudinho', args: 'cor verde', origin: { kind: 'composer' } } as never)
  expect(JSON.stringify(resposta)).toContain('verde')
})

test('cada agente anda na sua trilha: ninguém fica por cima de ninguém', async ($, on) => {
  simular(on, [SUBS.um, DOIS_TRABALHANDO])
  await executar($.turn.step(passo()))
  await executar($.turn.step(passo('sub1')))
  await executar($.turn.step(passo('sub2')))

  const faixa = await montarFaixa($)
  const cena = await cenaDe(faixa)
  const altura = Number(/height="(\d+)" viewBox/.exec(cena)?.[1])

  // Três trilhas de 34 px, cada uma deslocada para baixo da anterior, com o bichinho um pouco menor
  expect(cena.match(/data-agente=/g)).toHaveLength(3)
  expect(altura).toBe(34 * 3)
  expect(cena).toContain('translate(0,0) scale(0.8)')
  expect(cena).toContain('translate(0,34) scale(0.8)')
  expect(cena).toContain('translate(0,68) scale(0.8)')
})

// Termina o turno do principal para ninguém mais estar trabalhando
const terminarTurno = ($: Corpo) => $.turn.complete({ turnId: 't1', answer: 'fim' } as never)

test('parado há 20 segundos o bichinho adormece, com os zzz e sem nenhum texto', async ($, on) => {
  const relogio = simular(on, [])
  on('turn.complete', async () => ({ text: '' }))
  await executar($.turn.step(passo()))
  await terminarTurno($)
  await relogio.advance(10_000)

  // Dez segundos depois ainda está só parado
  expect(atributo(await olhar($, false), 'estado')).toBe('parado')

  await relogio.advance(12_000)
  const dormindo = await olhar($, false)

  // Passados 20 segundos: olhos fechados e os três zzz, desenhados como formas
  expect(atributo(dormindo, 'estado')).toBe('dormindo')
  expect(dormindo).toContain('class="z1"')
  expect(dormindo).toContain('class="z3"')
  expect(dormindo).not.toContain('<text')
})

test('qualquer atividade acorda o bichinho e um pedido novo também', async ($, on) => {
  const relogio = simular(on, [])
  on('turn.complete', async () => ({ text: '' }))
  on('prompt.submit', async (_$, e) => ({ text: e.text }))
  await executar($.turn.step(passo()))
  await terminarTurno($)
  await relogio.advance(25_000)
  expect(atributo(await olhar($, false), 'estado')).toBe('dormindo')

  // Uma nova requisição ao modelo acorda
  await executar($.turn.step(passo(undefined, 1)))
  expect(atributo(await olhar($, true), 'estado')).toBe('andando')

  // Volta a dormir e um pedido novo do usuário também acorda
  await terminarTurno($)
  await relogio.advance(25_000)
  expect(atributo(await olhar($, false), 'estado')).toBe('dormindo')
  await $.prompt.submit({ text: 'oi' } as never)
  expect(atributo(await olhar($, false), 'estado')).toBe('parado')
})

test('o subagente que não está ativo some; o principal fica sempre, até dormindo', async ($, on) => {
  const relogio = simular(on, [SUBS.um, SUBS.dois])
  await executar($.turn.step(passo()))
  await executar($.turn.step(passo('sub1')))
  await executar($.turn.step(passo('sub2')))
  await escreverLista($, 0, 2)
  await $.tool.call({ tool: 'TodoWrite', tool_use_id: 'todo2', agentId: 'sub2', todos: todos(0, 2) } as never)
  await relogio.advance(2000)

  const faixa = await montarFaixa($, 'vscode', true)
  const cena = await cenaDe(faixa)

  // Só trabalham o principal e o Explore: o general-purpose já terminou e não aparece, nem o estoque dele
  expect(cena.match(/data-agente=/g)).toHaveLength(2)
  expect(await bichoDe(faixa, 'Explore: revisar o ETL')).not.toBe('undefined')
  expect(await bichoDe(faixa, 'general-purpose: montar o zip')).toBe('undefined')
  expect(cena.match(/class="s" x=/g)).toHaveLength(2)
  expect(await faixa.findAll({ type: 'Svg' })).toHaveLength(1)
})

test('o subagente aparece enquanto trabalha e some quando termina', async ($, on) => {
  const relogio = mock.clock(on, { now: 1_000_000 })
  let status: 'running' | 'completed' = 'running'
  on('agent.list', async () => ({ value: [{ ...SUBS.um, status }] }))
  on('turn.step', async function* (_$, e) {
    return resposta(e.turnId, e.index)
  })
  on('turn.complete', async () => ({ text: '' }))
  await executar($.turn.step(passo()))
  await executar($.turn.step(passo('sub1')))
  await relogio.advance(1000)

  expect((await cenaDe(await montarFaixa($, 'vscode', true))).match(/data-agente=/g)).toHaveLength(2)

  // O subagente termina: o próximo aviso do motor atualiza a lista e ele some
  status = 'completed'
  await $.turn.complete({ turnId: 't1', agentId: 'sub1', answer: 'fim' } as never)
  // Ao terminar ele se despede por 2 s antes de sumir
  const despedida = await cenaDe(await montarFaixa($, 'vscode', true))
  expect(atributo(await bichoDe(await montarFaixa($, 'vscode', true), 'Explore: revisar o ETL'), 'estado')).toBe('despedindo')
  expect(despedida.match(/data-agente=/g)).toHaveLength(2)
  await relogio.advance(2500)
  const depois = await cenaDe(await montarFaixa($, 'vscode', true))
  expect(depois.match(/data-agente=/g)).toHaveLength(1)
  expect(depois).toContain('data-agente="Principal"')
})

test('no terminal o bichinho que dorme fecha os olhos e ganha um z', async ($, on) => {
  const relogio = simular(on, [])
  on('turn.complete', async () => ({ text: '' }))
  await executar($.turn.step(passo()))
  await terminarTurno($)
  await relogio.advance(25_000)
  const faixa = await montarFaixa($, 'terminal', false)

  expect(await faixa.find({ type: 'Text', text: /▟▁▁▙ᶻ/ })).toBeDefined()
  expect(await faixa.find({ type: 'Text', text: /▟██▙/ })).toBeUndefined()
})

test('ferramenta que falha ou é negada faz o bichinho tropeçar por um instante', async ($, on) => {
  const relogio = simular(on, [], true, { isError: true, result: 'falhou', text: 'falhou' })
  await executar($.turn.step(passo()))
  await chamarFerramenta($, 'erro1')

  const tropecou = await olhar($)
  expect(atributo(tropecou, 'estado')).toBe('tropecando')
  // Olhos em x e nenhum texto
  expect(tropecou).toContain('M16 17')
  expect(tropecou).not.toContain('<text')

  // Passado o tropeço volta a andar
  await relogio.advance(2200)
  expect(atributo(await olhar($), 'estado')).not.toBe('tropecando')
})

test('ferramenta negada também faz tropeçar', async ($, on) => {
  simular(on, [], true, { deny: 'não pode' })
  await executar($.turn.step(passo()))
  await chamarFerramenta($, 'negada1')

  expect(atributo(await olhar($), 'estado')).toBe('tropecando')
})

test('ao fim do pedido o principal comemora pulando e depois fica parado', async ($, on) => {
  const relogio = simular(on, [])
  on('turn.complete', async () => ({ text: '' }))
  await executar($.turn.step(passo()))
  await terminarTurno($)

  const festa = await olhar($, false)
  expect(atributo(festa, 'estado')).toBe('comemorando')
  expect(festa).not.toContain('<text')

  // O relógio segue rodando durante a festa: o pulo muda de quadro
  await relogio.advance(200)
  const outroQuadro = await olhar($, false)
  expect(atributo(outroQuadro, 'estado')).toBe('comemorando')
  expect(outroQuadro).not.toBe(festa)

  await relogio.advance(2500)
  expect(atributo(await olhar($, false), 'estado')).toBe('parado')
})

test('quando o motor pede permissão ao usuário ele levanta a mão e para de andar até liberar', async ($, on) => {
  const relogio = simular(on, [])
  on('tool.check', async () => ({ decision: 'ask' as const }))
  await executar($.turn.step(passo()))
  await $.tool.check({ tool: 'Bash', input: { command: 'ls' } } as never)

  // Nos primeiros instantes ainda não: o que é liberado sozinho não deve piscar
  await relogio.advance(400)
  expect(atributo(await olhar($), 'estado')).toBe('andando')

  await relogio.advance(1000)
  const esperando = await olhar($)
  expect(atributo(esperando, 'estado')).toBe('esperando')
  expect(esperando).not.toContain('<text')
  const parado = atributo(esperando, 'p')

  // Esperando, não anda
  await relogio.advance(3000)
  expect(atributo(await olhar($), 'p')).toBe(parado)

  // Terminada a chamada da ferramenta, volta ao trabalho
  await chamarFerramenta($, 'liberada')
  expect(atributo(await olhar($), 'estado')).not.toBe('esperando')
})

test('com mais coisas ao mesmo tempo ele anda mais rápido', async ($, on) => {
  const relogio = simular(on, [SUBS.um, DOIS_TRABALHANDO])
  await executar($.turn.step(passo()))
  await executar($.turn.step(passo('sub1')))
  await executar($.turn.step(passo('sub2')))
  await relogio.advance(2000)

  // Sozinho, em 2 s ele andaria uns 0,33 do corredor; com 3 agentes o ritmo sobe 1,5x
  expect(Number(atributo(await olhar($), 'p'))).toBeGreaterThan(0.42)
})

test('sozinho ele anda no ritmo normal', async ($, on) => {
  const relogio = simular(on, [])
  await executar($.turn.step(passo()))
  await relogio.advance(2000)

  const p = Number(atributo(await olhar($), 'p'))
  expect(p).toBeGreaterThan(0.28)
  expect(p).toBeLessThan(0.38)
})

test('com muitas tarefas cada bloco junta várias, para a pilha caber e continuar crescendo', async ($, on) => {
  const relogio = simular(on, [])
  await executar($.turn.step(passo()))
  await escreverLista($, 4, 56)

  // 60 tarefas, 3 por bloco: o estoque mostra 20 blocos
  const antes = await cenaDe(await montarFaixa($))
  expect(antes.match(/class="s" x=/g)).toHaveLength(20)

  // 4 entregues = 2 blocos no quadradinho, com contorno de pacote
  await relogio.advance(70_000)
  const depois = await cenaDe(await montarFaixa($))
  expect(atributo(await olhar($), 'levadas')).toBe('4')
  expect(depois.match(/stroke-width="1"\/>/g)).toHaveLength(2)
})

test('com poucas tarefas os blocos são um por tarefa, sem contorno', async ($, on) => {
  const relogio = simular(on, [])
  await executar($.turn.step(passo()))
  await escreverLista($, 3, 3)
  await relogio.advance(40_000)

  const cena = await cenaDe(await montarFaixa($))
  expect(atributo(await olhar($), 'levadas')).toBe('3')
  expect(cena).not.toContain('stroke-width="1"/>')
})

test('a despedida: acena e depois pula para baixo do chão, sem invadir a trilha de baixo', async ($, on) => {
  const relogio = mock.clock(on, { now: 1_000_000 })
  let status: 'running' | 'completed' = 'running'
  on('agent.list', async () => ({ value: [{ ...SUBS.um, status }] }))
  on('turn.step', async function* (_$, e) {
    return resposta(e.turnId, e.index)
  })
  on('turn.complete', async () => ({ text: '' }))
  await executar($.turn.step(passo()))
  await executar($.turn.step(passo('sub1')))
  const yDe = (svg: string) => Number(/transform="translate\(\d+,(-?[\d.]+)\)"/.exec(svg)?.[1])
  const sub1 = async () => bichoDe(await montarFaixa($, 'vscode', true), 'Explore: revisar o ETL')
  const antes = yDe(await sub1())

  // O subagente termina: começa acenando, no mesmo lugar
  status = 'completed'
  await $.turn.complete({ turnId: 't1', agentId: 'sub1', answer: 'fim' } as never)
  await relogio.advance(400)
  const acenando = await sub1()
  expect(atributo(acenando, 'estado')).toBe('despedindo')
  expect(yDe(acenando)).toBe(antes)
  expect(acenando).not.toContain('<text')

  // Depois do aceno ele cai abaixo do chão
  await relogio.advance(1500)
  const caindo = await sub1()
  expect(atributo(caindo, 'estado')).toBe('despedindo')
  expect(yDe(caindo)).toBeGreaterThan(antes + 20)
  // Cada trilha é recortada na sua faixa
  expect(await cenaDe(await montarFaixa($, 'vscode', true))).toContain('clip-path="url(#trilha1)"')

  // E some
  await relogio.advance(1000)
  expect(await sub1()).toBe('undefined')
})

test('com todas as tarefas entregues a mina esvazia: ele larga a picareta e contempla o montinho', async ($, on) => {
  const relogio = simular(on, [])
  await executar($.turn.step(passo()))
  await escreverLista($, 2, 0)
  // Ida à mina, duas entregas e volta: bem mais que o necessário
  await relogio.advance(40_000)

  const pronto = await olhar($)
  expect(atributo(pronto, 'levadas')).toBe('2')
  expect(atributo(pronto, 'estado')).toBe('contemplando')
  expect(atributo(pronto, 'sentido')).toBe('esquerda')
  expect(pronto).not.toContain('class="picareta"')
  expect(pronto).not.toContain('<text')

  // Fica parado ao lado do montinho, sem voltar à mina
  const p = atributo(pronto, 'p')
  await relogio.advance(10_000)
  expect(atributo(await olhar($), 'p')).toBe(p)
  expect(atributo(await olhar($), 'estado')).toBe('contemplando')

  // Tarefa nova na lista: volta ao trabalho
  await escreverLista($, 2, 1)
  await relogio.advance(2000)
  expect(atributo(await olhar($), 'estado')).toBe('andando')
})

test('/claudinho cor muda o principal e os subagentes ficam com as outras cores', async ($, on) => {
  simular(on, [SUBS.um])
  const comando = (args: string) => $.command.run({ command: 'claudinho', args, origin: { kind: 'composer' } } as never)
  await executar($.turn.step(passo()))
  await executar($.turn.step(passo('sub1')))

  expect(JSON.stringify(await comando('cor azul'))).toContain('azul')
  const faixa = await montarFaixa($)
  expect(await bichoDe(faixa, 'Principal')).toContain('#5aa9e6')
  // O primeiro subagente fica com a cor que o principal deixou (o laranja), nunca com o azul
  const sub = await bichoDe(faixa, 'Explore: revisar o ETL')
  expect(sub).toContain('#D97757')
  expect(sub).not.toContain('#5aa9e6')

  // Voltar ao padrão
  expect(JSON.stringify(await comando('cor padrão'))).toContain('padrão')
  expect(await bichoDe(await montarFaixa($), 'Principal')).toContain('#D97757')
})

test('/claudinho cor com nome desconhecido lista as cores e não muda nada', async ($, on) => {
  simular(on, [])
  const resposta = await $.command.run({ command: 'claudinho', args: 'cor turquesa', origin: { kind: 'composer' } } as never)

  expect(JSON.stringify(resposta)).toContain('laranja, verde, azul, roxo, rosa, amarelo')
  expect(await bichoDe(await montarFaixa($), 'Principal')).toContain('#D97757')
})

// Chamada de ferramenta que só termina quando o teste libera: dá tempo de olhar o desenho no meio dela
const ferramentaPresa = (on: Registrar) => {
  let liberar: () => void = () => undefined
  const porta = new Promise<void>(resolve => {
    liberar = resolve
  })
  on('tool.call', async () => {
    await porta

    return { result: {}, text: 'ok' } as never
  })

  return liberar
}

test('chamando outra IA ele para e fica chicoteando um robozinho, até a chamada terminar', async ($, on) => {
  const relogio = mock.clock(on, { now: 1_000_000 })
  on('agent.list', async () => ({ value: [] }))
  on('turn.step', async function* (_$, e) {
    return resposta(e.turnId, e.index)
  })
  const liberar = ferramentaPresa(on)
  await executar($.turn.step(passo()))

  const chamada = $.tool.call({ tool: 'Bash', tool_use_id: 'ia1', command: 'codex exec "refatorar o ETL"' } as never)
  await relogio.advance(1000)
  const antes = await olhar($)
  expect(atributo(antes, 'estado')).toBe('chicoteando')
  expect(atributo(antes, 'outra')).toBe('codex')
  expect(antes).toContain('class="outra-ia"')
  expect(antes).not.toContain('<text')

  // O chicote vai e volta (dois quadros diferentes) e ele não sai do lugar
  const quadros = new Set<string>()
  for (let i = 0; i < 4; i++) {
    await relogio.advance(300)
    quadros.add(await olhar($))
  }
  expect(quadros.size).toBeGreaterThan(1)
  expect(atributo(await olhar($), 'p')).toBe(atributo(antes, 'p'))

  // Terminada a chamada, o robô some e ele volta ao trabalho
  liberar()
  await chamada
  const depois = await olhar($)
  expect(atributo(depois, 'estado')).not.toBe('chicoteando')
  expect(depois).not.toContain('class="outra-ia"')
})

const prepararChamadaPresa = async ($: Corpo, on: Registrar) => {
  const relogio = mock.clock(on, { now: 1_000_000 })
  on('agent.list', async () => ({ value: [] }))
  on('turn.step', async function* (_$, e) {
    return resposta(e.turnId, e.index)
  })
  const liberar = ferramentaPresa(on)
  await executar($.turn.step(passo()))

  return { relogio, liberar }
}

test('comando comum que só cita o nome de uma IA não vira robozinho', async ($, on) => {
  const { relogio, liberar } = await prepararChamadaPresa($, on)

  const comum = $.tool.call({ tool: 'Bash', tool_use_id: 'c1', command: 'grep codex README.md' } as never)
  await relogio.advance(500)
  expect(atributo(await olhar($), 'estado')).not.toBe('chicoteando')
  liberar()
  await comum
})

test('servidor MCP de outra IA também chama o robozinho', async ($, on) => {
  const { relogio, liberar } = await prepararChamadaPresa($, on)

  const chamada = $.tool.call({ tool: 'mcp__gemini__ask', tool_use_id: 'm1' } as never)
  await relogio.advance(500)
  const meio = await olhar($)
  expect(atributo(meio, 'estado')).toBe('chicoteando')
  expect(atributo(meio, 'outra')).toBe('gemini')
  liberar()
  await chamada
})

test('lendo ou pesquisando arquivos ele fica pensando, na pose do Pensador, até terminar', async ($, on) => {
  const { relogio, liberar } = await prepararChamadaPresa($, on)

  const chamada = $.tool.call({ tool: 'Grep', tool_use_id: 'g1', pattern: 'obito' } as never)
  await relogio.advance(500)
  const lendo = await olhar($)
  expect(atributo(lendo, 'estado')).toBe('pensando')
  const p = atributo(lendo, 'p')

  // Pensando ele não anda
  await relogio.advance(2000)
  expect(atributo(await olhar($), 'p')).toBe(p)

  liberar()
  await chamada
  expect(atributo(await olhar($), 'estado')).not.toBe('pensando')
})

test('ferramenta que não lê arquivos não deixa o bichinho pensando', async ($, on) => {
  const { relogio, liberar } = await prepararChamadaPresa($, on)

  const chamada = $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'ls' } as never)
  await relogio.advance(500)
  expect(atributo(await olhar($), 'estado')).not.toBe('pensando')
  liberar()
  await chamada
})

test('busca na web também deixa o bichinho pensando', async ($, on) => {
  const { relogio, liberar } = await prepararChamadaPresa($, on)

  const chamada = $.tool.call({ tool: 'WebSearch', tool_use_id: 'w1', query: 'textract limites' } as never)
  await relogio.advance(500)
  expect(atributo(await olhar($), 'estado')).toBe('pensando')
  liberar()
  await chamada
  expect(atributo(await olhar($), 'estado')).not.toBe('pensando')
})

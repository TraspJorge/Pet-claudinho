import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Agente, Cena, Sinal, Tarefas } from '../types'

const PRINCIPAL = 'principal'
const SEM_TAREFAS: Tarefas = { total: 0, feitas: 0, lista: false }
const CENA_INICIAL: Cena = { p: 0, sentido: 1, levadas: 0, carregando: false }
const MAX_BICHOS = 6

// Valores da sessão (contrato em types/index.d.ts)
const tarefas = atom({ plugin: 'claudinho', key: 'tarefas' } as const, {})
const cenas = atom({ plugin: 'claudinho', key: 'cenas' } as const, {})
const inicios = atom({ plugin: 'claudinho', key: 'inicios' } as const, {})
const agentes = atom({ plugin: 'claudinho', key: 'agentes' } as const, {})
const isHidden = atom({ plugin: 'claudinho', key: 'isHidden' } as const, false)
const pensando = atom({ plugin: 'claudinho', key: 'pensando' } as const, {})
const dormindo = atom({ plugin: 'claudinho', key: 'dormindo' } as const, {})
const sinais = atom({ plugin: 'claudinho', key: 'sinais' } as const, {})
const permissao = atom({ plugin: 'claudinho', key: 'permissao' } as const, {})
const corPrincipal = atom({ plugin: 'claudinho', key: 'corPrincipal' } as const, '')
const outrasIA = atom({ plugin: 'claudinho', key: 'outrasIA' } as const, {})

// Uma cor por agente: o principal é o laranja do Claude, os demais seguem a ordem em que apareceram
const COR_AGENTE = ['#D97757', '#5fbf8f', '#5aa9e6', '#8f8cf4', '#e06c9f', '#e5c342']
// Nomes aceitos em /claudinho cor <nome>; os subagentes usam as outras cores da lista
const NOMES_COR: Record<string, string> = {
  laranja: COR_AGENTE[0],
  verde: COR_AGENTE[1],
  azul: COR_AGENTE[2],
  roxo: COR_AGENTE[3],
  rosa: COR_AGENTE[4],
  amarelo: COR_AGENTE[5],
}
const ALTURA_FAIXA = 42
// Cada agente anda numa trilha própria, um pouco menor, empilhadas no mesmo desenho
const ESCALA = 0.8
const ALTURA_TRILHA = 34
const LARGURA_BICHO = 32
// Espaço à esquerda (um quadradinho de 40 px por agente) e à direita (o estoque de blocos), em pixels
const LARGURA_QUADRADO = 40
const ZONA_ESTOQUE = 72
// Velocidade da caminhada em pixels por segundo e intervalo entre quadros do movimento
const VELOCIDADE = 130
const PASSO_RELOGIO = 200
// Quanto tempo parado até adormecer, em milissegundos
const SONO_MS = 20_000
// Quantos blocos cabem à vista: no quadradinho de cada agente (5x5) e no estoque (3 fileiras de 8)
const MAX_QUADRADO = 25
const MAX_ESTOQUE = 24
// Quanto duram o tropeço (erro) e a comemoração, e quanto tempo esperando a permissão antes de levantar a mão
const ERRO_MS = 1600
const FESTA_MS = 1800
// Despedida do subagente que termina: acena até 1,2 s e então pula para baixo, saindo do chão
const TCHAU_MS = 2000
const ACENO_MS = 1200
const ESPERA_MS = 1000
// Picareta: tempo de cada meia batida; com 3 ou mais coisas ao mesmo tempo ela bate mais rápido
const PERIODO_PICARETA = 300
const PERIODO_PICARETA_RAPIDO = 200

type Estado = 'andando' | 'minerando' | 'pensando' | 'dormindo' | 'parado' | 'tropecando' | 'comemorando' | 'esperando' | 'despedindo' | 'contemplando' | 'chicoteando'

// Um bichinho da cena: quem é, a cor, o que está fazendo, onde está e as tarefas dele
type Bicho = { k: string; nome: string; cor: string; estado: Estado; cena: Cena; tarefas: Tarefas; sinalAte?: number; outra?: string }

// Blocos de um agente ainda no estoque: as tarefas dele que não foram entregues nem estão na cabeça dele
const chaoDe = (b: Bicho) => Math.max(0, b.tarefas.total - b.cena.levadas - (b.cena.carregando ? 1 : 0))

// Escapa texto para dentro de um atributo do SVG
const xml = (texto: string) =>
  texto.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

// Onde começa o corredor: logo depois dos quadradinhos de todos os agentes
const zonaDosQuadrados = (agentes: number) => 8 + LARGURA_QUADRADO * agentes

// Distância que o bichinho percorre entre os quadradinhos e o estoque, para uma faixa de largura L e n agentes
const corredorDe = (L: number, agentes: number) => Math.max(1, L - LARGURA_BICHO - zonaDosQuadrados(agentes) - ZONA_ESTOQUE)

// Relógio dos quadros: roda só enquanto algum agente trabalha; guarda se o principal está no meio de um turno
// e o tamanho do corredor, que o desenho informa
const maquina: {
  timer?: { cancel: () => void }
  sonoTimer?: { cancel: () => void }
  paradoDesde: Record<string, number>
  principalAtivo: boolean
  ultimo: number
  corredor: number
  emVoo: number
  periodo: number
  lendo: Record<string, number>
} = {
  paradoDesde: {},
  principalAtivo: false,
  ultimo: 0,
  corredor: corredorDe(760 / ESCALA, 1),
  emVoo: 0,
  periodo: PERIODO_PICARETA,
  lendo: {},
}

// Ritmo pela carga: quantas coisas acontecem ao mesmo tempo (agentes trabalhando ou ferramentas em andamento).
// Com mais carga andam mais rápido (até 1,75x) e a picareta bate mais depressa.
function ritmoDe(ativos: number) {
  const carga = Math.max(ativos, maquina.emVoo)

  return {
    fator: Math.min(1.75, 1 + 0.25 * Math.max(0, carga - 1)),
    periodo: carga >= 3 ? PERIODO_PICARETA_RAPIDO : PERIODO_PICARETA,
  }
}

// Quantas tarefas vale cada bloco: 1 até 25 tarefas; acima disso cada bloco junta várias para a pilha caber
const grupoDe = (t: Tarefas) => Math.max(1, Math.ceil(t.total / MAX_QUADRADO))

// Escurece uma cor #rrggbb misturando com preto
const escurecer = (hex: string, fator = 0.78) => {
  const n = parseInt(hex.slice(1), 16)
  const canais = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.round(v * fator))

  return `#${canais.map(v => v.toString(16).padStart(2, '0')).join('')}`
}

// Todas as tarefas concluídas e entregues: a mina esvaziou e o montinho está pronto
const terminou = (t: Tarefas, levadas: number, carregando: boolean) =>
  t.total > 0 && t.feitas >= t.total && levadas >= t.total && !carregando

// Dá um passo no trabalho do bichinho. Trabalhando, ele vai ao estoque e fica lá minerando a tarefa. Quando há tarefa
// concluída sem entregar, pega um bloco, leva ao quadradinho, o põe lá e volta para a mina.
function avancar(c: Cena, t: Tarefas, dt: number, corredor: number, fator = 1): Cena {
  const dp = (VELOCIDADE * fator * dt) / 1000 / Math.max(1, corredor)
  let { p, sentido, carregando } = c
  let levadas = Math.min(c.levadas, t.feitas)
  const paraLevar = t.feitas - levadas - (carregando ? 1 : 0)

  // Mina esvaziada: fica olhando o montinho pronto, sem voltar a minerar
  if (terminou(t, levadas, carregando)) {
    return { p, sentido: -1, levadas, carregando }
  }
  if (carregando) {
    sentido = -1
    p -= dp
    if (p <= 0) {
      p = 0
      carregando = false
      levadas += 1
      sentido = 1
    }
  } else {
    sentido = 1
    p = Math.min(1, p + dp)
    // Na mina, se há tarefa pronta, pega o bloco e sai
    if (p >= 1 && paraLevar > 0) {
      carregando = true
      sentido = -1
    }
  }

  return { p, sentido, levadas, carregando }
}

// Está na mina: junto ao estoque, sem bloco na cabeça
const naMina = (c: Cena) => c.p >= 0.999 && !c.carregando

// Um bloco de tarefa de 6x6
const bloco = (x: number, y: number, cor: string, contorno = '') =>
  `<rect x="${x}" y="${y}" width="6" height="6" rx="1" fill="${cor}" opacity="1"${contorno ? ` stroke="${contorno}" stroke-width="1"` : ''}/>`

// Um bloco do estoque, neutro: só ganha cor quando um agente o pega
const blocoNeutro = (x: number, y: number) => `<rect class="s" x="${x}" y="${y}" width="6" height="6" rx="1"/>`

// Cela de ordem j num quadradinho que cresce para a direita e para cima: 1x1, 2x2, 3x3... Os blocos já postos
// nunca mudam de lugar. Devolve [coluna, linha], contadas a partir do canto de baixo à esquerda.
function cela(j: number): [number, number] {
  const k = Math.floor(Math.sqrt(j))
  const r = j - k * k

  return r <= k ? [k, r] : [r - k - 1, k]
}

// Um quadradinho por agente, no chão do canto esquerdo, lado a lado, cada um na cor do seu agente
function quadradinhos(bichos: Bicho[]) {
  return bichos
    .map((b, indice) =>
      Array.from({ length: Math.min(Math.ceil(b.cena.levadas / grupoDe(b.tarefas)), MAX_QUADRADO) }, (_, j) => {
        const [coluna, linha] = cela(j)

        // Bloco que junta várias tarefas ganha um contorno mais escuro
        return bloco(6 + indice * LARGURA_QUADRADO + coluna * 7, 32 - linha * 7, b.cor, grupoDe(b.tarefas) > 1 ? escurecer(b.cor, 0.6) : '')
      }).join(''),
    )
    .join('')
}

// O estoque de tarefas ainda no chão, à direita, em até 3 fileiras de 8 blocos neutros
function estoquePartes(L: number, n: number) {
  return Array.from({ length: Math.min(n, MAX_ESTOQUE) }, (_, i) =>
    blocoNeutro(L - 14 - (i % 8) * 7, 32 - Math.floor(i / 8) * 7),
  ).join('')
}

// Poses de sinal: tropeço (inclinado, olhos em x e estrelas girando), comemoração (pulo, braços para cima e confete)
// e espera de permissão (mão levantada com uma exclamação piscando). Só formas, nenhum texto.
function poseEspecial(cor: string, escuro: string, estado: Estado, agora: number) {
  const quadro = Math.floor(agora / 200)
  const pernas = `<g fill="${escuro}"><rect x="7" y="28" width="3" height="7"/><rect x="17" y="28" width="3" height="7"/><rect x="12" y="28" width="3" height="7"/><rect x="22" y="28" width="3" height="7"/></g>`
  const orelhas = `<rect x="8" y="8" width="3" height="4" fill="${cor}"/><rect x="19" y="8" width="3" height="4" fill="${cor}"/>`
  const corpo = `<rect x="4" y="12" width="22" height="16" rx="3" fill="${cor}"/>`

  if (estado === 'tropecando') {
    const estrela = (i: number) => {
      const ang = ((quadro + i * 2) % 4) * (Math.PI / 2)

      return `<circle cx="${(15 + Math.cos(ang) * 11).toFixed(1)}" cy="${(5 + Math.sin(ang) * 3).toFixed(1)}" r="1.5" fill="#f5c542"/>`
    }
    const xis = (x: number) => `<path d="M${x} 17 l3 4 m0 -4 l-3 4" stroke="#1f1e1d" stroke-width="1.4" fill="none"/>`

    return `<g transform="rotate(-12 15 35)">${orelhas}${corpo}<rect x="0" y="20" width="5" height="4" rx="1" fill="${cor}"/><rect x="25" y="20" width="5" height="4" rx="1" fill="${cor}"/>${xis(16)}${xis(21)}${pernas}</g>${estrela(0)}${estrela(1)}`
  }
  if (estado === 'comemorando') {
    const pulo = quadro % 2 === 0 ? 0 : -5
    const confete = (x: number, y: number, c: string, i: number) =>
      `<rect x="${x + ((quadro + i) % 2) * 3}" y="${y + ((quadro + i) % 3) * 2}" width="2" height="2" fill="${c}"/>`

    return `<g transform="translate(0,${pulo})">${orelhas}${corpo}<rect x="0" y="6" width="5" height="4" rx="1" fill="${cor}"/><rect x="25" y="6" width="5" height="4" rx="1" fill="${cor}"/><rect class="ink" x="16" y="17" width="3" height="5"/><rect class="ink" x="21" y="17" width="3" height="5"/>${pernas}</g>${confete(-3, 0, '#f5c542', 0)}${confete(31, 2, '#5aa9e6', 1)}${confete(14, -3, '#e06c9f', 2)}`
  }
  if (estado === 'chicoteando') {
    // Braço para trás com o chicote atrás; no estalo o braço vai à frente, o chicote alcança o robô e solta uma faísca
    const olhos = '<rect class="ink" x="16" y="17" width="3" height="5"/><rect class="ink" x="21" y="17" width="3" height="5"/>'
    const base = `${orelhas}${corpo}<rect x="0" y="20" width="5" height="4" rx="1" fill="${cor}"/>${olhos}${pernas}`
    if (estaloAgora(agora)) {
      return `${base}<rect x="27" y="19" width="12" height="4" rx="1.5" fill="${cor}"/><path d="M39 21 Q44 14 46 24" stroke="${escuro}" stroke-width="1.4" fill="none"/><path d="M46 20 v8 M42 24 h8" stroke="#f5c542" stroke-width="1.4"/>`
    }

    return `${base}<g transform="rotate(-55 27 21)"><rect x="25" y="9" width="4" height="12" rx="1.5" fill="${cor}"/></g><path d="M17 14 Q8 0 -2 8" stroke="${escuro}" stroke-width="1.4" fill="none"/>`
  }
  if (estado === 'contemplando') {
    // Olhos felizes (^ ^) e dois brilhos que piscam: o trabalho acabou e o montinho está pronto
    const feliz = (x: number) => `<path d="M${x} 21 q1.5 -3 3 0" stroke="#1f1e1d" stroke-width="1.3" fill="none"/>`
    const brilho = (x: number, y: number, ligado: boolean) =>
      ligado ? `<path d="M${x} ${y - 3} v6 M${x - 3} ${y} h6" stroke="#f5c542" stroke-width="1.4"/>` : ''

    return `${orelhas}${corpo}<rect x="0" y="20" width="5" height="4" rx="1" fill="${cor}"/><rect x="25" y="20" width="5" height="4" rx="1" fill="${cor}"/>${feliz(16)}${feliz(21)}${pernas}${brilho(8, 2, quadro % 4 < 2)}${brilho(25, 0, quadro % 4 >= 2)}`
  }
  // esperando: a mão sobe e desce de leve e a exclamação pisca; despedindo: acena sem exclamação
  const aceno = quadro % 2 === 0 ? -10 : 10
  const exclamacao =
    estado === 'esperando' && Math.floor(agora / 400) % 2 === 0
      ? '<rect x="33" y="0" width="3" height="8" rx="1" fill="#f5c542"/><rect x="33" y="10" width="3" height="3" rx="1" fill="#f5c542"/>'
      : ''

  return `${orelhas}${corpo}<rect x="0" y="20" width="5" height="4" rx="1" fill="${cor}"/><g transform="rotate(${aceno} 27 14)"><rect x="25" y="2" width="5" height="12" rx="1.5" fill="${cor}"/></g><rect class="ink" x="16" y="17" width="3" height="5"/><rect class="ink" x="21" y="17" width="3" height="5"/>${pernas}${exclamacao}`
}

// A pancada do chicote: alterna a cada meia batida (mesmo ritmo da picareta)
const estaloAgora = (agora: number) => Math.floor(agora / maquina.periodo) % 2 === 1

// O robozinho que representa a outra IA (28 px de largura): trabalha de olhos acesos e, no estalo, encolhe
// com olhos > < e uma gota de suor
function robo(agora: number) {
  const estalo = estaloAgora(agora)
  const olhos = estalo
    ? '<path d="M8 19 l4 2 l-4 2" stroke="#1f1e1d" stroke-width="1.4" fill="none"/><path d="M20 19 l-4 2 l4 2" stroke="#1f1e1d" stroke-width="1.4" fill="none"/><path d="M9 27 q2.5 -2 5 0 t5 0" stroke="#1f1e1d" stroke-width="1.3" fill="none"/><circle cx="27" cy="13" r="1.4" fill="#7fe0ff"/>'
    : '<rect x="8" y="19" width="4" height="4" fill="#7fe0ff"/><rect x="16" y="19" width="4" height="4" fill="#7fe0ff"/><rect x="9" y="26" width="10" height="1.6" fill="#1f1e1d"/>'

  return `<g class="outra-ia" transform="translate(${estalo ? 2 : 0},0)"><line x1="14" y1="10" x2="14" y2="15" stroke="#8b93a0" stroke-width="1.5"/><circle cx="14" cy="8.5" r="2" fill="${estalo ? '#e5534b' : '#5fbf8f'}"/><rect x="3" y="15" width="22" height="15" rx="3" fill="#8b93a0"/>${olhos}<g fill="#6b7380"><rect x="7" y="30" width="4" height="5"/><rect x="17" y="30" width="4" height="5"/></g></g>`
}

// O bichinho sozinho, virado para a direita; leva o bloco na cabeça; pensando fica sentado com o punho no queixo,
// como O Pensador
function bichoPartes(cor: string, estado: Estado, carregando: boolean, perna: number, agora: number) {
  const escuro = escurecer(cor)
  if (['tropecando', 'comemorando', 'esperando', 'despedindo', 'contemplando', 'chicoteando'].includes(estado)) {
    return poseEspecial(cor, escuro, estado, agora)
  }
  if (estado === 'pensando') {
    // As três reticências acendem uma a uma
    const acesas = Math.floor(agora / 450) % 4
    const ponto = (i: number, cx: number, cy: number, r: number) =>
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${cor}" opacity="${i < acesas ? 1 : 0.2}"/>`

    return `<g>
<rect x="8" y="12" width="3" height="4" fill="${cor}"/><rect x="19" y="12" width="3" height="4" fill="${cor}"/>
<rect x="4" y="16" width="22" height="16" rx="3" fill="${cor}"/>
<rect class="ink" x="16" y="21" width="3" height="3"/><rect class="ink" x="21" y="21" width="3" height="3"/>
<rect x="13" y="27" width="5" height="5" rx="1" fill="${escuro}"/><rect x="18" y="26" width="6" height="5" rx="1" fill="${escuro}"/>
</g>
<g fill="${escuro}"><rect x="6" y="32" width="9" height="3"/><rect x="16" y="32" width="9" height="3"/></g>
${ponto(0, 14, 9, 1.4)}${ponto(1, 18, 5, 1.8)}${ponto(2, 23, 1.8, 2.2)}`
  }

  if (estado === 'dormindo') {
    // Os três zzz, cada um maior que o anterior, sobem e somem um depois do outro
    const z = (classe: string, x: number, y: number, lado: number) =>
      `<path class="${classe}" d="M${x} ${y} h${lado} l-${lado} ${lado} h${lado}" stroke="${cor}" stroke-width="1.3" fill="none" stroke-linejoin="round"/>`

    return `<g class="corpo">
<rect x="8" y="12" width="3" height="4" fill="${cor}"/><rect x="19" y="12" width="3" height="4" fill="${cor}"/>
<rect x="4" y="16" width="22" height="16" rx="3" fill="${cor}"/>
<rect class="ink" x="15" y="24" width="4" height="1.6" rx="0.8"/><rect class="ink" x="21" y="24" width="4" height="1.6" rx="0.8"/>
</g>
<g fill="${escuro}"><rect x="6" y="32" width="9" height="3"/><rect x="16" y="32" width="9" height="3"/></g>
${z('z1', 21, 9, 3.5)}${z('z2', 25, 4, 4.5)}${z('z3', 28, -1, 5.5)}`
  }

  if (estado === 'minerando') {
    // A picareta vai para trás e bate para a frente (300 ms, ou 200 ms com carga alta); na batida saltam faíscas
    const batida = Math.floor(agora / maquina.periodo) % 2 === 1
    const faiscas = batida
      ? '<rect x="40" y="22" width="2" height="2" fill="#f5c542"/><rect x="43" y="26" width="2" height="2" fill="#f5c542"/><rect x="38" y="29" width="2" height="2" fill="#f5c542"/>'
      : ''

    return `<g class="corpo">
<rect x="8" y="8" width="3" height="4" fill="${cor}"/><rect x="19" y="8" width="3" height="4" fill="${cor}"/>
<rect x="4" y="12" width="22" height="16" rx="3" fill="${cor}"/>
<rect x="0" y="20" width="5" height="4" rx="1" fill="${cor}"/>
<rect class="ink" x="16" y="17" width="3" height="5"/><rect class="ink" x="21" y="17" width="3" height="5"/>
</g>
<g class="picareta" transform="rotate(${batida ? 38 : -42} 26 22)"><line x1="26" y1="22" x2="26" y2="6" stroke="${escuro}" stroke-width="2"/><path d="M20 7 Q26 2 32 7" stroke="${cor}" stroke-width="2.4" fill="none"/></g>
${faiscas}
<g fill="${escuro}"><rect x="7" y="28" width="3" height="7"/><rect x="17" y="28" width="3" height="7"/></g>
<g fill="${escuro}"><rect x="12" y="28" width="3" height="7"/><rect x="22" y="28" width="3" height="7"/></g>`
  }

  // Andando, as pernas se alternam a cada trecho percorrido; parado, ficam no chão
  const sobe = estado === 'andando' ? -2.5 : 0

  return `${carregando ? bloco(12, 2, cor) : ''}
<g class="corpo">
<rect x="8" y="8" width="3" height="4" fill="${cor}"/><rect x="19" y="8" width="3" height="4" fill="${cor}"/>
<rect x="4" y="12" width="22" height="16" rx="3" fill="${cor}"/>
<rect x="0" y="20" width="5" height="4" rx="1" fill="${cor}"/><rect x="25" y="20" width="5" height="4" rx="1" fill="${cor}"/>
<rect class="ink" x="16" y="17" width="3" height="5"/><rect class="ink" x="21" y="17" width="3" height="5"/>
</g>
<g fill="${escuro}" transform="translate(0,${perna === 0 ? sobe : 0})"><rect x="7" y="28" width="3" height="7"/><rect x="17" y="28" width="3" height="7"/></g>
<g fill="${escuro}" transform="translate(0,${perna === 1 ? sobe : 0})"><rect x="12" y="28" width="3" height="7"/><rect x="22" y="28" width="3" height="7"/></g>`
}

// O conteúdo de uma trilha: o chão, o quadradinho do agente à esquerda, o estoque neutro à direita e o bichinho
// no meio, indo e voltando na cor dele. A posição vem da cena guardada: nada depende de animação do SVG.
function trilhaConteudo(L: number, b: Bicho, agora: number) {
  const corredor = corredorDe(L, 1)
  const x = Math.round(zonaDosQuadrados(1) + b.cena.p * corredor)
  const perna = Math.floor((b.cena.p * corredor) / 8) % 2
  // Chicoteando, ele fica de frente para o robô, que aparece à direita (ou à esquerda, se não couber)
  const lado = x + 42 + 28 + 4 <= L ? 1 : -1
  const olhaDireita = b.estado === 'chicoteando' ? lado === 1 : b.cena.sentido === 1
  const virar = olhaDireita ? '' : ` transform="translate(${LARGURA_BICHO},0) scale(-1,1)"`
  const aoLado = b.estado === 'chicoteando' ? `<g transform="translate(${x + (lado === 1 ? 42 : -34)},3)">${robo(agora)}</g>` : ''
  // Despedida: depois do aceno ele dá um pulinho e cai para baixo do chão
  const decorrido = TCHAU_MS - ((b.sinalAte ?? 0) - agora)
  const t = Math.min(1, Math.max(0, (decorrido - ACENO_MS) / (TCHAU_MS - ACENO_MS)))
  const dy = b.estado !== 'despedindo' ? 0 : t < 0.25 ? (-8 * t) / 0.25 : -8 + ((t - 0.25) / 0.75) * 48

  return `<rect class="k" x="0" y="38" width="${L}" height="1.5" rx="0.75"/>
${quadradinhos([b])}${estoquePartes(L, Math.ceil(chaoDe(b) / grupoDe(b.tarefas)))}
<g data-agente="${xml(b.nome)}" data-p="${b.cena.p.toFixed(3)}" data-x="${x}" data-sentido="${b.cena.sentido === 1 ? 'direita' : 'esquerda'}" data-estado="${b.estado}" data-levadas="${b.cena.levadas}" data-chao="${chaoDe(b)}" data-carregando="${b.cena.carregando}" data-outra="${xml(b.outra ?? '')}" transform="translate(${x},${(3 + dy).toFixed(1)})"><g${virar}>${bichoPartes(b.cor, b.estado, b.cena.carregando, perna, agora)}</g></g>${aoLado}<!--/agente-->`
}

// O desenho de todos os agentes: uma trilha fina por agente, empilhadas, cada uma só dele, sem sobreposição
function cenaSvg(L: number, bichos: Bicho[], agora: number) {
  const interno = L / ESCALA
  const altura = ALTURA_TRILHA * bichos.length
  // Cada trilha é recortada na sua faixa: quem pula para baixo do chão some sem invadir a de baixo
  const recortes = bichos
    .map((_, i) => `<clipPath id="trilha${i}"><rect x="0" y="${i * ALTURA_TRILHA}" width="${L}" height="${ALTURA_TRILHA}"/></clipPath>`)
    .join('')
  const trilhas = bichos
    .map(
      (b, i) =>
        `<g clip-path="url(#trilha${i})"><g transform="translate(0,${i * ALTURA_TRILHA}) scale(${ESCALA})">${trilhaConteudo(interno, b, agora)}</g></g>`,
    )
    .join('\n')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${altura}" viewBox="0 0 ${L} ${altura}">
<style>
.k{fill:#e4e4e2}.s{fill:#c2c2be}.ink{fill:#1f1e1d}
@media (prefers-color-scheme: dark){.k{fill:#2c2c2c}.s{fill:#555555}}
.corpo{animation:resp 2.2s ease-in-out infinite}
.z1,.z2,.z3{animation:zzz 2.4s ease-in-out infinite}.z2{animation-delay:.5s}.z3{animation-delay:1s}
@keyframes resp{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}
@keyframes zzz{0%{opacity:0;transform:translateY(3px)}40%{opacity:1}100%{opacity:0;transform:translateY(-4px)}}
@media (prefers-reduced-motion: reduce){.corpo,.z1,.z2,.z3{animation:none}}
</style>
<defs>${recortes}</defs>
${trilhas}
</svg>`
}

// O que um agente está fazendo agora: um sinal vivo (tropeço, comemoração) manda; depois a espera de permissão
// (só trabalhando e após um tempo, para o que é liberado sozinho não piscar); depois pensar, trabalhar, dormir
type Situacao = { ativo: boolean; outra?: string; concluido: boolean; naMina: boolean; pensando: boolean; dormindo: boolean; sinal?: Sinal; espera?: number }
function estadoDe(s: Situacao, agora: number): Estado {
  if (s.sinal && s.sinal.ate > agora) {
    return { festa: 'comemorando', tchau: 'despedindo', erro: 'tropecando' }[s.sinal.tipo] as Estado
  }
  if (s.ativo && s.espera !== undefined && agora - s.espera >= ESPERA_MS) {
    return 'esperando'
  }
  // Chamou outra IA: fica chicoteando o robozinho que a representa
  if (s.ativo && s.outra) {
    return 'chicoteando'
  }
  if (s.pensando) {
    return 'pensando'
  }
  if (s.ativo) {
    return s.concluido ? 'contemplando' : s.naMina ? 'minerando' : 'andando'
  }

  return s.dormindo ? 'dormindo' : 'parado'
}

// Liga um sinal passageiro (erro ou festa) do agente por alguns instantes
async function sinalizar($: EngineInterface, chave: string, tipo: Sinal['tipo'], ms: number) {
  const agora = await $.clock.now()
  await update($, sinais, atual => ({ ...atual, [chave]: { tipo, ate: agora + ms } }))
}

// Tira o agente da espera de permissão
async function sairDaEspera($: EngineInterface, chave: string) {
  await update($, permissao, atual => {
    if (!(chave in atual)) {
      return atual
    }
    const { [chave]: _saiu, ...resto } = atual

    return resto
  })
}

// Outras IAs que o Claude pode chamar: servidor MCP com o nome delas ou comando delas no Bash (heurística pelo nome)
const IA_NO_MCP = /(codex|gemini|openai|gpt|ollama|grok|deepseek|mistral|copilot|qwen|llama)/i
const IA_NO_BASH = /(?:^|[;&|(]\s*)(?:npx\s+(?:-y\s+)?|uvx\s+)?(codex|gemini|ollama|aider|opencode|qwen|grok|openai|llm)\b/i

// Nome da outra IA que esta chamada de ferramenta aciona, ou undefined quando não é uma
function outraIADe(ferramenta: string, comando: string) {
  if (ferramenta.startsWith('mcp__')) {
    return IA_NO_MCP.exec(ferramenta.split('__')[1] ?? '')?.[1]?.toLowerCase()
  }

  return ferramenta === 'Bash' ? IA_NO_BASH.exec(comando)?.[1]?.toLowerCase() : undefined
}

// Ferramentas que leem ou pesquisam (arquivos e web): enquanto rodam, o agente fica pensando
const LEITURAS = ['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch']

// Soma ou tira uma leitura em andamento do agente; com alguma em andamento ele fica na pose do Pensador
async function lendoArquivos($: EngineInterface, chave: string, delta: number) {
  maquina.lendo[chave] = Math.max(0, (maquina.lendo[chave] ?? 0) + delta)
  const lendo = maquina.lendo[chave] > 0
  await update($, pensando, atual => (Boolean(atual[chave]) === lendo ? atual : { ...atual, [chave]: lendo }))
}

// Termina o chicote do agente
async function sairDaOutraIA($: EngineInterface, chave: string) {
  await update($, outrasIA, atual => {
    if (!(chave in atual)) {
      return atual
    }
    const { [chave]: _saiu, ...resto } = atual

    return resto
  })
}

// Atualiza nome e status dos subagentes da sessão
async function atualizarAgentes($: EngineInterface) {
  const lista = await $.agent.list()
  const antes = await read($, agentes)
  const mapa: Record<string, Agente> = {}
  for (const a of lista) {
    mapa[a.id] = { nome: a.description || a.name || a.id.slice(0, 8), tipo: a.type, status: a.status }
  }
  // Quem estava trabalhando e terminou se despede: acena e pula para baixo antes de sumir
  for (const k of Object.keys(mapa)) {
    if (['running', 'waiting'].includes(antes[k]?.status ?? '') && !['running', 'waiting'].includes(mapa[k].status)) {
      await sinalizar($, k, 'tchau', TCHAU_MS)
    }
  }
  await update($, agentes, () => mapa)
  await ligarRelogio($)
}

// Acorda o agente: some o sono dele e o relógio de parado dele recomeça
async function acordar($: EngineInterface, chave: string) {
  delete maquina.paradoDesde[chave]
  await update($, dormindo, atual => (atual[chave] ? { ...atual, [chave]: false } : atual))
}

// Faz dormir quem não está trabalhando agora
async function dormirOsParados($: EngineInterface) {
  const nomes = await read($, agentes)
  const ativos = new Set([
    ...(maquina.principalAtivo ? [PRINCIPAL] : []),
    ...Object.keys(nomes).filter(k => ['running', 'waiting'].includes(nomes[k].status)),
  ])
  const todos = [PRINCIPAL, ...Object.keys(nomes)]
  await update($, dormindo, atual => {
    const novo = { ...atual }
    for (const k of todos) {
      if (!ativos.has(k)) {
        novo[k] = true
      }
    }

    return novo
  })
}

// Marca daqui a 20 segundos a hora de os parados adormecerem (some se alguém voltar a trabalhar antes)
function agendarSono($: EngineInterface) {
  maquina.sonoTimer?.cancel()
  maquina.sonoTimer = $.clock.after(SONO_MS, () => {
    void dormirOsParados($)
  })
}

// Guarda o instante em que o agente apareceu, uma vez só
async function marcarInicio($: EngineInterface, chave: string) {
  const agora = await $.clock.now()
  await update($, inicios, atual => (atual[chave] ? atual : { ...atual, [chave]: agora }))
}

// Liga o relógio dos quadros: a cada 200 ms move os agentes que trabalham e não estão pensando e redesenha;
// quando ninguém trabalha mais, desliga sozinho
async function ligarRelogio($: EngineInterface) {
  if (maquina.timer) {
    return
  }
  maquina.ultimo = await $.clock.now()
  maquina.timer = $.clock.every(PASSO_RELOGIO, async () => {
    const agora = await $.clock.now()
    const dt = Math.min(1000, Math.max(0, agora - maquina.ultimo))
    maquina.ultimo = agora
    const raciocinando = await read($, pensando)
    const nomes = await read($, agentes)
    const lista = await read($, tarefas)
    const esperando = await read($, permissao)
    const chicoteando = await read($, outrasIA)
    const sinaisAgora = await read($, sinais)
    const subsAtivos = Object.keys(nomes).filter(k => ['running', 'waiting'].includes(nomes[k].status))
    const sinalVivo = Object.values(sinaisAgora).some(sinal => sinal.ate > agora)

    // Só para quando ninguém trabalha e nenhuma comemoração ou tropeço está no ar
    if (!maquina.principalAtivo && subsAtivos.length === 0 && !sinalVivo) {
      maquina.timer?.cancel()
      maquina.timer = undefined
      // Um último desenho, com todos parados; daqui a pouco eles adormecem
      await update($, cenas, atual => ({ ...atual }))
      agendarSono($)

      return
    }
    // Quem voltou a trabalhar acorda; quem está parado há 20 segundos adormece
    const ativos = new Set([...(maquina.principalAtivo ? [PRINCIPAL] : []), ...subsAtivos])
    const paraDormir: string[] = []
    for (const k of [PRINCIPAL, ...Object.keys(nomes)]) {
      if (ativos.has(k)) {
        delete maquina.paradoDesde[k]
      } else {
        maquina.paradoDesde[k] ??= agora
        if (agora - maquina.paradoDesde[k] >= SONO_MS) {
          paraDormir.push(k)
        }
      }
    }
    await update($, dormindo, atual => {
      const novo = { ...atual }
      for (const k of ativos) {
        novo[k] = false
      }
      for (const k of paraDormir) {
        novo[k] = true
      }

      return novo
    })
    const andando = [...(maquina.principalAtivo ? [PRINCIPAL] : []), ...subsAtivos].filter(k => !raciocinando[k] && !(k in esperando) && !(k in chicoteando))
    const { fator } = ritmoDe(ativos.size)
    await update($, cenas, atual => {
      const novo = { ...atual }
      for (const k of andando) {
        novo[k] = avancar(atual[k] ?? CENA_INICIAL, lista[k] ?? SEM_TAREFAS, dt, maquina.corredor, fator)
      }

      return novo
    })
  })
}

// Zera os montinhos, as posições e o pensamento: cada pedido novo recomeça do zero
async function recomecar($: EngineInterface) {
  maquina.paradoDesde = {}
  maquina.sonoTimer?.cancel()
  await update($, tarefas, () => ({}))
  await update($, cenas, () => ({}))
  await update($, pensando, () => ({}))
  await update($, dormindo, () => ({}))
  await update($, sinais, () => ({}))
  await update($, permissao, () => ({}))
  await update($, outrasIA, () => ({}))
  maquina.lendo = {}
  maquina.emVoo = 0
}

// Demonstração sem custo: enche a faixa com três subagentes de mentira por 45 segundos
async function iniciarDemo($: EngineInterface) {
  const agora = await $.clock.now()
  const demo: Record<string, Agente> = {
    'demo-1': { nome: 'revisar o ETL', tipo: 'Explore', status: 'running' },
    'demo-2': { nome: 'montar o zip', tipo: 'general-purpose', status: 'running' },
    'demo-3': { nome: 'conferir testes', tipo: 'Plan', status: 'running' },
  }
  await update($, agentes, () => demo)
  await update($, inicios, atual => ({ ...atual, [PRINCIPAL]: atual[PRINCIPAL] ?? agora, 'demo-1': agora + 1, 'demo-2': agora + 2, 'demo-3': agora + 3 }))
  await update($, tarefas, () => ({
    [PRINCIPAL]: { total: 12, feitas: 9, lista: true },
    'demo-1': { total: 7, feitas: 5, lista: true },
    'demo-2': { total: 8, feitas: 3, lista: true },
    'demo-3': { total: 5, feitas: 5, lista: true },
  }))
  await update($, cenas, () => ({
    [PRINCIPAL]: { p: 0.25, sentido: 1, levadas: 4, carregando: false },
    'demo-1': { p: 0.7, sentido: -1, levadas: 2, carregando: true },
    'demo-2': { p: 0.4, sentido: 1, levadas: 1, carregando: false },
    'demo-3': { p: 0, sentido: 1, levadas: 5, carregando: false },
  }))
  // O segundo subagente pensa por uns segundos
  await update($, pensando, () => ({ 'demo-2': true }))
  maquina.paradoDesde = {}
  await update($, dormindo, () => ({}))
  maquina.principalAtivo = true
  await ligarRelogio($)
  $.clock.after(8000, () => {
    void update($, pensando, () => ({}))
  })
  // O primeiro subagente tropeça aos 4 s e de novo aos 24 s (ferramenta que falhou)
  for (const quando of [4000, 24_000]) {
    $.clock.after(quando, () => {
      void sinalizar($, 'demo-1', 'erro', ERRO_MS)
    })
  }
  // O segundo espera a permissão do usuário dos 10 aos 18 s: levanta a mão e para
  $.clock.after(10_000, () => {
    void update($, permissao, atual => ({ ...atual, 'demo-2': agora - ESPERA_MS }))
  })
  $.clock.after(18_000, () => {
    void sairDaEspera($, 'demo-2')
  })
  // O primeiro chama outra IA dos 28 aos 38 s: fica chicoteando o robozinho
  $.clock.after(28_000, () => {
    void update($, outrasIA, atual => ({ ...atual, 'demo-1': 'codex' }))
  })
  $.clock.after(38_000, () => {
    void sairDaOutraIA($, 'demo-1')
  })
  // O terceiro subagente termina aos 20 segundos e some da faixa
  $.clock.after(20_000, () => {
    void sinalizar($, 'demo-3', 'tchau', TCHAU_MS)
    void update($, agentes, atual => (atual['demo-3'] ? { ...atual, 'demo-3': { ...atual['demo-3'], status: 'completed' } } : atual))
  })
  // Passados 45 segundos, o principal e os outros subagentes terminam
  $.clock.after(45_000, () => {
    maquina.principalAtivo = false
    void sinalizar($, PRINCIPAL, 'festa', FESTA_MS)
    void sinalizar($, 'demo-1', 'tchau', TCHAU_MS)
    void sinalizar($, 'demo-2', 'tchau', TCHAU_MS)
    void update($, agentes, atual => Object.fromEntries(Object.entries(atual).map(([k, a]) => [k, { ...a, status: 'completed' }])))
  })
}

export const register: Register = on => {
  // Marca o agente como pensando só enquanto chegam pedaços de raciocínio; texto e ferramenta o põem para andar
  on('turn.step', async function* ($, e, next) {
    const chave = e.agentId ?? PRINCIPAL
    if (!e.agentId) {
      maquina.principalAtivo = true
    }
    await marcarInicio($, chave)
    await acordar($, chave)
    await ligarRelogio($)
    const fluxo = next(e)
    let isPensando = false
    try {
      for await (const pedaco of fluxo) {
        const raciocinando = pedaco.kind === 'thinking'
        if (raciocinando !== isPensando && (raciocinando || ['text', 'tool', 'input', 'stop'].includes(pedaco.kind))) {
          isPensando = raciocinando
          await update($, pensando, atual => ({ ...atual, [chave]: raciocinando }))
        }
        yield pedaco
      }
    } finally {
      if (isPensando) {
        await update($, pensando, atual => ({ ...atual, [chave]: false }))
      }
    }

    if (e.agentId) {
      await atualizarAgentes($)
    }

    return await fluxo.result
  })

  // Conta as tarefas de cada agente: a lista de tarefas (TodoWrite) manda; sem lista, cada chamada de ferramenta
  // é uma tarefa que nasce ao começar e se conclui ao terminar. Nunca atrapalha a ferramenta.
  on('tool.call', async ($, e, next) => {
    const chave = e.agentId ?? PRINCIPAL
    let emLista = false
    try {
      if (e.tool === 'TodoWrite') {
        const todos = (e as unknown as { todos?: { status: string }[] }).todos ?? []
        await update($, tarefas, atual => ({
          ...atual,
          [chave]: { total: todos.length, feitas: todos.filter(t => t.status === 'completed').length, lista: true },
        }))
        await marcarInicio($, chave)

        return next(e)
      }
      emLista = ((await read($, tarefas))[chave] ?? SEM_TAREFAS).lista
      await marcarInicio($, chave)
      if (!emLista) {
        await update($, tarefas, atual => {
          const t = atual[chave] ?? SEM_TAREFAS

          return { ...atual, [chave]: { ...t, total: t.total + 1 } }
        })
      }
    } catch {
      // A contagem é só enfeite: se falhar, a ferramenta segue
    }
    try {
      const outra = outraIADe(e.tool, String((e as unknown as { command?: unknown }).command ?? ''))
      if (outra) {
        await update($, outrasIA, atual => ({ ...atual, [chave]: outra }))
      }
    } catch {
      // só enfeite: se falhar, a ferramenta segue
    }
    const lendo = LEITURAS.includes(e.tool)
    if (lendo) {
      await lendoArquivos($, chave, 1).catch(() => undefined)
    }
    maquina.emVoo += 1
    let resultado: Awaited<ReturnType<typeof next>>
    try {
      resultado = await next(e)
    } finally {
      maquina.emVoo = Math.max(0, maquina.emVoo - 1)
      await sairDaEspera($, chave).catch(() => undefined)
      await sairDaOutraIA($, chave).catch(() => undefined)
      if (lendo) {
        await lendoArquivos($, chave, -1).catch(() => undefined)
      }
    }
    try {
      // Ferramenta que falhou ou foi negada faz o bichinho tropeçar
      if (resultado.deny !== undefined || resultado.isError) {
        await sinalizar($, chave, 'erro', ERRO_MS)
      }
      if (!emLista) {
        await update($, tarefas, atual => {
          const t = atual[chave] ?? SEM_TAREFAS

          return t.lista ? atual : { ...atual, [chave]: { ...t, feitas: Math.min(t.total, t.feitas + 1) } }
        })
      }
    } catch {
      // idem
    }

    return resultado
  }).catch((_$, e, next) => next(e)) // se este gancho falhar, a ferramenta segue; o next do catch não a roda duas vezes

  // Quando o motor decide pedir permissão ao usuário, o agente fica esperando (levanta a mão após um instante)
  on('tool.check', async ($, e, next) => {
    const veredito = await next(e)
    if (veredito.decision === 'ask') {
      const chave = e.agentId ?? PRINCIPAL
      const agora = await $.clock.now()
      await update($, permissao, atual => ({ ...atual, [chave]: agora }))
    }

    return veredito
  }).catch((_$, e, next) => next(e)) // se este gancho falhar, vale a decisão do motor

  // Cada pedido novo recomeça do zero; os comandos com barra (como /claudinho) não apagam nada
  on('prompt.submit', async ($, e, next) => {
    if (!e.command) {
      await recomecar($)
      await atualizarAgentes($)
    }

    return next(e)
  }).catch((_$, e, next) => next(e)) // se este gancho falhar, o pedido segue normalmente

  // Ao fim de cada turno, atualiza o status dos subagentes; o turno do principal encerra o trabalho dele
  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) {
      maquina.principalAtivo = false
      await sinalizar($, PRINCIPAL, 'festa', FESTA_MS)
      await ligarRelogio($)
    }
    await sairDaEspera($, e.agentId ?? PRINCIPAL)
    await atualizarAgentes($)

    return next(e)
  })

  // Um agente novo aparece na hora, antes mesmo da primeira resposta dele, e já pode andar
  on('agent.spawn', async ($, e, next) => {
    const resultado = await next(e)
    await atualizarAgentes($)
    await ligarRelogio($)

    return resultado
  }).catch((_$, e, next) => next(e)) // se este gancho falhar, a criação do agente segue normalmente

  // Comando para esconder ou mostrar os bichinhos e para recomeçar os montinhos
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'claudinho',
      description: 'Esconde ou mostra os bichinhos do Claudinho; "zerar" recomeça os montinhos, "demo" mostra 4 agentes por 45 segundos e "cor azul" muda a cor do principal',
    })
    agendarSono($)

    return next(e)
  })

  // O comando sai da lista de comandos (e com ele o rótulo do plugin), mas continua rodando se digitado inteiro;
  // a faixa na tela não depende da lista
  on('command.describe', { command: 'claudinho' }, async (_$, e, next) =>
    next({
      ...e,
      description: e.description.replace(/\s*\((?:from|de|do|da)\s+(?:the\s+)?[^)]*plugin\)\s*$/i, '').trim(),
      isHidden: true,
    }),
  )

  on('command.run', { command: 'claudinho' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'zerar') {
      await recomecar($)

      return { text: 'Montinhos recomeçados.' }
    }
    if (arg === 'cor' || arg.startsWith('cor ')) {
      const nome = arg.slice(3).trim().toLowerCase()
      if (nome === 'padrão' || nome === 'padrao') {
        await update($, corPrincipal, () => '')

        return { text: 'Cor do principal: laranja (padrão).' }
      }
      if (!NOMES_COR[nome]) {
        return { text: `Escolha uma cor: ${Object.keys(NOMES_COR).join(', ')} (ou "padrão"). Exemplo: /claudinho cor azul` }
      }
      await update($, corPrincipal, () => NOMES_COR[nome])

      return { text: `Cor do principal: ${nome}.` }
    }
    if (arg === 'demo') {
      await iniciarDemo($)

      return { text: 'Demonstração por 45 segundos com o principal e 3 subagentes de mentira (sem custo); o primeiro tropeça (4 s), o segundo espera permissão (10 a 18 s), o terceiro termina aos 20 s e some, o primeiro chicoteia outra IA (28 a 38 s) e o principal comemora no fim (45 s). Um pedido novo a encerra.' }
    }

    const oculto = await read($, isHidden)
    await update($, isHidden, () => !oculto)

    return { text: oculto ? 'Bichinhos de volta.' : 'Bichinhos escondidos.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) {
      return next(e)
    }

    const lista = await read($, tarefas)
    const posicoes = await read($, cenas)
    const chegada = await read($, inicios)
    const nomes = await read($, agentes)
    const pensandoAgora = await read($, pensando)
    const dormindoAgora = await read($, dormindo)
    const sinaisAgora = await read($, sinais)
    const escolhida = await read($, corPrincipal)
    const esperaAgora = await read($, permissao)
    const outrasAgora = await read($, outrasIA)
    const agora = await $.clock.now()
    const ui = $.ui.resolve(e)
    const { Box, Text } = ui
    const L = Math.max(260, Math.min(1600, (e.props.bodyColumns || 100) * 8 - 40))

    // Todos os agentes da sessão: o principal, depois os subagentes na ordem em que apareceram
    const subs = [...new Set([...Object.keys(nomes), ...Object.keys(chegada), ...Object.keys(lista)])]
      .filter(k => k !== PRINCIPAL)
      .sort((a, b) => (chegada[a] ?? Infinity) - (chegada[b] ?? Infinity))
    const todos = [PRINCIPAL, ...subs]
    const ativoDe = (k: string) =>
      k === PRINCIPAL ? e.props.isWorking || maquina.principalAtivo : ['running', 'waiting'].includes(nomes[k]?.status ?? '')

    // Um bichinho por agente que trabalha, cada um de uma cor: o principal fica sempre; o subagente some ao terminar
    const despedindo = (k: string) => sinaisAgora[k]?.tipo === 'tchau' && sinaisAgora[k].ate > agora
    const visiveis = todos.filter(k => k === PRINCIPAL || ativoDe(k) || pensandoAgora[k] || despedindo(k))
    maquina.periodo = ritmoDe(visiveis.filter(ativoDe).length).periodo
    // O principal usa a cor escolhida; os subagentes, as outras cores, na ordem em que apareceram
    const corDoPrincipal = escolhida || COR_AGENTE[0]
    const outras = COR_AGENTE.filter(c => c !== corDoPrincipal)
    const bichos: Bicho[] = visiveis.slice(0, MAX_BICHOS).map(k => ({
      k,
      cena: posicoes[k] ?? CENA_INICIAL,
      sinalAte: sinaisAgora[k]?.ate,
      outra: outrasAgora[k],
      tarefas: lista[k] ?? SEM_TAREFAS,
      cor: k === PRINCIPAL ? corDoPrincipal : outras[subs.indexOf(k) % outras.length],
      estado: estadoDe(
        {
          ativo: ativoDe(k),
          concluido: terminou(lista[k] ?? SEM_TAREFAS, (posicoes[k] ?? CENA_INICIAL).levadas, (posicoes[k] ?? CENA_INICIAL).carregando),
          naMina: naMina(posicoes[k] ?? CENA_INICIAL),
          pensando: Boolean(pensandoAgora[k]),
          dormindo: Boolean(dormindoAgora[k]),
          sinal: sinaisAgora[k],
          espera: esperaAgora[k],
          outra: outrasAgora[k],
        },
        agora,
      ),
      nome: k === PRINCIPAL ? 'Principal' : nomes[k] ? `${nomes[k].tipo}: ${nomes[k].nome}` : k.slice(0, 8),
    }))

    maquina.corredor = corredorDe(L / ESCALA, 1)

    // Telas gráficas: um desenho só, com todos os bichinhos na mesma linha
    if (e.surface !== 'terminal' && 'Svg' in ui) {
      const { Svg } = ui

      return (
        <Svg
          source={cenaSvg(L, bichos, agora)}
          alt={bichos
            .map(b => `Mini Claude (${b.nome}) ${b.estado}, ${b.cena.levadas} de ${b.tarefas.total} tarefas no montinho`)
            .join('; ')}
          width={L}
          height={ALTURA_TRILHA * bichos.length}
        />
      )
    }

    // Terminal: uma linha só, com um bichinho por agente, o montinho (cheios) e o estoque (vazios), sem nenhum texto
    const noEstoque = Math.min(24, bichos.reduce((soma, b) => soma + Math.ceil(chaoDe(b) / grupoDe(b.tarefas)), 0))

    return (
      <Box paddingX={1}>
        <Text>
          {bichos.map(b => (
            <Text key={`bicho-${b.k}`} color={b.cor}>
              {b.estado === 'dormindo' ? '▟▁▁▙ᶻ' : '▟██▙ '}
            </Text>
          ))}
          <Text dimColor>│ </Text>
          {bichos.map(b => (
            <Text key={`quadrado-${b.k}`} color={b.cor}>
              {`${'▣'.repeat(Math.min(Math.ceil(b.cena.levadas / grupoDe(b.tarefas)), MAX_QUADRADO))} `}
            </Text>
          ))}
          <Text dimColor>{` · ${'░'.repeat(noEstoque)}`}</Text>
        </Text>
      </Box>
    )
  })
}

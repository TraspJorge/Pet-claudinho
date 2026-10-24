// Tarefas de um agente: quantas existem e quantas já foram concluídas.
// Vêm da lista de tarefas (TodoWrite) quando o agente usa uma; sem lista, cada chamada de ferramenta é uma tarefa.
export type Tarefas = { total: number; feitas: number; lista: boolean }

// Onde o bichinho está: p vai de 0 (montinho, à esquerda) a 1 (estoque, à direita); sentido 1 vai para a direita.
// levadas é quantos blocos ele já depositou no montinho; carregando diz se leva um bloco no carrinho agora.
export type Cena = { p: number; sentido: 1 | -1; levadas: number; carregando: boolean }

// Identificação de um subagente, lida de $.agent.list()
export type Agente = { nome: string; tipo: string; status: string }

// Sinal passageiro de um agente: tropeço (erro de ferramenta), festa (fim do pedido) ou tchau (subagente que terminou), até o instante `ate`
export type Sinal = { tipo: 'erro' | 'festa' | 'tchau'; ate: number }

declare module 'claude-code' {
  interface PluginState {
    claudinho: {
      tarefas: Record<string, Tarefas>
      cenas: Record<string, Cena>
      // Instante em que cada agente apareceu: ordena as faixas e define a cor
      inicios: Record<string, number>
      agentes: Record<string, Agente>
      // Bichinhos escondidos
      isHidden: boolean
      // Agentes com raciocínio chegando agora (pensando)
      pensando: Record<string, boolean>
      // Agentes parados há tempo: dormem, com os zzz
      dormindo: Record<string, boolean>
      // Sinais passageiros por agente
      sinais: Record<string, Sinal>
      // Agentes esperando o usuário liberar uma ferramenta: instante em que a espera começou
      permissao: Record<string, number>
      // Cor escolhida para o principal em /claudinho cor (vazio: laranja padrão)
      corPrincipal: string
      // Agentes que chamam outra IA agora: nome da IA (o bichinho fica chicoteando um robozinho)
      outrasIA: Record<string, string>
    }
  }
}

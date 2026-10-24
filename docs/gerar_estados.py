"""Gera docs/estados/*.svg: cada situação do Claudinho animada, desenhada como no hooks/register.tsx.

Cada imagem é uma lista de quadros que se alternam em laço (CSS dentro do SVG, sem script).
Uso: python3 docs/gerar_estados.py
"""
import math
from pathlib import Path

COR = "#D97757"
SAIDA = Path(__file__).parent / "estados"
INK = "#1f1e1d"
AMARELO = "#f5c542"


def escurecer(hex_, fator=0.78):
    n = int(hex_[1:], 16)
    return "#" + "".join(f"{round(v * fator):02x}" for v in ((n >> 16) & 255, (n >> 8) & 255, n & 255))


ESC = escurecer(COR)
ORELHAS = f'<rect x="8" y="8" width="3" height="4" fill="{COR}"/><rect x="19" y="8" width="3" height="4" fill="{COR}"/>'
CORPO = f'<rect x="4" y="12" width="22" height="16" rx="3" fill="{COR}"/>'
BRACO_E = f'<rect x="0" y="20" width="5" height="4" rx="1" fill="{COR}"/>'
BRACO_D = f'<rect x="25" y="20" width="5" height="4" rx="1" fill="{COR}"/>'
OLHOS = f'<rect fill="{INK}" x="16" y="17" width="3" height="5"/><rect fill="{INK}" x="21" y="17" width="3" height="5"/>'
PERNAS4 = f'<g fill="{ESC}"><rect x="7" y="28" width="3" height="7"/><rect x="17" y="28" width="3" height="7"/><rect x="12" y="28" width="3" height="7"/><rect x="22" y="28" width="3" height="7"/></g>'
BLOCO = f'<rect x="12" y="2" width="6" height="6" rx="1" fill="{COR}"/>'


def pernas(sobe_a=0, sobe_b=0):
    return (f'<g fill="{ESC}" transform="translate(0,{sobe_a})"><rect x="7" y="28" width="3" height="7"/><rect x="17" y="28" width="3" height="7"/></g>'
            f'<g fill="{ESC}" transform="translate(0,{sobe_b})"><rect x="12" y="28" width="3" height="7"/><rect x="22" y="28" width="3" height="7"/></g>')


def sentado(olhos, dy=0):
    return (f'<g transform="translate(0,{dy})"><rect x="8" y="12" width="3" height="4" fill="{COR}"/><rect x="19" y="12" width="3" height="4" fill="{COR}"/>'
            f'<rect x="4" y="16" width="22" height="16" rx="3" fill="{COR}"/>{olhos}</g>'
            f'<g fill="{ESC}"><rect x="6" y="32" width="9" height="3"/><rect x="16" y="32" width="9" height="3"/></g>')


def mao(angulo):
    return f'<g transform="rotate({angulo} 27 14)"><rect x="25" y="2" width="5" height="12" rx="1.5" fill="{COR}"/></g>'


# Os quadros de cada situação; o último valor de cada entrada é a duração de um quadro em ms
def andando():
    return [f"{BLOCO}{ORELHAS}{CORPO}{BRACO_E}{BRACO_D}{OLHOS}{pernas(-2.5 if q == 0 else 0, -2.5 if q == 1 else 0)}" for q in (0, 1)]


def parado():
    # respira: o corpo sobe 1,5 px e desce
    return [f'<g transform="translate(0,{dy})">{ORELHAS}{CORPO}{BRACO_E}{BRACO_D}{OLHOS}</g>{pernas()}' for dy in (0, -1.5)]


def minerando():
    def quadro(batida):
        faiscas = "".join(f'<rect x="{x}" y="{y}" width="2" height="2" fill="{AMARELO}"/>' for x, y in ((40, 22), (43, 26), (38, 29))) if batida else ""
        return (f"{ORELHAS}{CORPO}{BRACO_E}{OLHOS}"
                f'<g transform="rotate({38 if batida else -42} 26 22)"><line x1="26" y1="22" x2="26" y2="6" stroke="{ESC}" stroke-width="2"/>'
                f'<path d="M20 7 Q26 2 32 7" stroke="{COR}" stroke-width="2.4" fill="none"/></g>{faiscas}{PERNAS4}')
    return [quadro(False), quadro(True)]


def pensando():
    def quadro(acesas):
        ponto = lambda i, cx, cy, r: f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{COR}" opacity="{1 if i < acesas else 0.2}"/>'
        olhos = f'<rect fill="{INK}" x="16" y="21" width="3" height="3"/><rect fill="{INK}" x="21" y="21" width="3" height="3"/>'
        punho = f'<rect x="13" y="27" width="5" height="5" rx="1" fill="{ESC}"/><rect x="18" y="26" width="6" height="5" rx="1" fill="{ESC}"/>'
        return (f'<rect x="8" y="12" width="3" height="4" fill="{COR}"/><rect x="19" y="12" width="3" height="4" fill="{COR}"/>'
                f'<rect x="4" y="16" width="22" height="16" rx="3" fill="{COR}"/>{olhos}{punho}'
                f'<g fill="{ESC}"><rect x="6" y="32" width="9" height="3"/><rect x="16" y="32" width="9" height="3"/></g>'
                f'{ponto(0, 14, 9, 1.4)}{ponto(1, 18, 5, 1.8)}{ponto(2, 23, 1.8, 2.2)}')
    return [quadro(a) for a in range(4)]


def dormindo():
    olhos = f'<rect fill="{INK}" x="15" y="24" width="4" height="1.6" rx="0.8"/><rect fill="{INK}" x="21" y="24" width="4" height="1.6" rx="0.8"/>'
    z = lambda x, y, l, op, dy: f'<path d="M{x} {y + dy} h{l} l-{l} {l} h{l}" stroke="{COR}" stroke-width="1.3" fill="none" stroke-linejoin="round" opacity="{op}"/>'
    # os zzz sobem e somem um depois do outro; o corpo respira
    cenas = [((1, 0, 0), 0, 3), ((1, 1, 0), -1.5, 1), ((1, 1, 1), -1.5, -1), ((0.4, 1, 1), 0, -3), ((0, 0.4, 1), 0, -4), ((0, 0, 0.4), 0, -4)]
    return [sentado(olhos, dy) + z(21, 9, 3.5, o[0], d) + z(25, 4, 4.5, o[1], d) + z(28, -1, 5.5, o[2], d) for o, dy, d in cenas]


def tropecando():
    def quadro(q):
        estrela = lambda i: f'<circle cx="{15 + math.cos(((q + i * 2) % 4) * math.pi / 2) * 11:.1f}" cy="{5 + math.sin(((q + i * 2) % 4) * math.pi / 2) * 3:.1f}" r="1.5" fill="{AMARELO}"/>'
        xis = lambda x: f'<path d="M{x} 17 l3 4 m0 -4 l-3 4" stroke="{INK}" stroke-width="1.4" fill="none"/>'
        return f'<g transform="rotate(-12 15 35)">{ORELHAS}{CORPO}{BRACO_E}{BRACO_D}{xis(16)}{xis(21)}{PERNAS4}</g>{estrela(0)}{estrela(1)}'
    return [quadro(q) for q in range(4)]


def comemorando():
    def quadro(q):
        pulo = 0 if q % 2 == 0 else -5
        confete = lambda x, y, c, i: f'<rect x="{x + ((q + i) % 2) * 3}" y="{y + ((q + i) % 3) * 2}" width="2" height="2" fill="{c}"/>'
        bracos = f'<rect x="0" y="6" width="5" height="4" rx="1" fill="{COR}"/><rect x="25" y="6" width="5" height="4" rx="1" fill="{COR}"/>'
        return (f'<g transform="translate(0,{pulo})">{ORELHAS}{CORPO}{bracos}{OLHOS}{PERNAS4}</g>'
                f'{confete(-3, 0, AMARELO, 0)}{confete(31, 2, "#5aa9e6", 1)}{confete(14, -3, "#e06c9f", 2)}{confete(-6, 8, "#5fbf8f", 3)}{confete(36, 10, AMARELO, 4)}')
    return [quadro(q) for q in range(4)]


def esperando():
    excl = f'<rect x="33" y="0" width="3" height="8" rx="1" fill="{AMARELO}"/><rect x="33" y="10" width="3" height="3" rx="1" fill="{AMARELO}"/>'
    return [f"{ORELHAS}{CORPO}{BRACO_E}{mao(-10 if q % 2 == 0 else 10)}{OLHOS}{PERNAS4}{excl if q < 2 else ''}" for q in range(4)]


def despedindo():
    return [f"{ORELHAS}{CORPO}{BRACO_E}{mao(-10 if q % 2 == 0 else 10)}{OLHOS}{PERNAS4}" for q in range(2)]


def contemplando():
    feliz = lambda x: f'<path d="M{x} 21 q1.5 -3 3 0" stroke="{INK}" stroke-width="1.3" fill="none"/>'
    brilho = lambda x, y: f'<path d="M{x} {y - 3} v6 M{x - 3} {y} h6" stroke="{AMARELO}" stroke-width="1.4"/>'
    base = f"{ORELHAS}{CORPO}{BRACO_E}{BRACO_D}{feliz(16)}{feliz(21)}{PERNAS4}"
    return [base + brilho(8, 2), base + brilho(25, 0)]


def robo(estalo):
    olhos = ('<path d="M8 19 l4 2 l-4 2" stroke="#1f1e1d" stroke-width="1.4" fill="none"/><path d="M20 19 l-4 2 l4 2" stroke="#1f1e1d" stroke-width="1.4" fill="none"/>'
             '<path d="M9 27 q2.5 -2 5 0 t5 0" stroke="#1f1e1d" stroke-width="1.3" fill="none"/><circle cx="27" cy="13" r="1.4" fill="#7fe0ff"/>') if estalo else (
             '<rect x="8" y="19" width="4" height="4" fill="#7fe0ff"/><rect x="16" y="19" width="4" height="4" fill="#7fe0ff"/><rect x="9" y="26" width="10" height="1.6" fill="#1f1e1d"/>')
    return (f'<g transform="translate({58 + (2 if estalo else 0)},3)"><line x1="14" y1="10" x2="14" y2="15" stroke="#8b93a0" stroke-width="1.5"/>'
            f'<circle cx="14" cy="8.5" r="2" fill="{"#e5534b" if estalo else "#5fbf8f"}"/><rect x="3" y="15" width="22" height="15" rx="3" fill="#8b93a0"/>{olhos}'
            f'<g fill="#6b7380"><rect x="7" y="30" width="4" height="5"/><rect x="17" y="30" width="4" height="5"/></g></g>')


def chicoteando():
    base = f"{ORELHAS}{CORPO}{BRACO_E}{OLHOS}{PERNAS4}"
    recuado = f'<g transform="rotate(-55 27 21)"><rect x="25" y="9" width="4" height="12" rx="1.5" fill="{COR}"/></g><path d="M17 14 Q8 0 -2 8" stroke="{ESC}" stroke-width="1.4" fill="none"/>'
    estalo = (f'<rect x="27" y="19" width="12" height="4" rx="1.5" fill="{COR}"/><path d="M39 21 Q44 14 46 24" stroke="{ESC}" stroke-width="1.4" fill="none"/>'
              f'<path d="M46 20 v8 M42 24 h8" stroke="{AMARELO}" stroke-width="1.4"/>')
    return [base + recuado + robo(False), base + estalo + robo(True)]


# nome: (quadros, ms por quadro, largura do desenho)
ESTADOS = {
    "andando": (andando, 300, 32),
    "minerando": (minerando, 300, 48),
    "pensando": (pensando, 450, 32),
    "dormindo": (dormindo, 400, 36),
    "parado": (parado, 1100, 32),
    "tropecando": (tropecando, 200, 36),
    "esperando": (esperando, 200, 40),
    "comemorando": (comemorando, 200, 40),
    "despedindo": (despedindo, 200, 32),
    "contemplando": (contemplando, 400, 36),
    "chicoteando": (chicoteando, 300, 94),
}

ESCALA = 4
LARGURA, ALTURA = 112, 56


def svg(quadros, ms, largura):
    n = len(quadros)
    total = n * ms
    css = [f".q{{opacity:0;animation-duration:{total}ms;animation-iteration-count:infinite;animation-timing-function:step-end}}"]
    grupos = []
    for i, q in enumerate(quadros):
        ini, fim = i / n * 100, (i + 1) / n * 100
        pontos = [f"{ini:.3f}%{{opacity:1}}"]
        if fim < 100:
            pontos.append(f"{fim:.3f}%{{opacity:0}}")
        if i == 0:
            pontos.insert(0, "0%{opacity:1}")
        css.append(f"@keyframes f{i}{{{''.join(pontos)}}}.f{i}{{animation-name:f{i}}}")
        grupos.append(f'<g class="q f{i}">{q}</g>')
    css.append("@media (prefers-reduced-motion:reduce){.q{animation:none}.f0{opacity:1}}")
    x = (LARGURA - largura) / 2
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{LARGURA * ESCALA}" height="{ALTURA * ESCALA}" viewBox="0 0 {LARGURA} {ALTURA}">'
            f'<style>{"".join(css)}</style>'
            f'<rect width="{LARGURA}" height="{ALTURA}" rx="6" fill="#f5f4ef"/>'
            f'<rect x="6" y="49" width="{LARGURA - 12}" height="1.5" rx="0.75" fill="#e0dfd8"/>'
            f'<g transform="translate({x:.1f},12)">{"".join(grupos)}</g></svg>\n')


if __name__ == "__main__":
    SAIDA.mkdir(parents=True, exist_ok=True)
    for nome, (desenho, ms, largura) in ESTADOS.items():
        (SAIDA / f"{nome}.svg").write_text(svg(desenho(), ms, largura), encoding="utf-8")
    print(f"{len(ESTADOS)} imagens em {SAIDA}")

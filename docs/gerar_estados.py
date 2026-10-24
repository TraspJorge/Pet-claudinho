"""Gera docs/estados/*.svg: um quadro de cada situação do Claudinho, desenhado como no hooks/register.tsx.

Uso: python3 docs/gerar_estados.py
"""
import math
from pathlib import Path

COR = "#D97757"
SAIDA = Path(__file__).parent / "estados"
INK = "#1f1e1d"


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


def pernas(sobe=0):
    return (f'<g fill="{ESC}" transform="translate(0,{sobe})"><rect x="7" y="28" width="3" height="7"/><rect x="17" y="28" width="3" height="7"/></g>'
            f'<g fill="{ESC}"><rect x="12" y="28" width="3" height="7"/><rect x="22" y="28" width="3" height="7"/></g>')


def sentado(olhos):
    return (f'<rect x="8" y="12" width="3" height="4" fill="{COR}"/><rect x="19" y="12" width="3" height="4" fill="{COR}"/>'
            f'<rect x="4" y="16" width="22" height="16" rx="3" fill="{COR}"/>{olhos}'
            f'<g fill="{ESC}"><rect x="6" y="32" width="9" height="3"/><rect x="16" y="32" width="9" height="3"/></g>')


def parado():
    return f"{ORELHAS}{CORPO}{BRACO_E}{BRACO_D}{OLHOS}{pernas()}"


def andando():
    return f"{BLOCO}{ORELHAS}{CORPO}{BRACO_E}{BRACO_D}{OLHOS}{pernas(-2.5)}"


def minerando():
    faiscas = "".join(f'<rect x="{x}" y="{y}" width="2" height="2" fill="#f5c542"/>' for x, y in ((40, 22), (43, 26), (38, 29)))
    return (f"{ORELHAS}{CORPO}{BRACO_E}{OLHOS}"
            f'<g transform="rotate(38 26 22)"><line x1="26" y1="22" x2="26" y2="6" stroke="{ESC}" stroke-width="2"/>'
            f'<path d="M20 7 Q26 2 32 7" stroke="{COR}" stroke-width="2.4" fill="none"/></g>{faiscas}'
            f'<g fill="{ESC}"><rect x="7" y="28" width="3" height="7"/><rect x="17" y="28" width="3" height="7"/><rect x="12" y="28" width="3" height="7"/><rect x="22" y="28" width="3" height="7"/></g>')


def pensando():
    ponto = lambda i, cx, cy, r: f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{COR}" opacity="{1 if i < 3 else 0.2}"/>'
    olhos = f'<rect fill="{INK}" x="16" y="21" width="3" height="3"/><rect fill="{INK}" x="21" y="21" width="3" height="3"/>'
    punho = f'<rect x="13" y="27" width="5" height="5" rx="1" fill="{ESC}"/><rect x="18" y="26" width="6" height="5" rx="1" fill="{ESC}"/>'
    return (f'<rect x="8" y="12" width="3" height="4" fill="{COR}"/><rect x="19" y="12" width="3" height="4" fill="{COR}"/>'
            f'<rect x="4" y="16" width="22" height="16" rx="3" fill="{COR}"/>{olhos}{punho}'
            f'<g fill="{ESC}"><rect x="6" y="32" width="9" height="3"/><rect x="16" y="32" width="9" height="3"/></g>'
            f'{ponto(0, 14, 9, 1.4)}{ponto(1, 18, 5, 1.8)}{ponto(2, 23, 1.8, 2.2)}')


def dormindo():
    z = lambda x, y, l, op: f'<path d="M{x} {y} h{l} l-{l} {l} h{l}" stroke="{COR}" stroke-width="1.3" fill="none" stroke-linejoin="round" opacity="{op}"/>'
    olhos = f'<rect fill="{INK}" x="15" y="24" width="4" height="1.6" rx="0.8"/><rect fill="{INK}" x="21" y="24" width="4" height="1.6" rx="0.8"/>'
    return sentado(olhos) + z(21, 9, 3.5, 1) + z(25, 4, 4.5, 1) + z(28, -1, 5.5, 1)


def tropecando():
    estrela = lambda i: f'<circle cx="{15 + math.cos(i * math.pi / 2) * 11:.1f}" cy="{5 + math.sin(i * math.pi / 2) * 3:.1f}" r="1.5" fill="#f5c542"/>'
    xis = lambda x: f'<path d="M{x} 17 l3 4 m0 -4 l-3 4" stroke="{INK}" stroke-width="1.4" fill="none"/>'
    return f'<g transform="rotate(-12 15 35)">{ORELHAS}{CORPO}{BRACO_E}{BRACO_D}{xis(16)}{xis(21)}{PERNAS4}</g>{estrela(0)}{estrela(2)}'


def comemorando():
    confete = lambda x, y, c: f'<rect x="{x}" y="{y}" width="2" height="2" fill="{c}"/>'
    bracos = f'<rect x="0" y="6" width="5" height="4" rx="1" fill="{COR}"/><rect x="25" y="6" width="5" height="4" rx="1" fill="{COR}"/>'
    return (f'<g transform="translate(0,-5)">{ORELHAS}{CORPO}{bracos}{OLHOS}{PERNAS4}</g>'
            f'{confete(-3, 4, "#f5c542")}{confete(34, 6, "#5aa9e6")}{confete(14, -9, "#e06c9f")}{confete(-6, -4, "#5fbf8f")}{confete(37, -3, "#f5c542")}')


def esperando():
    mao = f'<g transform="rotate(-10 27 14)"><rect x="25" y="2" width="5" height="12" rx="1.5" fill="{COR}"/></g>'
    excl = '<rect x="33" y="0" width="3" height="8" rx="1" fill="#f5c542"/><rect x="33" y="10" width="3" height="3" rx="1" fill="#f5c542"/>'
    return f"{ORELHAS}{CORPO}{BRACO_E}{mao}{OLHOS}{PERNAS4}{excl}"


def despedindo():
    mao = f'<g transform="rotate(10 27 14)"><rect x="25" y="2" width="5" height="12" rx="1.5" fill="{COR}"/></g>'
    return f"{ORELHAS}{CORPO}{BRACO_E}{mao}{OLHOS}{PERNAS4}"


def contemplando():
    feliz = lambda x: f'<path d="M{x} 21 q1.5 -3 3 0" stroke="{INK}" stroke-width="1.3" fill="none"/>'
    brilho = lambda x, y: f'<path d="M{x} {y - 3} v6 M{x - 3} {y} h6" stroke="#f5c542" stroke-width="1.4"/>'
    return f"{ORELHAS}{CORPO}{BRACO_E}{BRACO_D}{feliz(16)}{feliz(21)}{PERNAS4}{brilho(8, 2)}{brilho(25, 0)}"


def robo():
    olhos = ('<path d="M8 19 l4 2 l-4 2" stroke="#1f1e1d" stroke-width="1.4" fill="none"/><path d="M20 19 l-4 2 l4 2" stroke="#1f1e1d" stroke-width="1.4" fill="none"/>'
             '<path d="M9 27 q2.5 -2 5 0 t5 0" stroke="#1f1e1d" stroke-width="1.3" fill="none"/><circle cx="27" cy="13" r="1.4" fill="#7fe0ff"/>')
    return (f'<g transform="translate(58,3)"><g transform="translate(2,0)"><line x1="14" y1="10" x2="14" y2="15" stroke="#8b93a0" stroke-width="1.5"/>'
            f'<circle cx="14" cy="8.5" r="2" fill="#e5534b"/><rect x="3" y="15" width="22" height="15" rx="3" fill="#8b93a0"/>{olhos}'
            f'<g fill="#6b7380"><rect x="7" y="30" width="4" height="5"/><rect x="17" y="30" width="4" height="5"/></g></g></g>')


def chicoteando():
    base = f"{ORELHAS}{CORPO}{BRACO_E}{OLHOS}{PERNAS4}"
    chicote = (f'<rect x="27" y="19" width="12" height="4" rx="1.5" fill="{COR}"/><path d="M39 21 Q44 14 46 24" stroke="{ESC}" stroke-width="1.4" fill="none"/>'
               '<path d="M46 20 v8 M42 24 h8" stroke="#f5c542" stroke-width="1.4"/>')
    return base + chicote + robo()


ESTADOS = {
    "andando": (andando, 44),
    "minerando": (minerando, 48),
    "pensando": (pensando, 36),
    "dormindo": (dormindo, 36),
    "parado": (parado, 32),
    "tropecando": (tropecando, 36),
    "esperando": (esperando, 40),
    "comemorando": (comemorando, 44),
    "despedindo": (despedindo, 32),
    "contemplando": (contemplando, 36),
    "chicoteando": (chicoteando, 94),
}

ESCALA = 4
LARGURA, ALTURA = 112, 56


def svg(desenho, largura):
    # sprite centralizado no quadro; o chão fica em y=38
    x = (LARGURA - largura) / 2 + (2 if largura < 40 else 0)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{LARGURA * ESCALA}" height="{ALTURA * ESCALA}" viewBox="0 0 {LARGURA} {ALTURA}">'
            f'<rect width="{LARGURA}" height="{ALTURA}" rx="6" fill="#f5f4ef"/>'
            f'<rect x="6" y="49" width="{LARGURA - 12}" height="1.5" rx="0.75" fill="#e0dfd8"/>'
            f'<g transform="translate({x:.1f},12)">{desenho()}</g></svg>\n')


if __name__ == "__main__":
    SAIDA.mkdir(parents=True, exist_ok=True)
    for nome, (desenho, largura) in ESTADOS.items():
        (SAIDA / f"{nome}.svg").write_text(svg(desenho, largura), encoding="utf-8")
    print(f"{len(ESTADOS)} imagens em {SAIDA}")

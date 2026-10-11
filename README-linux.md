<div align="center">

<img src="src-tauri/icons/128x128@2x.png" alt="Logo do Niko" width="112" />

# Niko no Linux

**Seu sistema de vida, agora também no Linux.**

Adaptação do Niko para Linux: a ilha, o dock e a janela do sistema rodando sobre o mesmo código, com as partes exclusivas do Windows trocadas por equivalentes do Linux.

![Linux](https://img.shields.io/badge/Fedora%20%7C%20Ubuntu-GNOME-0b0d10?style=flat-square)
![Versão base](https://img.shields.io/badge/base-0.2.2-0b0d10?style=flat-square)
![Licença](https://img.shields.io/badge/licença-proprietária-b42318?style=flat-square)

</div>

---

Este documento descreve a adaptação para Linux feita sobre o código da versão 0.2.2. O [README](README.md) continua sendo a referência do app. O app foi testado em Fedora com GNOME em Wayland. Para Ubuntu, os pacotes foram conferidos no Ubuntu 24.04, mas o app ainda não foi executado nele. Outras distribuições e ambientes podem precisar de ajustes.

## O que foi feito

O Windows continua funcionando como antes. Cada ponto específico dele ganhou uma versão para Linux, escolhida em tempo de compilação (`#[cfg(windows)]` no Rust) ou pela plataforma (`process.platform` na ponte).

| Recurso | Como funciona no Linux | Fedora | Ubuntu |
| ------- | ---------------------- | ------ | ------ |
| **Credenciais e chaves de IA** | Chaveiro do sistema (Secret Service) | `libsecret` | `libsecret-tools` |
| **Mídia tocando** | MPRIS, com capa, controles e progresso | `playerctl` | `playerctl` |
| **Volume geral e por app** | WirePlumber e PulseAudio/PipeWire | `wireplumber`, `pulseaudio-utils` | `wireplumber`, `pulseaudio-utils` |
| **Wi-Fi, redes e Bluetooth** | NetworkManager e BlueZ | `NetworkManager`, `bluez` | `network-manager`, `bluez` |
| **Bateria e brilho** | `/sys` e `logind` | já vem no sistema | já vem no sistema |
| **Tema escuro** | `gsettings` (GNOME) | `glib2` | `libglib2.0-bin` |
| **Energia** | `loginctl` e `systemctl` | já vem no sistema | já vem no sistema |
| **OCR de anexos** | Tesseract, com o idioma da sessão | `tesseract`, `tesseract-langpack-por` | `tesseract-ocr`, `tesseract-ocr-por` |
| **Janelas abertas no dock** | Extensão Window Calls; sem ela, `wmctrl` (só X11 e XWayland) | extensão, `wmctrl`, `xdotool`, `xorg-x11-utils` | extensão, `wmctrl`, `xdotool`, `x11-utils` |
| **Busca e abertura de apps** | Arquivos `.desktop` e `gio launch` | já vem no sistema | já vem no sistema |
| **Captura de tela e teclado virtual** | `gnome-screenshot` (ou Spectacle, Flameshot) e `onboard` | `gnome-screenshot` | `gnome-screenshot`, `onboard` |
| **Abrir links, pastas e VS Code** | `xdg-open` | já vem no sistema | `xdg-utils` |
| **Tempo ocioso** | Monitor de inatividade do GNOME | já vem no sistema | já vem no sistema |
| **Ganchos das ferramentas de código** | Mesmos ganchos HTTP, com `curl` em vez de `curl.exe` | `curl` | `curl` |

A pasta de dados do app fica em `~/.local/share/com.niko.desktop`. No Linux o Niko força o backend X11 (`GDK_BACKEND=x11`), porque posicionar janelas por coordenada e ler o cursor global não funciona em Wayland puro.

## O que muda ou não existe

- O dock **não reserva espaço** na tela nem esconde a barra do sistema.
- Sem prévias ao vivo das janelas e sem detecção de tela cheia: o dock fica sempre visível.
- A bandeja de apps em segundo plano do Windows não existe; os ícones ficam na barra do GNOME (extensão AppIndicator).
- O botão **Iniciar** abre a visão geral do GNOME e não sabe se ela já está aberta.
- Não há "abrir como administrador".
- Atalhos globais estão sujeitos às restrições do Wayland.
- O atualizador e os scripts de release (`pnpm lancar`) seguem só o fluxo do Windows.
- Sem a extensão Window Calls, apps nativos de Wayland não aparecem no dock.

## Como rodar

### Requisitos

- Fedora ou Ubuntu com GNOME (testado em Wayland)
- Node 22.13 ou mais novo e pnpm
- Rust estável recente, via [rustup](https://rustup.rs)
- Bibliotecas de build do Tauri e as ferramentas da tabela acima

#### Fedora

```bash
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file libxdo-devel \
  libappindicator-gtk3-devel librsvg2-devel libsecret
sudo dnf group install "c-development"

sudo dnf install playerctl tesseract tesseract-langpack-por pulseaudio-utils \
  gnome-screenshot wmctrl xdotool xorg-x11-utils
```

#### Ubuntu

```bash
sudo apt update
sudo apt install -y build-essential curl wget file libwebkit2gtk-4.1-dev libxdo-dev \
  libssl-dev libayatana-appindicator3-dev librsvg2-dev libsecret-tools

sudo apt install -y playerctl tesseract-ocr tesseract-ocr-por pulseaudio-utils wireplumber \
  gnome-screenshot onboard wmctrl xdotool x11-utils network-manager bluez
```

O Node do repositório do Ubuntu é antigo. Instale o 22 e ative o pnpm:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo corepack enable
```

O volume geral usa o `wpctl`, que exige PipeWire. Ele é o padrão a partir do Ubuntu 22.10; no 22.04 o volume geral não funciona sem trocar o servidor de áudio.

#### Rust (as duas)

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Para a lista completa de janelas no dock, instale a extensão **Window Calls** (`window-calls@domandoman.xyz`) pelo Extension Manager (no Ubuntu: `sudo apt install gnome-shell-extension-manager`) e saia da sessão e entre de novo.

### Versão desktop

```bash
pnpm install
pnpm ponte:build
pnpm dev
```

Com o `pnpm dev` aberto, em outro terminal:

```bash
pnpm tauri dev
```

O Niko aceita uma só instância. Para reiniciar o app, rode `pkill -x niko` antes do `pnpm tauri dev`.

### Gerar o pacote

```bash
pnpm tauri build --bundles deb                     # Ubuntu e Debian
pnpm tauri build --bundles rpm                     # Fedora, depende do pacote nodejs
NO_STRIP=true pnpm tauri build --bundles appimage  # qualquer uma, exige Node no PATH
```

Para instalar:

```bash
sudo apt install ./src-tauri/target/release/bundle/deb/*.deb   # Ubuntu
sudo dnf install ./src-tauri/target/release/bundle/rpm/*.rpm   # Fedora
```

No Ubuntu, o `.deb` não exige o pacote `nodejs`, para não trazer o Node antigo do repositório: mantenha o Node 22 no PATH. As opções de pacote do Linux ficam em `src-tauri/tauri.linux.conf.json`, que o Tauri mescla sobre o `tauri.conf.json` só no Linux.

### Variáveis de ambiente

| Variável | Para que serve |
| -------- | -------------- |
| `GDK_BACKEND` | O Niko define `x11` sozinho; defina outro valor para sobrescrever |
| `WEBKIT_DISABLE_DMABUF_RENDERER=1` | Contorna janela em branco ou preta em algumas placas de vídeo (por exemplo NVIDIA) |
| `NO_STRIP=true` | Evita falha do empacotador do AppImage |
| `XDG_DATA_HOME` | Muda a pasta de dados (padrão `~/.local/share`) |

```bash
WEBKIT_DISABLE_DMABUF_RENDERER=1 pnpm tauri dev
```

### Outros comandos

```bash
pnpm verificar   # checagem de tipos em modo estrito
pnpm test        # testes isolados, em sequência
```

## Estrutura

Arquivos adicionados pela adaptação:

```text
servidor/
  appsLinux.ts             catálogo de apps (.desktop) e ícones
  controleRapidoLinux.ts   áudio, tema, energia, ferramentas e lançador de apps
  janelasLinux.ts          janelas abertas (Window Calls ou wmctrl)
  ocrLinux.ts              OCR com Tesseract
  sistemaLinux.ts          Wi-Fi, Bluetooth, bateria, brilho e informações do computador
src-tauri/
  tauri.linux.conf.json    pacotes rpm e AppImage
  src/
    barra_linux.rs         substitui barra_windows.rs
    janela_frente_linux.rs substitui janela_frente.rs
    miniaturas_linux.rs    substitui miniaturas.rs
```

## Para quem for mexer no código

- No `Cargo.toml`, o crate `windows` fica só em `[target.'cfg(windows)'.dependencies]`. Todo `use windows::...` precisa de `#[cfg(windows)]` e de uma versão para Linux ao lado.
- Os módulos `barra_windows`, `janela_frente` e `miniaturas` são trocados por `*_linux.rs` com `#[path]`, mantendo a mesma interface.
- No Linux, **não chame** `set_ignore_cursor_events` em janela escondida: o `tao` falha. Use `ignorar_cursor` em `lib.rs`.
- Na ponte, desvie por `process.platform === "linux"` e mantenha o caminho do Windows intacto.
- Imports relativos em `servidor/` terminam em `.ts`, exigência do carregador nativo do Vite.
- O dock só filtra apps por monitor quando o sistema informa o monitor de cada janela (`Dock.tsx`); no Linux a lista aparece inteira.

## Licença

Copyright (c) 2026 [vitorcgo](https://github.com/vitorcgo). Todos os direitos reservados.

O código é público apenas para consulta e **não é código aberto**. Esta adaptação não altera a licença: modificar, redistribuir ou publicar qualquer parte depende de autorização por escrito do autor. Os termos completos estão em [LICENSE.md](LICENSE.md).
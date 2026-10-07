import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createServer as criarServidorHttp } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";

const raizTemporaria = mkdtempSync(join(tmpdir(), "niko-claude-teste-"));
process.env.USERPROFILE = raizTemporaria;
process.env.HOME = raizTemporaria;
process.env.APPDATA = join(raizTemporaria, "AppData");
process.env.XDG_DATA_HOME = join(raizTemporaria, ".local", "share");
process.env.NIKO_PORTA = "47999";
const memoriaLocal = new Map();
globalThis.localStorage ??= { getItem: (k) => memoriaLocal.get(k) ?? null, setItem: (k, v) => memoriaLocal.set(k, String(v)), removeItem: (k) => memoriaLocal.delete(k) };

const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
const claude = await vite.ssrLoadModule("/servidor/claude.ts");
const { useClaudeCode } = await vite.ssrLoadModule("/src/estado/claudeCode.ts");
const pastaClaude = join(raizTemporaria, ".claude");
const settings = join(pastaClaude, "settings.json");
const lerSettings = () => JSON.parse(readFileSync(settings, "utf8"));
const pastaDeDados = join(process.platform === "win32" ? process.env.APPDATA : process.env.XDG_DATA_HOME, "com.niko.desktop");
const segredo = () => JSON.parse(readFileSync(join(pastaDeDados, "gancho-claude.json"), "utf8")).segredo;

let servidor;
let base;
before(async () => {
  servidor = criarServidorHttp((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/ponte/claude/evento") return void claude.receberEventoDoGancho(req, res);
    if (url.pathname === "/ponte/claude/eventos") return void claude.ouvirEventos(req, res);
    res.statusCode = 404;
    res.end();
  });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(async () => {
  servidor.closeAllConnections?.();
  await new Promise((r) => servidor.close(r));
  await vite.close();
  rmSync(raizTemporaria, { recursive: true, force: true });
});

test("instala os ganchos num settings.json que ainda não existe", () => {
  rmSync(pastaClaude, { recursive: true, force: true });
  const r = claude.instalarGanchos({ confirmacao: "INSTALAR" });
  assert.equal(r.copia, null);
  const dados = lerSettings();
  for (const evento of claude.EVENTOS_INSTALADOS) {
    const gancho = dados.hooks[evento][0].hooks[0];
    assert.equal(gancho.type, "http");
    assert.equal(gancho.url, "http://127.0.0.1:47999/ponte/claude/evento");
    assert.equal(gancho.headers["x-niko-gancho"], segredo());
    assert.equal(gancho.timeout, evento === "PermissionRequest" ? 120 : 5);
  }
  assert.equal(claude.estadoDaInstalacao().instalado, true);
});

test("preserva o que já existia, faz cópia e não duplica ao reinstalar", () => {
  mkdirSync(pastaClaude, { recursive: true });
  const original = { model: "opus", permissions: { allow: ["Bash(npm test)"] }, hooks: { Stop: [{ hooks: [{ type: "command", command: "echo fim" }] }], PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "checar.sh" }] }] } };
  writeFileSync(settings, JSON.stringify(original, null, 2));
  const r1 = claude.instalarGanchos({ confirmacao: "INSTALAR" });
  claude.instalarGanchos({ confirmacao: "INSTALAR" });
  assert.ok(r1.copia && existsSync(r1.copia));
  const dados = lerSettings();
  assert.equal(dados.model, "opus");
  assert.deepEqual(dados.permissions, original.permissions);
  assert.equal(dados.hooks.Stop.length, 2);
  assert.equal(dados.hooks.Stop[0].hooks[0].command, "echo fim");
  assert.equal(dados.hooks.PreToolUse[0].matcher, "Bash");
  assert.equal(dados.hooks.PreToolUse.filter((g) => g.hooks.some((h) => h.type === "http")).length, 1);
});

test("remover tira só as entradas do Niko", () => {
  claude.removerGanchos({ confirmacao: "REMOVER" });
  const dados = lerSettings();
  assert.equal(dados.model, "opus");
  assert.deepEqual(Object.keys(dados.hooks).sort(), ["PreToolUse", "Stop"]);
  assert.equal(dados.hooks.Stop[0].hooks[0].command, "echo fim");
  assert.equal(claude.estadoDaInstalacao().instalado, false);
  assert.ok(readdirSync(pastaClaude).some((n) => n.endsWith(".bak")));
});

test("recusa mexer num settings.json inválido e não altera o arquivo", () => {
  writeFileSync(settings, "{ isso não é json");
  assert.throws(() => claude.instalarGanchos({ confirmacao: "INSTALAR" }), /settings_invalido/);
  assert.equal(readFileSync(settings, "utf8"), "{ isso não é json");
  assert.equal(claude.estadoDaInstalacao().invalido, true);
  rmSync(settings);
});

test("exige confirmação explícita", () => {
  assert.throws(() => claude.instalarGanchos({}), /confirmacao_invalida/);
  assert.throws(() => claude.removerGanchos({ confirmacao: "sim" }), /confirmacao_invalida/);
});

test("a prévia esconde o segredo", () => {
  const p = claude.previaDaInstalacao("instalar");
  assert.ok(!p.proposto.includes(segredo()));
  assert.ok(p.proposto.includes("••••••••"));
});

const enviar = (corpo, cabecalhos = {}) => fetch(`${base}/ponte/claude/evento`, { method: "POST", headers: { "content-type": "application/json", ...cabecalhos }, body: JSON.stringify(corpo) });

test("rejeita evento sem o segredo certo", async () => {
  assert.equal((await enviar({ hook_event_name: "Stop" })).status, 403);
  assert.equal((await enviar({ hook_event_name: "Stop" }, { "x-niko-gancho": "errado" })).status, 403);
});

test("sem a ilha ouvindo, o pedido de permissão volta vazio na hora", async () => {
  const r = await enviar({ hook_event_name: "PermissionRequest", session_id: "s1", tool_name: "Bash", tool_input: { command: "ls" } }, { "x-niko-gancho": segredo() });
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "");
});

test("com a ilha ouvindo, Permitir devolve a decisão no formato documentado", async () => {
  const controle = new AbortController();
  const fluxo = await fetch(`${base}/ponte/claude/eventos`, { signal: controle.signal });
  const leitor = fluxo.body.getReader();
  const decodificador = new TextDecoder();
  let buffer = "";
  const proximoPedido = async () => {
    for (;;) {
      const linhas = buffer.split("\n");
      for (const l of linhas) {
        if (!l.trim()) continue;
        const e = JSON.parse(l);
        if (e.evento === "PermissionRequest" && e.pedidoId && e.sessao === "s2") return e;
      }
      const { value } = await leitor.read();
      buffer += decodificador.decode(value, { stream: true });
    }
  };
  const resposta = enviar({ hook_event_name: "PermissionRequest", session_id: "s2", cwd: "C:\\projetos\\niko", tool_name: "Bash", tool_input: { command: "npm test" } }, { "x-niko-gancho": segredo() });
  const pedido = await proximoPedido();
  assert.equal(pedido.dados.tool_input.command, "npm test");
  claude.decidirPedido({ pedidoId: pedido.pedidoId, decisao: "allow" });
  const r = await resposta;
  assert.deepEqual(await r.json(), { hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow" } } });
  assert.throws(() => claude.decidirPedido({ pedidoId: pedido.pedidoId, decisao: "deny" }), /pedido_expirou/);
  controle.abort();
});

test("descarta campos enormes e recorta textos longos", async () => {
  const r = await enviar({ hook_event_name: "PreToolUse", session_id: "s3", tool_name: "Read", tool_input: { file_path: "a.ts" }, tool_response: "x".repeat(50000), transcript_path: "C:\\segredo.jsonl", extra: "y".repeat(9000) }, { "x-niko-gancho": segredo() });
  assert.equal(r.status, 200);
  const controle = new AbortController();
  const fluxo = await fetch(`${base}/ponte/claude/eventos`, { signal: controle.signal });
  const leitor = fluxo.body.getReader();
  let texto = "";
  while (!texto.includes("NikoConectado")) texto += new TextDecoder().decode((await leitor.read()).value);
  controle.abort();
  const evento = texto.split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((e) => e.sessao === "s3");
  assert.equal(evento.dados.tool_response, undefined);
  assert.equal(evento.dados.transcript_path, undefined);
  assert.ok(evento.dados.extra.length < 4100);
});

test("corta objetos aninhados fundo demais em vez de guardar tudo na memória", async () => {
  let fundo = { valor: "fim" };
  for (let i = 0; i < 30; i++) fundo = { dentro: fundo };
  const r = await enviar({ hook_event_name: "PreToolUse", session_id: "s-fundo", tool_name: "Read", tool_input: { file_path: "a.ts", fundo } }, { "x-niko-gancho": segredo() });
  assert.equal(r.status, 200);
  const controle = new AbortController();
  const fluxo = await fetch(`${base}/ponte/claude/eventos`, { signal: controle.signal });
  const leitor = fluxo.body.getReader();
  let texto = "";
  while (!texto.includes("NikoConectado")) texto += new TextDecoder().decode((await leitor.read()).value);
  controle.abort();
  const evento = texto.split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((e) => e.sessao === "s-fundo");
  assert.equal(evento.dados.tool_input.file_path, "a.ts");
  assert.ok(!JSON.stringify(evento.dados).includes("fim"));
});

test("recusa hooks com formato inesperado em vez de apagar", () => {
  mkdirSync(pastaClaude, { recursive: true });
  writeFileSync(settings, JSON.stringify({ hooks: ["algo"] }));
  assert.throws(() => claude.instalarGanchos({ confirmacao: "INSTALAR" }), /settings_invalido/);
  assert.deepEqual(lerSettings(), { hooks: ["algo"] });
  writeFileSync(settings, "{}");
});

test("detecta conexão desatualizada quando o segredo não bate", () => {
  claude.instalarGanchos({ confirmacao: "INSTALAR" });
  const dados = lerSettings();
  dados.hooks.Stop[0].hooks[0].headers["x-niko-gancho"] = "outro";
  writeFileSync(settings, JSON.stringify(dados));
  const estado = claude.estadoDaInstalacao();
  assert.equal(estado.desatualizado, true);
  assert.equal(estado.instalado, false);
  claude.instalarGanchos({ confirmacao: "INSTALAR" });
  assert.equal(claude.estadoDaInstalacao().desatualizado, false);
  assert.ok(!readdirSync(pastaClaude).some((n) => n.endsWith(".niko-gravando")));
});

test("devolver ao terminal responde vazio para o Claude Code perguntar lá", async () => {
  const controle = new AbortController();
  const fluxo = await fetch(`${base}/ponte/claude/eventos`, { signal: controle.signal });
  const leitor = fluxo.body.getReader();
  let buffer = "";
  const resposta = enviar({ hook_event_name: "PermissionRequest", session_id: "s4", tool_name: "Bash", tool_input: { command: "npm run build" } }, { "x-niko-gancho": segredo() });
  let pedido;
  while (!pedido) {
    buffer += new TextDecoder().decode((await leitor.read()).value);
    pedido = buffer.split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((e) => e.sessao === "s4" && e.pedidoId);
  }
  claude.decidirPedido({ pedidoId: pedido.pedidoId, decisao: "terminal" });
  const r = await resposta;
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "");
  assert.throws(() => claude.decidirPedido({ pedidoId: "x", decisao: "talvez" }), /decisao_invalida/);
  controle.abort();
});

test("sempre permitir só aceita a regra sugerida pelo Claude Code", async () => {
  const controle = new AbortController();
  const fluxo = await fetch(`${base}/ponte/claude/eventos`, { signal: controle.signal });
  const leitor = fluxo.body.getReader();
  let buffer = "";
  const sugestoes = [{ type: "allow", rules: ["Bash(npm *)"], toolName: "Bash", behavior: "allow" }];
  const resposta = enviar({ hook_event_name: "PermissionRequest", session_id: "s6", tool_name: "Bash", tool_input: { command: "npm test" }, permission_suggestions: sugestoes }, { "x-niko-gancho": segredo() });
  let pedido;
  while (!pedido) {
    buffer += new TextDecoder().decode((await leitor.read()).value);
    pedido = buffer.split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((e) => e.sessao === "s6" && e.pedidoId);
  }
  assert.throws(() => claude.decidirPedido({ pedidoId: pedido.pedidoId, decisao: "allow", regra: { toolName: "Bash", ruleContent: "*" } }), /regra_invalida/);
  assert.throws(() => claude.decidirPedido({ pedidoId: pedido.pedidoId, decisao: "deny", regra: { toolName: "Bash", ruleContent: "npm *" } }), /decisao_invalida/);
  claude.decidirPedido({ pedidoId: pedido.pedidoId, decisao: "allow", regra: { toolName: "Bash", ruleContent: "npm *" } });
  assert.deepEqual(await (await resposta).json(), {
    hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow", updatedPermissions: [{ type: "allow", toolName: "Bash", ruleContent: "npm *", behavior: "allow", mode: "local", directories: [] }] } },
  });
  controle.abort();
});

test("abrir projeto recusa pastas que não vieram de uma sessão", () => {
  assert.throws(() => claude.abrirProjeto({ cwd: "C:\\Windows", como: "pasta" }), /projeto_desconhecido/);
  assert.throws(() => claude.abrirProjeto({ cwd: raizTemporaria, como: "pasta" }), /projeto_desconhecido/);
});

test("abrir projeto recusa caminho relativo mesmo vindo de uma sessão", async () => {
  const r = await enviar({ hook_event_name: "SessionStart", session_id: "s-relativo", cwd: "." }, { "x-niko-gancho": segredo() });
  assert.equal(r.status, 200);
  assert.throws(() => claude.abrirProjeto({ cwd: ".", como: "pasta" }), /projeto_desconhecido/);
});

test("diff marca linhas removidas e adicionadas", async () => {
  const { linhasDoDiff, alteracaoDaFerramenta, contarMudancas } = await vite.ssrLoadModule("/src/utilitarios/diff.ts");
  const linhas = linhasDoDiff("a\nb\nc", "a\nB\nc\nd");
  assert.deepEqual(linhas.map((l) => `${l.tipo}:${l.texto}`), ["igual:a", "menos:b", "mais:B", "igual:c", "mais:d"]);
  const alteracao = alteracaoDaFerramenta("Edit", { file_path: "C:\\p\\a.ts", old_string: "x", new_string: "y\nz" });
  assert.deepEqual(contarMudancas(alteracao), { mais: 2, menos: 1 });
  assert.equal(alteracaoDaFerramenta("Write", { file_path: "b.ts", content: "1\n2" }).novo, true);
  assert.equal(alteracaoDaFerramenta("Bash", { command: "ls" }), undefined);
});

test("evento repetido numa reconexão não duplica a atividade", () => {
  const evento = { id: "evento-unico", recebidoEm: new Date().toISOString(), evento: "PreToolUse", sessao: "s5", cwd: "C:\\projetos\\app", dados: { tool_name: "Bash", tool_input: { command: "npm test" } } };
  useClaudeCode.getState().aplicar(evento);
  useClaudeCode.getState().aplicar(evento);
  const sessao = useClaudeCode.getState().sessoes.s5;
  assert.equal(sessao.passos.length, 1);
  assert.equal(sessao.ferramentasUsadas, 1);
  assert.equal(sessao.projeto, "app");
});

test("sessão encerrada some da ilha e aba fechada não volta com eventos antigos", () => {
  const { aplicar, fechar } = useClaudeCode.getState();
  const antes = new Date(Date.now() - 60_000).toISOString();
  aplicar({ id: "s7-inicio", recebidoEm: antes, evento: "SessionStart", sessao: "s7", cwd: "C:\\projetos\\app", dados: {} });
  aplicar({ id: "s8-inicio", recebidoEm: antes, evento: "SessionStart", sessao: "s8", cwd: "C:\\projetos\\app", dados: {} });
  assert.ok(useClaudeCode.getState().sessoes.s7);
  aplicar({ id: "s7-fim", recebidoEm: antes, evento: "SessionEnd", sessao: "s7", cwd: "C:\\projetos\\app", dados: { reason: "clear" } });
  assert.equal(useClaudeCode.getState().sessoes.s7, undefined);
  assert.ok(!useClaudeCode.getState().ordem.includes("s7"));
  fechar("s8");
  aplicar({ id: "s8-antigo", recebidoEm: antes, evento: "PreToolUse", sessao: "s8", cwd: "C:\\projetos\\app", dados: { tool_name: "Read", tool_input: { file_path: "a.ts" } } });
  assert.equal(useClaudeCode.getState().sessoes.s8, undefined);
  aplicar({ id: "s8-novo", recebidoEm: new Date(Date.now() + 1000).toISOString(), evento: "UserPromptSubmit", sessao: "s8", cwd: "C:\\projetos\\app", dados: { prompt: "continua" } });
  assert.ok(useClaudeCode.getState().sessoes.s8);
});

test("pedido que sai da ilha sem decisão deixa o motivo na atividade", () => {
  const agora = new Date().toISOString();
  const { aplicar } = useClaudeCode.getState();
  aplicar({ id: "pedido-1", recebidoEm: agora, evento: "PermissionRequest", sessao: "s6", cwd: "C:\\projetos\\app", pedidoId: "p-6", dados: { tool_name: "Bash", tool_input: { command: "npm test" } } });
  assert.equal(useClaudeCode.getState().pedidos.filter((p) => p.pedidoId === "p-6").length, 1);
  aplicar({ id: "fim-1", recebidoEm: agora, evento: "NikoPedidoEncerrado", sessao: "s6", cwd: "", pedidoId: "p-6", dados: { motivo: "expirou", decisao: null } });
  const estado = useClaudeCode.getState();
  assert.equal(estado.pedidos.filter((p) => p.pedidoId === "p-6").length, 0);
  assert.equal(estado.sessoes.s6.estado, "trabalhando");
  assert.match(estado.sessoes.s6.passos.at(-1).rotulo, /110 segundos/);
  aplicar({ id: "pedido-2", recebidoEm: agora, evento: "PermissionRequest", sessao: "s6", cwd: "C:\\projetos\\app", pedidoId: "p-7", dados: { tool_name: "Bash", tool_input: { command: "ls" } } });
  const passosAntes = useClaudeCode.getState().sessoes.s6.passos.length;
  aplicar({ id: "fim-2", recebidoEm: agora, evento: "NikoPedidoEncerrado", sessao: "s6", cwd: "", pedidoId: "p-7", dados: { motivo: "decidido", decisao: "allow" } });
  assert.equal(useClaudeCode.getState().sessoes.s6.passos.length, passosAntes);
});

test("lê o modelo da última resposta no fim do transcript", () => {
  const caminho = join(raizTemporaria, "sessao.jsonl");
  const linhas = [
    { type: "assistant", message: { model: "claude-sonnet-4-5-20250929" } },
    { type: "user", message: { content: "troca o modelo" } },
    { type: "assistant", message: { model: "<synthetic>" } },
    { type: "assistant", message: { model: "claude-opus-4-7" } },
    { type: "system", content: "fim" },
  ];
  writeFileSync(caminho, `${"x".repeat(300 * 1024)}\n${linhas.map((l) => JSON.stringify(l)).join("\n")}\n`);
  assert.equal(claude.modeloDoTranscript(caminho), "claude-opus-4-7");
  assert.equal(claude.modeloDoTranscript("relativo.jsonl"), undefined);
  assert.equal(claude.modeloDoTranscript(join(raizTemporaria, "nao-existe.jsonl")), undefined);
  assert.equal(claude.modeloDoTranscript(join(raizTemporaria, "settings.txt")), undefined);
});

test("mostra o modelo com nome legível", async () => {
  const { nomeDoModelo } = await vite.ssrLoadModule("/src/estado/claudeCode.ts");
  assert.equal(nomeDoModelo("claude-opus-4-7[1m]"), "Opus 4.7");
  assert.equal(nomeDoModelo("claude-sonnet-4-5-20250929"), "Sonnet 4.5");
  assert.equal(nomeDoModelo("claude-opus-4-20250514"), "Opus 4");
  assert.equal(nomeDoModelo("claude-3-5-haiku-20241022"), "Haiku 3.5");
  assert.equal(nomeDoModelo("gpt-5-codex"), "gpt-5-codex");
});

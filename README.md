# Farol IA Local

Aplicativo desktop para instalar, executar e conversar com modelos de IA no próprio computador usando [Ollama](https://ollama.com). O projeto prioriza privacidade, funcionamento local, controle humano sobre ferramentas e adaptação ao hardware disponível.

> Projeto em desenvolvimento. Revise cuidadosamente comandos de terminal e mantenha cópias de segurança dos seus arquivos.

## Recursos

- chat local pela API do Ollama em `http://127.0.0.1:11434`;
- instalação, listagem e remoção de modelos Ollama;
- catálogo com estimativa de compatibilidade baseada em RAM, VRAM e contexto;
- suporte a modelos como Qwen, DeepSeek R1, Gemma, Mistral e outros nomes válidos do Ollama;
- perfis Econômico, Equilibrado e Desempenho;
- criação de variantes personalizadas por instrução de sistema e exemplos;
- conversas nomeadas, salvas somente quando o usuário solicita;
- ferramenta PowerShell opcional para modelos com *tool calling*;
- confirmação humana individual antes de cada comando;
- autorização de uso único com expiração e auditoria local;
- sincronização de modelos e contexto com projetos do VS Code por meio do Continue;
- indicador permanente do estado de rede;
- diagnóstico do Guardião de rede nativo para Windows.

## Estado de segurança

O chat com modelos instalados é enviado somente ao Ollama local. A janela Electron bloqueia navegação externa e executa com isolamento de contexto, sandbox e integração Node.js desativada.

O terminal da IA é opcional e vem desligado. Quando habilitado:

- cada comando é mostrado antes da execução;
- o usuário precisa autorizar cada uso;
- o token de autorização vale uma única vez e expira;
- comandos executam sem perfil interativo, com limite de 30 segundos e 64 KB de saída;
- resultados brutos do terminal não entram nas conversas salvas.

O Guardião WFP ainda está em modo de diagnóstico. Portanto, comandos autorizados executam com as permissões e o acesso de rede normais da conta do Windows. O aplicativo ainda não garante isolamento de rede por processo. Não autorize comandos que você não compreende.

## Requisitos

- Windows 10 ou 11;
- Node.js 22 ou superior;
- Ollama instalado e em execução;
- pelo menos um modelo local para conversar;
- .NET SDK 9 apenas para compilar o Guardião nativo.

Modelos maiores precisam de mais memória. A classificação exibida pelo aplicativo é uma estimativa, não uma garantia. Quantização, tamanho do contexto e programas abertos também afetam o consumo.

## Instalação

```powershell
git clone <URL-DO-REPOSITORIO>
cd farol-ia-local
npm install
npm start
```

Confirme que o Ollama está ativo:

```powershell
ollama --version
ollama list
```

Caso `ollama` não seja reconhecido no PowerShell, adicione a pasta de instalação ao `PATH` do usuário. Na instalação padrão do Windows ela costuma ser `%LOCALAPPDATA%\Programs\Ollama`.

## Modelos

Na tela **Modelos**, clique em um cartão para preencher automaticamente o identificador correto do repositório. Também é possível informar qualquer nome válido reconhecido pelo Ollama, por exemplo:

```text
deepseek-r1:8b
deepseek-r1:14b
deepseek-r1:32b
qwen3:8b
qwen2.5-coder:7b
gemma3:4b
mistral:7b
```

O download inicial requer internet. Depois de instalado, o modelo pode conversar localmente.

## Conversas salvas

Use os controles **Salvar**, **Abrir**, **Nova** e **Excluir** na tela de conversa. O salvamento não é automático. O aplicativo preserva mensagens de usuário, assistente e sistema, mas exclui erros e resultados brutos de ferramentas.

Os dados ficam na pasta de dados do aplicativo, fora do repositório. Arquivos como `conversations.json`, `config.json` e `security-audit.jsonl` são ignorados pelo Git.

## VS Code e Continue

Para usar os modelos locais no VS Code quando serviços online estiverem indisponíveis:

1. instale a extensão [Continue](https://marketplace.visualstudio.com/items?itemName=Continue.continue);
2. no Farol, abra **Configurações → Sincronizar com VS Code**;
3. escolha a pasta do projeto;
4. opcionalmente selecione uma conversa salva como contexto;
5. clique em **Integrar e abrir no VS Code**;
6. o Farol tentará instalar o Continue, configurar uma instalação nova e abrir o guia `.continue/FAROL-VSCODE.md`.

O Farol gera uma configuração que aponta para `127.0.0.1:11434` e uma regra de contexto em `.continue/rules`. Se já existir uma configuração global do Continue, ela é preservada e o guia explica como mesclar os modelos.

Para tarefas com arquivos e terminal, use o modo Agent do Continue e mantenha a confirmação de ferramentas ativada.

## Laboratório de personalização

O Laboratório cria uma variante Ollama com instrução de sistema, personalidade, temperatura e exemplos. Isso configura o comportamento do modelo; não realiza treinamento de pesos, LoRA ou QLoRA.

## Guardião de rede

O componente em `native/Farol.NetworkGuardian` diagnostica recursos do Windows Filtering Platform, elevação e APIs de isolamento. O serviço e os filtros de bloqueio ainda não são instalados automaticamente.

Para compilar e consultar o diagnóstico:

```powershell
dotnet build native/Farol.NetworkGuardian/Farol.NetworkGuardian.csproj -c Release
dotnet native/Farol.NetworkGuardian/bin/Release/net9.0-windows/Farol.NetworkGuardian.dll status
```

## Desenvolvimento e testes

```powershell
npm run check
npm test
```

```text
native/Farol.NetworkGuardian/  Componente nativo e planejamento WFP
src/main/                     Processo principal, Ollama e persistência
src/renderer/                 Interface Electron
src/shared/                   Catálogo e recomendações
test/                         Testes automatizados
```

## Dados que não devem ser publicados

Antes de enviar alterações ao Git, confira `git status`. Não adicione:

- conversas exportadas ou bases de conhecimento pessoais;
- arquivos `.env`, chaves, certificados ou tokens;
- auditorias contendo comandos executados;
- modelos locais ou arquivos de pesos;
- pastas `.continue` geradas com contexto privado;
- configurações do editor que revelem caminhos locais.

O `.gitignore` cobre os formatos comuns, mas não substitui uma revisão antes de cada commit.

## Limitações atuais

- suporte principal voltado ao Windows;
- o isolamento WFP ainda não está ativo;
- qualidade e suporte a ferramentas variam por modelo;
- modelos grandes podem não carregar em máquinas com pouca RAM ou VRAM;
- a configuração gerada para o Continue exige ativação inicial no editor.

## Uso responsável

Use terminal, automação e testes de segurança somente em computadores e sistemas próprios ou com autorização explícita. O usuário continua responsável por revisar comandos e alterações produzidos pelos modelos.

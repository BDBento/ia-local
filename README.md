# Farol IA Local

Aplicativo desktop para executar e conversar com modelos de inteligência artificial no próprio computador. O projeto prioriza privacidade, funcionamento offline, liberdade para instalar modelos compatíveis com o Ollama e adaptação a máquinas com diferentes quantidades de RAM, VRAM e núcleos de CPU.

> Estado do projeto: versão `0.6.0`, em desenvolvimento. O chat, o gerenciamento de modelos, as recomendações de hardware e a personalização de modelos já funcionam. O acesso da IA ao terminal continua bloqueado até a conclusão do Guardião nativo de rede.

## Recursos implementados

- chat local pelo Ollama em `http://127.0.0.1:11434`;
- farol de rede permanentemente visível;
- bloqueio de requisições externas do Electron no modo offline estrito;
- detecção de CPU, RAM e GPUs;
- limites configuráveis de RAM, VRAM, GPU, threads, contexto e permanência na memória;
- perfis Econômico, Equilibrado e Desempenho;
- recomendações de modelos conforme o orçamento de hardware;
- instalação de qualquer modelo com nome válido no Ollama;
- listagem, progresso de download e exclusão de modelos;
- laboratório para criar variantes personalizadas;
- diagnóstico nativo das capacidades de segurança do Windows;
- autorização humana obrigatória para downloads, com token de uso único e expiração;
- auditoria local das solicitações, decisões e usos de autorização;
- configurações armazenadas localmente.

## Modelos

O catálogo de recomendações não limita os modelos aceitos. É possível informar manualmente qualquer nome válido reconhecido pelo Ollama, por exemplo:

```text
qwen3:8b
qwen2.5-coder:7b
dolphin-mistral:7b
usuario/modelo-personalizado:q4_K_M
```

O modelo precisa existir em um registro acessível ao Ollama para ser baixado. Depois de instalado, o chat utiliza a cópia local.

Modelos descritos como *uncensored* ou “com menos recusas” podem ser mais permissivos, mas o comportamento depende do treinamento, da quantização e da configuração de cada modelo. O Farol IA Local não remove limitações internas dos pesos.

## Laboratório de personalização

O Laboratório cria uma variante de um modelo instalado. É possível definir nome, instrução de sistema, personalidade, temperatura e um exemplo de pergunta e resposta.

A operação usa a API local de criação do Ollama e não altera os pesos do modelo original. É uma personalização de comportamento, não treinamento completo, LoRA ou QLoRA.

## Farol de rede

O indicador fica sempre visível no canto superior direito:

- **Verde — Offline protegido:** modo offline estrito ativo e nenhuma operação externa indicada.
- **Amarelo — Verificando:** o aplicativo está consultando o estado local.
- **Vermelho — Internet permitida/em uso:** modo offline desativado ou operação externa, como download de modelo, em andamento.

O download inicial de modelos necessita de internet. Conversas com modelos instalados usam somente o Ollama local.

## Guardião de rede

O componente nativo em .NET diagnostica recursos de segurança do Windows, incluindo Windows Filtering Platform (WFP), elevação administrativa e APIs de isolamento.

Na versão `0.6.0`, o Guardião está em modo `diagnostic-only`:

- política segura informada: negar rede por padrão;
- terminal da IA bloqueado;
- o modelo não pode autorizar a própria rede;
- falhas no componente mantêm o terminal bloqueado;
- downloads exigem confirmação explícita para o modelo solicitado;
- a autorização vale uma vez e precisa ser usada em até 60 segundos;
- o token secreto não é salvo na auditoria;
- o planejador valida a identidade WFP de executáveis sem aplicar regras;
- o host de serviço implementa os estados de início, execução bloqueada, parada e encerramento;
- o host se recusa a executar fora do Gerenciador de Serviços;
- o instalador exige elevação, confirmação textual e binário publicado em C:\\Program Files\\Farol IA Local\\Guardian;
- o serviço é registrado inicialmente em modo manual, sem iniciar e sem instalar filtros;
- a remoção emergencial pode parar e excluir o serviço;
- nenhuma regra do Firewall do Windows é modificada.

O planejador WFP já valida executáveis e produz uma impressão da identidade usada pelas camadas ALE. O bloqueio por processo e a autorização temporária ainda dependem da instalação do Guardião como serviço do Windows. A interface atual não garante o isolamento de todo o computador nem do processo separado do Ollama.

## Hardware planejado

Configuração inicialmente planejada para uso:

- Intel Core i5-12400F;
- NVIDIA GeForce RTX 3060 Ti com 8 GB de VRAM;
- 16 GB de RAM;
- SSD de 1 TB.

Essa configuração tende a favorecer modelos quantizados de 4B a 8B parâmetros. A compatibilidade varia conforme quantização, contexto, memória livre e outros programas. As recomendações usam margem de segurança, mas o teste real ainda é necessário.

## Requisitos

Para executar:

- Windows 10 ou 11;
- Node.js 22 ou superior;
- Ollama instalado e em execução;
- pelo menos um modelo local para o chat.

Para compilar o Guardião: .NET SDK 9.

## Instalação e execução

```powershell
npm install
npm start
```

`npm start` abre o aplicativo em modo de desenvolvimento e não o cadastra para iniciar automaticamente com o Windows.

Um modelo pode ser instalado pela tela **Modelos** ou pelo terminal:

```powershell
ollama pull qwen3:4b
```

## Guardião: compilação e diagnóstico

```powershell
dotnet build native/Farol.NetworkGuardian/Farol.NetworkGuardian.csproj -c Release
dotnet native/Farol.NetworkGuardian/bin/Release/net9.0-windows/Farol.NetworkGuardian.dll status
```

## Validação

```powershell
npm run check
npm test
```

Os testes cobrem nomes de modelos, recomendações por RAM e VRAM, modo somente CPU, reserva de memória conforme o contexto e falha segura do Guardião.

## Privacidade e segurança

- O chat se comunica apenas com `127.0.0.1`.
- A janela usa isolamento de contexto, sandbox e integração Node.js desativada.
- Navegação externa e novas janelas são recusadas.
- As mensagens permanecem na memória da sessão atual.
- As configurações são salvas localmente.
- Eventos de autorização são acrescentados ao arquivo local security-audit.jsonl.
- Baixar um modelo exige acesso externo pelo processo do Ollama.

O bloqueio do Electron não controla sozinho outros processos. A proteção completa dependerá do enforcer nativo do Guardião, ainda em desenvolvimento.

## Estrutura

```text
native/
  Farol.NetworkGuardian/  Diagnóstico nativo e futura política WFP
src/
  main/                   Electron, hardware, configuração, Ollama e Guardião
  renderer/               Interface
  shared/                 Catálogo e recomendações
test/                     Testes automatizados
```

## Próximas etapas

- criar instalação e remoção explícitas do serviço com UAC;
- implementar filtros WFP nas camadas ALE usando identidade do aplicativo e sessão dinâmica;
- exigir autorização humana para acesso externo;
- conceder permissões temporárias por processo e destino;
- registrar autorizações e revogações localmente;
- liberar o terminal somente após testes de bloqueio e revogação;
- empacotar o aplicativo para outras máquinas Windows;
- avaliar suporte futuro a LoRA/QLoRA.

## Aviso de uso responsável

O objetivo futuro inclui automação de testes de segurança em ambientes autorizados. Use modelos, terminal e ferramentas somente em sistemas próprios ou com permissão explícita.
